import { connectDB } from "@/server/db/connect";
import { Goal } from "@/features/goals/models/Goal";
import { GoalStats } from "@/features/goals/models/GoalStats";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { analyzeGoalPressure } from "@/features/goals/engine/analyzeGoalPressure";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return Response.json([], { status: 401 });

  await connectDB();

  const goals = await Goal.find({ userId: session.user.id }).lean();
  const stats = await GoalStats.find({}).lean();

  const statMap = new Map(stats.map((s) => [String(s.goalId), s]));

  // Get latest phase
  const currentPhase = await PhaseHistory.findOne({
    userId: session.user.id,
  })
    .sort({ createdAt: -1 })
    .lean();

  const phaseExplanation = currentPhase
    ? {
        ...explainLifePhase(currentPhase),
        phase: currentPhase.phase,
      }
    : null;

  const result = goals.map((g) => {
    const goalStats = statMap.get(String(g._id));

    const pressure = phaseExplanation
      ? analyzeGoalPressure({
          goal: g,
          stats: goalStats,
          phase: phaseExplanation,
        })
      : null;

    return {
      ...g,
      stats: goalStats,
      pressure: pressure
        ? {
            status: pressure.status,
            score: pressure.pressureScore,
          }
        : null,
    };
  });

  return Response.json(result);
}
