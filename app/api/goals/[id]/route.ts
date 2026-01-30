import { connectDB } from "@/server/db/connect";
import { Goal } from "@/features/goals/models/Goal";
import { GoalStats } from "@/features/goals/models/GoalStats";
import { explainGoal } from "@/features/goals/engine/explainGoal";
import { analyzeGoalPressure } from "@/features/goals/engine/analyzeGoalPressure";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  await connectDB();

  const goal = await Goal.findOne({
    _id: id,
    userId: session.user.id,
  }).lean();

  if (!goal)
    return Response.json({ error: "Not found" }, { status: 404 });

  const stats = await GoalStats.findOne({ goalId: goal._id }).lean();
  const explanation = await explainGoal(goal, session.user.id);

  // 🔹 Get current life phase
  const currentPhase = await PhaseHistory.findOne({
    userId: session.user.id,
    endDate: null,
  }).lean();

  let pressure = null;

  if (currentPhase) {
    const phaseExplanation = explainLifePhase(currentPhase);

    pressure = analyzeGoalPressure({
      goal,
      stats,
      phase: {
        ...phaseExplanation,
        phase: currentPhase.phase,
      },
    });
  }

  return Response.json({
    goal,
    stats,
    explanation,
    pressure, // ✅ THIS is what frontend was waiting for
  });
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = await req.json();

  await connectDB();

  const goal = await Goal.findOneAndUpdate(
    { _id: id, userId: session.user.id },
    {
      signals: body.signals,
      rules: body.rules,
    },
    { new: true }
  );

  if (!goal)
    return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ ok: true });
}
