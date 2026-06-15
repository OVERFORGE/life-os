import { PhaseDailyState } from "../models/PhaseDailyState";
import { analyzeLifeState } from "./analyzeLifeState";

export async function computeDailyState({
  userId,
  date,
  logsUpToDate,
  baselines,
  sensitivity,
}: {
  userId: string;
  date: string;
  logsUpToDate: any[];
  baselines: any;
  sensitivity?: {
    sleepImpact: number;
    stressImpact: number;
    energyImpact: number;
    moodImpact: number;
  };
}) {
  const safeSensitivity =
    sensitivity ?? {
      sleepImpact: 1,
      stressImpact: 1,
      energyImpact: 1,
      moodImpact: 1,
    };

  const analysis = analyzeLifeState({
    recentLogs: logsUpToDate,
    baselines,
    sensitivity: safeSensitivity,
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
