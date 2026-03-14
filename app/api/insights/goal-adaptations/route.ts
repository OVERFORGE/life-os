// app/api/insights/goal-adaptations/route.ts

import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { Goal } from "@/features/goals/models/Goal";
import { GoalStats } from "@/features/goals/models/GoalStats";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { LifeSettings } from "@/features/insights/models/LifeSettings";

import { analyzeGoalPressure } from "@/features/goals/engine/analyzeGoalPressure";
import { analyzeGlobalGoalLoad } from "@/features/goals/engine/analyzeGlobalGoalLoad";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";

import { goalAdaptationEngine } from "@/features/goals/engine/goalAdaptationEngine";

export async function GET() {
    console.log("GOAL ADAPTATIONS ROUTE HIT");
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  await connectDB();

  /* ------------------------------------------------ */
  /* Load Goals                                       */
  /* ------------------------------------------------ */

  const goals = await Goal.find({
    userId,
  }).lean();

  if (!goals.length) {
    return Response.json({
      ok: true,
      suggestions: [],
    });
  }

  /* ------------------------------------------------ */
  /* Load Stats                                       */
  /* ------------------------------------------------ */

  const goalIds = goals.map((g) => g._id);

  const stats = await GoalStats.find({
    goalId: { $in: goalIds },
  }).lean();

  const statMap = new Map(
    stats.map((s) => [String(s.goalId), s])
  );

  /* ------------------------------------------------ */
  /* Load Phase                                       */
  /* ------------------------------------------------ */

  const phaseDoc = await PhaseHistory.findOne({
    userId,
    endDate: null,
  }).lean();

  const phaseExplanation = phaseDoc
    ? {
        ...explainLifePhase(phaseDoc),
        phase: phaseDoc.phase,
      }
    : null;

  const phase = phaseExplanation?.phase ?? "balanced";

  /* ------------------------------------------------ */
  /* Load Settings                                    */
  /* ------------------------------------------------ */

  const settings = await LifeSettings.findOne({
    userId,
  }).lean();

  const weights =
    settings?.goalPressureWeights ?? {
      cadence: 0.25,
      energy: 0.25,
      stress: 0.25,
      phaseMismatch: 0.25,
    };

  /* ------------------------------------------------ */
  /* Compute Pressures                                */
  /* ------------------------------------------------ */

  const pressures = goals.map((goal) =>
    analyzeGoalPressure({
      goal,
      stats: statMap.get(String(goal._id)) || null,
      phase: phaseExplanation ?? { phase },
      weights,
    })
  );

  /* ------------------------------------------------ */
  /* Compute Global Load                              */
  /* ------------------------------------------------ */

  /* ------------------------------------------------ */
/* Compute Global Load From Pressures               */
/* ------------------------------------------------ */


const globalLoad = analyzeGlobalGoalLoad(pressures);

  /* ------------------------------------------------ */
  /* Run Adaptation Engine                            */
  /* ------------------------------------------------ */

  const suggestions = goalAdaptationEngine({
    goals,
    pressures,
    phase,
    globalLoad: globalLoad.global,
  });

  console.log("PHASE", phase)
  console.log("PRESSURES", pressures)
  console.log("GLOBAL LOAD", globalLoad)

  return Response.json({
    ok: true,
    suggestions,
  });
}