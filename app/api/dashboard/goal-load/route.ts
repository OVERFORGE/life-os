// app/api/dashboard/goal-load/route.ts

import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { Goal } from "@/features/goals/models/Goal";
import { GoalStats } from "@/features/goals/models/GoalStats";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { LifeSettings } from "@/features/insights/models/LifeSettings";

import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";
import { analyzeGoalPressure } from "@/features/goals/engine/analyzeGoalPressure";
import { analyzeGlobalGoalLoad } from "@/features/goals/engine/analyzeGlobalGoalLoad";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  /* ---------------- Load Current Phase ---------------- */

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

  /* ---------------- Load Goal Weights ---------------- */

  const settings = await LifeSettings.findOne({
    userId: session.user.id,
  }).lean();

  const weights =
    settings?.goalPressureWeights ?? {
      cadence: 0.25,
      energy: 0.25,
      stress: 0.25,
      phaseMismatch: 0.25,
    };

  /* ---------------- Per Goal Pressure ---------------- */

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

  /* ---------------- Global Goal Load ---------------- */

  const globalLoad = await analyzeGlobalGoalLoad({
    userId: session.user.id,
    weights,
  });

  return Response.json({
    global: globalLoad.global,
    perGoal: pressures,
  });
}
