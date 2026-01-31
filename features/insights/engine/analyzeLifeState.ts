import { scoreLifePhase } from "./scoreLifePhase";

function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function safe(n: any, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

export function analyzeLifeState({
  recentLogs,
  baselines,
  sensitivity,
}: {
  recentLogs: any[];
  baselines: {
    sleep: number;
    mood: number;
    stress: number;
    energy: number;
    deepWork: number;
  };
  sensitivity?: {
    sleepImpact: number;
    stressImpact: number;
    energyImpact: number;
    moodImpact: number;
  };
}) {
  if (!recentLogs || recentLogs.length === 0) {
    return {
      candidatePhase: "balanced",
      confidence: 0.3,
      isWarning: false,
      reason: "Not enough data yet",
      snapshot: {},
      insights: [],
    };
  }

  const window = recentLogs.slice(0, 14);

  const avgSleep = avg(window.map((l) => l.sleep?.hours || 0));
  const avgMood = avg(window.map((l) => l.mental?.mood || 0));
  const avgStress = avg(window.map((l) => l.mental?.stress || 0));
  const avgEnergy = avg(window.map((l) => l.mental?.energy || 0));
  const avgDeepWork = avg(window.map((l) => l.work?.deepWorkHours || 0));

  const s = sensitivity ?? {
    sleepImpact: 1,
    stressImpact: 1,
    energyImpact: 1,
    moodImpact: 1,
  };

  const delta = {
    sleep: safe(avgSleep - baselines.sleep) * safe(s.sleepImpact),
    mood: safe(avgMood - baselines.mood) * safe(s.moodImpact),
    stress: safe(avgStress - baselines.stress) * safe(s.stressImpact),
    energy: safe(avgEnergy - baselines.energy) * safe(s.energyImpact),
  };

  const scoring = scoreLifePhase({
    avgMood,
    avgEnergy,
    avgStress,
    avgSleep,
    avgDeepWork,
  });

  return {
    candidatePhase: scoring.phase,
    confidence: scoring.confidence,
    isWarning: scoring.phase === "drifting",
    reason: "Phase selected by multi-signal scoring engine.",
    snapshot: {
      avgSleep,
      avgMood,
      avgStress,
      avgEnergy,
      avgDeepWork,
      delta,
      system: scoring.system,
      scores: scoring.scores,
    },
    insights: [
      `System load: ${(scoring.system.load * 100).toFixed(0)}%`,
      `Recovery capacity: ${(scoring.system.recovery * 100).toFixed(0)}%`,
      `Stability: ${(scoring.system.stability * 100).toFixed(0)}%`,
    ],
  };
}
