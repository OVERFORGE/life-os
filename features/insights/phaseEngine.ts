import { PhaseResult, PhaseType } from "./types";

export function detectPhase(logs: any[]): PhaseResult | null {
  if (logs.length < 7) return null;

  const window = logs.slice(0, 10); // last 10 days

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const avgSleep = avg(window.map(l => l.sleep?.hours || 0));
  const avgMood = avg(window.map(l => l.mental?.mood || 0));
  const avgStress = avg(window.map(l => l.mental?.stress || 0));
  const avgDeepWork = avg(window.map(l => l.work?.deepWorkHours || 0));
  const gymDays = window.filter(l => l.physical?.gym).length;

  let phase: PhaseType = "balanced";
  let confidence = 0.5;

  if (avgDeepWork > 3.5 && avgSleep < 6 && avgStress > 6) {
    phase = "burnout";
    confidence = 0.8;
  } else if (avgDeepWork > 3 && avgStress > 5) {
    phase = "grind";
    confidence = 0.7;
  } else if (avgSleep > 7.5 && avgDeepWork < 2) {
    phase = "recovery";
    confidence = 0.7;
  } else if (avgMood < 4.5 && avgDeepWork < 1.5) {
    phase = "slump";
    confidence = 0.75;
  } else {
    phase = "balanced";
    confidence = 0.6;
  }

  return {
    phase,
    confidence,
    metrics: {
      avgSleep,
      avgMood,
      avgStress,
      avgDeepWork,
      gymDays,
    },
  };
}
