import { PhaseDailyState } from "../models/PhaseDailyState";
import { analyzeLifeState } from "./analyzeLifeState";

export async function computeDailyState({
  userId,
  date,
  logsUpToDate,
  baselines,
  thresholds,
}: {
  userId: string;
  date: string;
  logsUpToDate: any[];
  baselines: any;
  thresholds: any;
}) {
  const analysis = analyzeLifeState({
    recentLogs: logsUpToDate,
    baselines,
    thresholds,
  });

  await PhaseDailyState.findOneAndUpdate(
    { userId, date },
    {
      userId,
      date,
      candidatePhase: analysis.candidatePhase,
      confidence: analysis.confidence,
      isWarning: analysis.isWarning,
      snapshot: analysis.snapshot,
    },
    { upsert: true, new: true }
  );

  return analysis;
}
