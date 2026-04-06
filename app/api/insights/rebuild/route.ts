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

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  await connectDB();

  const logs = await DailyLog.find({ userId })
    .sort({ date: 1 })
    .lean();

  if (!logs.length) {
    return Response.json({ ok: true, message: "No logs found" });
  }

  let settings = await LifeSettings.findOne({ userId });

  if (!settings) {
    settings = await LifeSettings.create({
      userId,
      baselines: computeBaselines(logs),
      learnedSensitivity: {
        sleepImpact: 1,
        stressImpact: 1,
        energyImpact: 1,
        moodImpact: 1,
      },
      goalPressureWeights: {
        cadence: 0.25,
        energy: 0.25,
        stress: 0.25,
        phaseMismatch: 0.25,
      },
      sensitivityHistory: [],
      goalLoadHistory: [],
    });
  }

  await PhaseHistory.deleteMany({ userId });

  let previousPhase = "balanced";
  let previousSnapshot: any = null;

  for (let i = 0; i < logs.length; i++) {
    const slice = logs.slice(0, i + 1);

    const state = await computeDailyState({
      userId,
      date: logs[i].date,
      logsUpToDate: slice,
      baselines: settings.baselines,
      sensitivity: settings.learnedSensitivity,
    });

    const currentPhase = state.phase ?? state.candidatePhase;

    const feedback = applyPhaseFeedback({
      previousPhase,
      currentPhase,
      snapshot: state.snapshot,
      currentSensitivity: settings.learnedSensitivity,
    });

    if (feedback.changed) {
      settings.learnedSensitivity = feedback.nextSensitivity;

      await LearningEvent.create({
        userId,
        type: "phase_sensitivity_update",
        before: {},
        after: feedback.nextSensitivity,
        reason: feedback.learningEvent?.reason || "auto",
        confidence: 0.6,
        driverSignal: previousPhase,
      });
    }

    previousPhase = currentPhase;
    previousSnapshot = state.snapshot;
  }

  const phases = await compressDailyStatesToPhases(userId);

  if (phases.length) {
    await PhaseHistory.insertMany(
      phases.map((p: any) => ({ userId, ...p }))
    );
  }

  const globalLoad = analyzeGlobalGoalLoad([]); // safe fallback

  const outcome = detectGoalLoadOutcome({
    globalScore: globalLoad.global.score,
    phase: previousPhase,
  });

  const learning = updateGoalLoadWeightsFromFeedback({
    outcome,
    currentWeights: settings.goalPressureWeights,
    confidence: globalLoad.global.score,
    persistenceDays: 5,
  });

  if (learning.changed) {
    settings.goalPressureWeights = learning.nextWeights;
  }

  await settings.save();

  return Response.json({
    ok: true,
    logsProcessed: logs.length,
    phasesCreated: phases.length,
    goalLoadMode: globalLoad.global.mode,
  });
}