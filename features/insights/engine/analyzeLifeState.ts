type Phase =
  | "grind"
  | "burnout"
  | "recovery"
  | "slump"
  | "balanced";

function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function analyzeLifeState(logs: any[]) {
  if (!logs.length) {
    return {
      phase: "balanced" as Phase,
      confidence: 0.3,
      reason: "Not enough data yet",
      snapshot: {},
      insights: [],
    };
  }

  const window = logs.slice(0, 14);

  const avgSleep = avg(window.map(l => l.sleep?.hours || 0));
  const avgMood = avg(window.map(l => l.mental?.mood || 0));
  const avgStress = avg(window.map(l => l.mental?.stress || 0));
  const avgEnergy = avg(window.map(l => l.mental?.energy || 0));
  const avgDeepWork = avg(window.map(l => l.work?.deepWorkHours || 0));
  const gymDays = window.filter(l => l.physical?.gym).length;
  const noFapDays = window.filter(l => l.habits?.noFap).length;

  let phase: Phase = "balanced";
  let confidence = 0.5;
  const insights: string[] = [];

  // 🧠 Phase detection logic
  if (avgDeepWork > 4 && avgSleep < 6 && avgStress > 6) {
    phase = "burnout";
    confidence = 0.85;
    insights.push("High work, low sleep, high stress → burnout risk");
  } else if (avgDeepWork > 4 && avgStress > 5) {
    phase = "grind";
    confidence = 0.75;
    insights.push("Sustained high work output");
  } else if (avgSleep > 7.5 && avgDeepWork < 2) {
    phase = "recovery";
    confidence = 0.7;
    insights.push("Low work + high rest → recovery phase");
  } else if (avgMood < 4.5 && avgEnergy < 4 && avgDeepWork < 2) {
    phase = "slump";
    confidence = 0.8;
    insights.push("Low mood, low energy, low work → slump");
  } else {
    phase = "balanced";
    confidence = 0.6;
    insights.push("No extreme pattern detected");
  }

  // 🧾 Build snapshot (stored in PhaseHistory)
  const snapshot = {
    avgSleep,
    avgMood,
    avgStress,
    avgEnergy,
    avgDeepWork,
    gymDays,
    noFapDays,
  };

  // 🧠 Human explanation
  const reason = insights.join(". ");

  return {
    phase,
    confidence,
    reason,
    snapshot,
    insights,
  };
}
