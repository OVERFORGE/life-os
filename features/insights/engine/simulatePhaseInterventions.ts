import { analyzeLifeState } from "./analyzeLifeState";

export function simulatePhaseIntervention({
  phase,
  deltas,
  baselines,
  sensitivity,
}: {
  phase: any;
  deltas: {
    sleep?: number;
    stress?: number;
    mood?: number;
    energy?: number;
  };
  baselines: any;
  sensitivity: any;
}) {
  const s = phase.snapshot;

  const fakeLogs = Array.from({ length: 14 }).map(() => ({
    sleep: { hours: (s.avgSleep || 0) + (deltas.sleep || 0) },
    mental: {
      stress: (s.avgStress || 0) + (deltas.stress || 0),
      mood: (s.avgMood || 0) + (deltas.mood || 0),
      energy: (s.avgEnergy || 0) + (deltas.energy || 0),
    },
    work: {
      deepWorkHours: 0,
    },
  }));

  const result = analyzeLifeState({
    recentLogs: fakeLogs,
    baselines,
    sensitivity,
  });

  return result;
}
