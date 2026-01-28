import { DEFAULT_THRESHOLDS } from "@/features/insights/config/defaultThresholds";

function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function analyzeLifeState({
  recentLogs,
  baselines,
  thresholds,
}: {
  recentLogs: any[];
  baselines: {
    sleep: number;
    mood: number;
    stress: number;
    energy: number;
    deepWork: number;
  };
  thresholds: any;
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

  // 🛡️ Merge DB thresholds with defaults (CRITICAL)
  const safeThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...thresholds,
    drifting: {
      ...DEFAULT_THRESHOLDS.drifting,
      ...(thresholds?.drifting || {}),
    },
  };

  const window = recentLogs.slice(0, 14);

  const avgSleep = avg(window.map(l => l.sleep?.hours || 0));
  const avgMood = avg(window.map(l => l.mental?.mood || 0));
  const avgStress = avg(window.map(l => l.mental?.stress || 0));
  const avgEnergy = avg(window.map(l => l.mental?.energy || 0));
  const avgDeepWork = avg(window.map(l => l.work?.deepWorkHours || 0));

  const delta = {
    sleep: avgSleep - baselines.sleep,
    mood: avgMood - baselines.mood,
    stress: avgStress - baselines.stress,
    energy: avgEnergy - baselines.energy,
    deepWork: avgDeepWork - baselines.deepWork,
  };

  let candidatePhase:
    | "grind"
    | "burnout"
    | "recovery"
    | "slump"
    | "balanced"
    | "drifting" = "balanced";

  let confidence = 0.6;
  const insights: string[] = [];

  // 🔥 Burnout
  if (
    delta.sleep < safeThresholds.burnout.sleepBelow &&
    delta.stress > safeThresholds.burnout.stressAbove &&
    delta.deepWork > safeThresholds.burnout.workAbove
  ) {
    candidatePhase = "burnout";
    confidence = 0.9;
    insights.push("You are working far above normal while under-recovering.");
  }

  // ⚙️ Grind
  else if (
    delta.deepWork > safeThresholds.grind.workAbove &&
    delta.sleep < safeThresholds.grind.sleepBelow
  ) {
    candidatePhase = "grind";
    confidence = 0.8;
    insights.push("You are pushing harder than your normal capacity.");
  }

  // 🌱 Recovery
  else if (
    delta.sleep > safeThresholds.recovery.sleepAbove &&
    delta.deepWork < safeThresholds.recovery.workBelow
  ) {
    candidatePhase = "recovery";
    confidence = 0.75;
    insights.push("You are prioritizing rest over output.");
  }

  // 🕳️ Slump
  else if (
    delta.mood < safeThresholds.slump.moodBelow &&
    delta.deepWork < safeThresholds.slump.workBelow
  ) {
    candidatePhase = "slump";
    confidence = 0.85;
    insights.push("Low mood and low output relative to your norm.");
  }

  // ⚠️ Drifting (WARNING ONLY — NOT A REAL PHASE)
  else if (
    Math.abs(delta.deepWork) < safeThresholds.drifting.workBand &&
    Math.abs(delta.sleep) < safeThresholds.drifting.sleepBand &&
    Math.abs(delta.mood) < safeThresholds.drifting.moodBand
  ) {
    candidatePhase = "drifting";
    confidence = 0.55;
    insights.push("You are losing structure and direction.");
  }

  // ✅ Balanced
  else {
    candidatePhase = "balanced";
    confidence = 0.7;
    insights.push("You are operating near your personal baseline.");
  }

  const snapshot = {
    avgSleep,
    avgMood,
    avgStress,
    avgEnergy,
    avgDeepWork,
    delta,
  };

  const isWarning = candidatePhase === "drifting";

  return {
    candidatePhase,
    isWarning,
    confidence,
    reason: insights.join(" "),
    snapshot,
    insights,
  };
}
