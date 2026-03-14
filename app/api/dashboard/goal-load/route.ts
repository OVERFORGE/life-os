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

/* ===================================================== */
/* GET — Dashboard Goal Load                             */
/* ===================================================== */

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  await connectDB();

  /* ===================================================== */
  /* 1️⃣ Load Current Phase                                */
  /* ===================================================== */

  const phase = await PhaseHistory.findOne({
    userId,
    endDate: null,
  })
    .sort({ startDate: -1 })
    .lean();

  if (!phase) {
    return Response.json(
      { error: "No active phase found" },
      { status: 404 }
    );
  }

  const phaseExplanation = {
    ...explainLifePhase(phase),
    phase: phase.phase,
  };

  /* ===================================================== */
  /* 2️⃣ Load Goal Pressure Weights                        */
  /* ===================================================== */

  const settings = await LifeSettings.findOne({ userId }).lean();

  const weights =
    settings?.goalPressureWeights ?? {
      cadence: 0.25,
      energy: 0.25,
      stress: 0.25,
      phaseMismatch: 0.25,
    };

  /* ===================================================== */
  /* 3️⃣ Load Goals + Stats                                */
  /* ===================================================== */

  const goals = await Goal.find({ userId }).lean();

  if (!goals.length) {
    return Response.json({
      ok: true,
      goalLoad: {
        global: {
          mode: "empty",
          score: 0,
          distribution: {
            aligned: 0,
            strained: 0,
            conflicting: 0,
            toxic: 0,
          },
        },
        perGoal: [],
      },
    });
  }

  const goalIds = goals.map((g) => g._id);

  const stats = await GoalStats.find({
    goalId: { $in: goalIds },
  }).lean();

  const statMap = new Map(stats.map((s) => [String(s.goalId), s]));

  /* ===================================================== */
  /* 4️⃣ Compute Per Goal Pressure                         */
  /* ===================================================== */

  const pressures = goals.map((goal) =>
    analyzeGoalPressure({
      goal,
      stats: statMap.get(String(goal._id)) || null,
      phase: phaseExplanation,
      weights, // ✅ IMPORTANT: actually pass weights in
    })
  );

  /* ===================================================== */
  /* 5️⃣ Compute Global Load                               */
  /* ===================================================== */

  const globalLoad = analyzeGlobalGoalLoad(pressures);

  /* ===================================================== */
  /* ✅ Final Response Shape (Stable Contract)             */
  /* ===================================================== */

  return Response.json({
    ok: true,
    goalLoad: {
      global: globalLoad.global,
      perGoal: pressures,
      topDrivers: globalLoad.topDrivers,
    },
  });
}
