import { connectDB } from "@/server/db/connect";
import { Goal } from "@/features/goals/models/Goal";
import { GoalStats } from "@/features/goals/models/GoalStats";
import { explainGoal } from "@/features/goals/engine/explainGoal";
import { analyzeGoalPressure } from "@/features/goals/engine/analyzeGoalPressure";
import { analyzeGlobalGoalLoad } from "@/features/goals/engine/analyzeGlobalGoalLoad";
import { adaptGoalToSystemState } from "@/features/goals/engine/adaptGoalToSystemState";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";
import { getAuthSession } from "@/lib/auth";
import { LifeSignal } from "@/features/signals/models/LifeSignal";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  await connectDB();

  // 1️⃣ Fetch goal
  const goal = await Goal.findOne({
    _id: id,
    userId: session.user.id,
  }).lean();

  if (!goal) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // 2️⃣ Stats + explanation
  const stats = await GoalStats.findOne({ goalId: goal._id }).lean();
  const explanation = await explainGoal(goal, session.user.id);

  // 3️⃣ Current phase
  const currentPhase = await PhaseHistory.findOne({
    userId: session.user.id,
    endDate: null,
  })
    .sort({ startDate: -1 })
    .lean();

  if (!currentPhase) {
    return Response.json({
      goal,
      stats,
      explanation,
      pressure: null,
      adaptation: null,
    });
  }

  const phaseExplanation = {
    ...explainLifePhase(currentPhase),
    phase: currentPhase.phase,
  };

  // 4️⃣ Pressure for THIS goal
  const pressure = analyzeGoalPressure({
    goal,
    stats,
    phase: phaseExplanation,
  });

  // 5️⃣ Pressure for ALL goals (global context)
  const allGoals = await Goal.find({ userId: session.user.id }).lean();
  const allStats = await GoalStats.find({}).lean();
  const statMap = new Map(allStats.map((s) => [String(s.goalId), s]));

  const allPressures = allGoals.map((g) =>
    analyzeGoalPressure({
      goal: g,
      stats: statMap.get(String(g._id)) || null,
      phase: phaseExplanation,
    })
  );

  // 6️⃣ Global load
  const globalLoad = analyzeGlobalGoalLoad(allPressures);

  // 7️⃣ Phase-aware adaptation v2
  const adaptation = adaptGoalToSystemState({
    goal,
    goalPressure: pressure,
    globalLoad,
    phase: phaseExplanation,
  });

  return Response.json({
    goal,
    stats,
    explanation,
    pressure,
    adaptation,
  });
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body: any = await req.json();
  await connectDB();

  const goal = await Goal.findOneAndUpdate(
    { _id: id, userId: session.user.id },
    {
      signals: body.signals,
      rules: body.rules,
    },
    { new: true }
  );

  if (!goal) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const goalToDelete = await Goal.findOne({ _id: id, userId: session.user.id });
  
  if (goalToDelete) {
      const signalKeys = goalToDelete.signals.map((s: any) => s.key);
      await Goal.deleteOne({ _id: id, userId: session.user.id });
      await GoalStats.deleteOne({ goalId: id });

      if (signalKeys.length > 0) {
          const remainingGoals = await Goal.find({ userId: session.user.id, "signals.key": { $in: signalKeys } });
          const usedKeys = new Set(remainingGoals.flatMap(g => g.signals.map((s: any) => s.key)));
          
          const orphanedKeys = signalKeys.filter((k: string) => !usedKeys.has(k));
          if (orphanedKeys.length > 0) {
              await LifeSignal.deleteMany({ userId: session.user.id, key: { $in: orphanedKeys } });
          }
      }
  }

  return Response.json({ ok: true });
}
