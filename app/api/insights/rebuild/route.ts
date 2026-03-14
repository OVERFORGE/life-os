// app/api/insights/rebuild/route.ts

import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { DailyLog } from "@/server/db/models/DailyLog";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { LifeSettings } from "@/features/insights/models/LifeSettings";

import { computeBaselines } from "@/features/insights/engine/computeBaselines";
import { computeDailyState } from "@/features/insights/engine/computeDailyState";
import { compressDailyStatesToPhases } from "@/features/insights/engine/compressDailyStatesToPhases";
import { applyPhaseFeedback } from "@/features/insights/engine/applyPhaseFeedback";

import { analyzeGlobalGoalLoad } from "@/features/goals/engine/analyzeGlobalGoalLoad";
import { detectGoalLoadOutcome } from "@/features/goals/engine/detectGoalLoadOutcome";
import { updateGoalLoadWeightsFromFeedback } from "@/features/goals/engine/updateGoalLoadWeightsFromFeedback";

import { LearningEvent } from "@/features/learning/models/LearningEvent";

/* ---------------- Defaults ---------------- */

const DEFAULT_SENSITIVITY = {
  sleepImpact: 1,
  stressImpact: 1,
  energyImpact: 1,
  moodImpact: 1,
};

const DEFAULT_GOAL_WEIGHTS = {
  cadence: 0.25,
  energy: 0.25,
  stress: 0.25,
  phaseMismatch: 0.25,
};

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  await connectDB();

  /* ===================================================== */
  /* 1️⃣ Load Logs                                          */
  /* ===================================================== */

  const logs = await DailyLog.find({ userId })
    .sort({ date: 1 })
    .lean();

  if (!logs.length) {
    return Response.json({
      ok: true,
      message: "No logs found",
    });
  }

  /* ===================================================== */
  /* 2️⃣ Load Settings                                      */
  /* ===================================================== */

  let settings = await LifeSettings.findOne({ userId });

  if (!settings) {
    const baselines = computeBaselines(logs);

    settings = await LifeSettings.create({
      userId,
      baselines,
      learnedSensitivity: DEFAULT_SENSITIVITY,
      goalPressureWeights: DEFAULT_GOAL_WEIGHTS,
      sensitivityHistory: [],
      goalLoadHistory: [],
    });
  }

  /* ===================================================== */
  /* 3️⃣ Reset PhaseHistory                                 */
  /* ===================================================== */

  await PhaseHistory.deleteMany({ userId });

  /* ===================================================== */
  /* 4️⃣ Compute Daily States                               */
  /* ===================================================== */

  let previousPhase: string | null = null;
  let previousSnapshot: any = null;

  for (let i = 0; i < logs.length; i++) {
    const slice = logs.slice(0, i + 1);

    const state = computeDailyState({
      logs: slice,
      baselines: settings.baselines,
      sensitivity: settings.learnedSensitivity,
    });

    /* ---------------- Phase Learning ---------------- */

    const feedback = applyPhaseFeedback({
      previousPhase,
      previousSnapshot,
      currentPhase: state.phase,
      snapshot: state.snapshot,
      sensitivity: settings.learnedSensitivity,
    });

    if (feedback.changed) {
      const previousSensitivity = settings.learnedSensitivity;

      settings.learnedSensitivity = feedback.nextSensitivity;

      settings.sensitivityHistory.push({
        date: logs[i].date,
        before: previousSensitivity,
        after: feedback.nextSensitivity,
        reason: feedback.reason,
      });

      await LearningEvent.create({
        userId,
        type: "phase_sensitivity_update",
        before: previousSensitivity,
        after: feedback.nextSensitivity,
        reason: feedback.reason,
        confidence: 0.6,
        driverSignal: previousPhase ?? "unknown",
      });
    }

    previousPhase = state.phase;
    previousSnapshot = state.snapshot;
  }

  /* ===================================================== */
  /* 5️⃣ Compress Phases                                    */
  /* ===================================================== */

  const phases = await compressDailyStatesToPhases(userId);

  if (phases.length) {
    const docs = phases.map((p: any) => ({
      userId,
      ...p,
    }));

    await PhaseHistory.insertMany(docs);
  }

  /* ===================================================== */
  /* 6️⃣ Compute Global Goal Load                           */
  /* ===================================================== */

  const globalLoad = await analyzeGlobalGoalLoad({
    userId,
    weights: settings.goalPressureWeights,
  });

  /* ===================================================== */
  /* 7️⃣ Detect Outcome                                     */
  /* ===================================================== */

  const outcome = detectGoalLoadOutcome(globalLoad);

  /* ===================================================== */
  /* 8️⃣ Goal Load Learning                                 */
  /* ===================================================== */

  const previousWeights = settings.goalPressureWeights;

  const learning = updateGoalLoadWeightsFromFeedback({
    outcome,
    currentWeights: previousWeights,
    confidence: globalLoad.global.score,
  });

  if (learning.changed) {
    settings.goalPressureWeights = learning.nextWeights;

    settings.goalLoadHistory.push({
      date: new Date(),
      outcome,
      before: previousWeights,
      after: learning.nextWeights,
      reason: learning.reason,
    });

    await LearningEvent.create({
      userId,
      type: "goal_load_weight_update",
      before: previousWeights,
      after: learning.nextWeights,
      reason: learning.reason,
      confidence: globalLoad.global.score,
      driverSignal: outcome,
    });
  }

  /* ===================================================== */
  /* 9️⃣ Save Settings                                      */
  /* ===================================================== */

  await settings.save();

  /* ===================================================== */
  /* 🔟 Response                                           */
  /* ===================================================== */

  return Response.json({
    ok: true,
    logsProcessed: logs.length,
    phasesCreated: phases.length,
    goalLoadMode: globalLoad.global.mode,
  });
}