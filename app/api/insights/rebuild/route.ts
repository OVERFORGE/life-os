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

const DEFAULT_SENSITIVITY = {
  sleepImpact: 1,
  stressImpact: 1,
  energyImpact: 1,
  moodImpact: 1,
  goalPressureWeights: {
    cadence: 0.25,
    energy: 0.25,
    stress: 0.25,
    phaseMismatch: 0.25,
  },
};

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  await connectDB();

  const logs = await DailyLog.find({ userId }).sort({ date: 1 }).lean();
  if (!logs.length) {
    return Response.json({ ok: true, message: "No logs found" });
  }

  /* ---------------- SETTINGS ---------------- */

  let settings = await LifeSettings.findOne({ userId });

  if (!settings) {
    const baselines = computeBaselines(logs);
    settings = await LifeSettings.create({
      userId,
      baselines,
      learnedSensitivity: DEFAULT_SENSITIVITY,
      sensitivityHistory: [],
    });
  }

  /* ---------------- PHASE REBUILD ---------------- */

  let previousPhase: string | null = null;
  let previousSnapshot: any = null;

  for (let i = 0; i < logs.length; i++) {
    const slice = logs.slice(0, i + 1);
    const today = slice[slice.length - 1];

    const state = await computeDailyState({
      userId,
      date: today.date,
      logsUpToDate: [...slice].reverse(),
      baselines: settings.baselines,
      sensitivity: settings.learnedSensitivity,
    });

    if (previousPhase && previousSnapshot) {
      const feedback = applyPhaseFeedback({
        previousPhase,
        currentPhase: state.candidatePhase,
        snapshot: state.snapshot,
        currentSensitivity: settings.learnedSensitivity,
      });

      if (feedback.changed) {
        settings.sensitivityHistory.push({
          date: today.date,
          before: settings.learnedSensitivity,
          after: feedback.nextSensitivity,
          reason: feedback.reason,
        });

        settings.learnedSensitivity = feedback.nextSensitivity;
        await settings.save();
      }
    }

    previousPhase = state.candidatePhase;
    previousSnapshot = state.snapshot;
  }

  /* ---------------- GOAL LOAD FEEDBACK (V2) ---------------- */

  const goalLoad = await analyzeGlobalGoalLoad({
    userId,
    weights: settings.learnedSensitivity.goalPressureWeights,
  });

  const outcome = detectGoalLoadOutcome({
    globalScore: goalLoad.global.score,
    phase: previousPhase || "balanced",
  });

  const goalFeedback = updateGoalLoadWeightsFromFeedback({
    outcome,
    currentWeights: settings.learnedSensitivity.goalPressureWeights,
  });

  if (goalFeedback.changed) {
    settings.sensitivityHistory.push({
      date: logs[logs.length - 1].date,
      before: settings.learnedSensitivity,
      after: {
        ...settings.learnedSensitivity,
        goalPressureWeights: goalFeedback.nextWeights,
      },
      reason: goalFeedback.reason,
    });

    settings.learnedSensitivity.goalPressureWeights =
      goalFeedback.nextWeights;

    await settings.save();
  }

  /* ---------------- PHASE HISTORY ---------------- */

  const phases = await compressDailyStatesToPhases(userId);

  await PhaseHistory.deleteMany({ userId });

  if (phases.length) {
    await PhaseHistory.insertMany(
      phases.map((p) => ({
        userId,
        phase: p.phase,
        startDate: p.startDate,
        endDate: p.endDate,
        snapshot: p.snapshot,
        reason: p.reason,
      }))
    );
  }

  return Response.json({
    ok: true,
    message: "Insights rebuilt with phase + goal load learning",
  });
}
