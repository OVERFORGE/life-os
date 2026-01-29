import { scoreLifePhase } from "./scoreLifePhase";

function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function analyzeLifeState({
  recentLogs,
  baselines,
}: {
  recentLogs: any[];
  baselines: {
    sleep: number;
    mood: number;
    stress: number;
    energy: number;
    deepWork: number;
  };
  thresholds?: any; // no longer used
}) {
  if (!recentLogs || recentLogs.length === 0) {
    return {
      candidatePhase: "balanced",
      isWarning: false,
      confidence: 0.3,
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

  const delta = {
    sleep: avgSleep - baselines.sleep,
    mood: avgMood - baselines.mood,
    stress: avgStress - baselines.stress,
    energy: avgEnergy - baselines.energy,
    deepWork: avgDeepWork - baselines.deepWork,
  };

  // 🧠 NEW SCORING ENGINE
  const scoring = scoreLifePhase({
    avgMood,
    avgEnergy,
    avgStress,
    avgSleep,
    avgDeepWork,
  });

  const candidatePhase = scoring.phase as any;
  const confidence = scoring.confidence;

  const snapshot = {
    avgSleep,
    avgMood,
    avgStress,
    avgEnergy,
    avgDeepWork,
    delta,
    system: scoring.system,
    scores: scoring.scores,
  };

  const insights = [
    `System load: ${(scoring.system.load * 100).toFixed(0)}%`,
    `Recovery capacity: ${(scoring.system.recovery * 100).toFixed(0)}%`,
    `Stability: ${(scoring.system.stability * 100).toFixed(0)}%`,
  ];

  const isWarning = candidatePhase === "drifting";

  return {
    candidatePhase,
    isWarning,
    confidence,
    reason: "Phase selected by multi-signal scoring engine.",
    snapshot,
    insights,
  };
}
