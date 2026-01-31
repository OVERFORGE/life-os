// app/api/dashboard/goal-load/route.ts

import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { Goal } from "@/features/goals/models/Goal";
import { GoalStats } from "@/features/goals/models/GoalStats";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";
import { analyzeGoalPressure } from "@/features/goals/engine/analyzeGoalPressure";
import { analyzeGlobalGoalLoad } from "@/features/goals/engine/analyzeGlobalGoalLoad";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const phase = await PhaseHistory.findOne({
    userId: session.user.id,
    endDate: null,
  })
    .sort({ startDate: -1 })
    .lean();

  if (!phase) {
    return Response.json({ error: "No phase found" }, { status: 404 });
  }

  const phaseExplanation = {
    ...explainLifePhase(phase),
    phase: phase.phase,
  };

  const goals = await Goal.find({ userId: session.user.id }).lean();
  const stats = await GoalStats.find({}).lean();
  const statMap = new Map(stats.map((s) => [String(s.goalId), s]));

  const pressures = goals.map((g) =>
    analyzeGoalPressure({
      goal: g,
      stats: statMap.get(String(g._id)) || null,
      phase: phaseExplanation,
    })
  );

  const global = analyzeGlobalGoalLoad(pressures);

  return Response.json({
    global,
    perGoal: pressures,
  });
}
