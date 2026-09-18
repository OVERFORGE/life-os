// features/insights/engine/shapePhaseTimeline.ts

import { Phase, PhaseShape, ShapedPhaseSegment } from "../types";

type PhaseBlock = {
  phase: Phase;
  startDate: string;
  endDate: string | null;
  durationDays: number;
  snapshot: {
    avgMood?: number;
    avgEnergy?: number;
    avgStress?: number;
    avgSleep?: number;
    avgDeepWork?: number;
  };
};

// ---------- Math helpers ----------

function slope(values: number[]) {
  if (values.length < 2) return 0;
  return values[values.length - 1] - values[0];
}

function volatility(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function to10Scale(val: number): number {
  if (val <= 1.0 && val >= 0) return val * 10; // 0.0 - 1.0 float scale
  if (val > 10.0) return val / 10;           // 0 - 100 percentage scale
  return val;                                // already 1 - 10 scale
}

// ---------- Shape detector ----------

function detectShapeFromSignals(blocks: PhaseBlock[]): {
  shape: PhaseShape;
  shapeScore: number;
  explanation: string;
} {
  const mood = blocks.map(b => to10Scale(b.snapshot?.avgMood || 5));
  const energy = blocks.map(b => to10Scale(b.snapshot?.avgEnergy || 5));
  const stress = blocks.map(b => to10Scale(b.snapshot?.avgStress || 5));
  const work = blocks.map(b => b.snapshot?.avgDeepWork || 0);

  const moodSlope = slope(mood);
  const energySlope = slope(energy);
  const stressSlope = slope(stress);

  const moodVol = volatility(mood);
  const energyVol = volatility(energy);

  // 🌀 Chaos: high volatility
  if (moodVol > 1.2 || energyVol > 1.2) {
    return {
      shape: "chaos",
      shapeScore: Math.min(1, (moodVol + energyVol) / 3),
      explanation: "Highly unstable period with large emotional or energy swings.",
    };
  }

  // 🔥 Burnout: stress rising, energy falling, work high
  if (stressSlope > 0.8 && energySlope < -0.8) {
    return {
      shape: "burnout",
      shapeScore: 0.9,
      explanation: "Stress increased while energy declined — classic burnout pattern.",
    };
  }

  // 🌱 Recovery: mood & energy rising
  if (moodSlope > 0.7 && energySlope > 0.7) {
    return {
      shape: "recovery",
      shapeScore: 0.8,
      explanation: "Mood and energy steadily improved over this period.",
    };
  }

  // 📈 Ascent
  if (moodSlope > 0.5 || energySlope > 0.5) {
    return {
      shape: "ascent",
      shapeScore: 0.7,
      explanation: "Overall upward trajectory in mental or energy state.",
    };
  }

  // 📉 Decline
  if (moodSlope < -0.5 || energySlope < -0.5) {
    return {
      shape: "decline",
      shapeScore: 0.7,
      explanation: "Gradual deterioration in mood or energy.",
    };
  }

  // ⚠️ Wobble: small movements, not stable, not collapsing
  if (Math.abs(moodSlope) < 0.4 && Math.abs(energySlope) < 0.4 && (moodVol > 0.4 || energyVol > 0.4)) {
    return {
      shape: "wobble",
      shapeScore: 0.5,
      explanation: "No clear direction, mild instability.",
    };
  }

  // 🧊 Plateau
  return {
    shape: "plateau",
    shapeScore: 0.6,
    explanation: "Stable and flat period near your baseline.",
  };
}

// ---------- Main engine ----------

export function shapePhaseTimeline(phases: PhaseBlock[]): {
  segments: ShapedPhaseSegment[];
  story: string[];
  warnings: string[];
} {
  if (!phases || phases.length === 0) {
    return { segments: [], story: [], warnings: [] };
  }

  const segments: ShapedPhaseSegment[] = [];

  // Use sliding windows of 3–5 blocks
  for (let i = 0; i < phases.length; i += 3) {
    const window = phases.slice(i, i + 4);
    if (window.length < 2) continue;

    const { shape, shapeScore, explanation } = detectShapeFromSignals(window);

    segments.push({
      from: window[0].startDate,
      to: window[window.length - 1].endDate || "present",
      phases: window.map(w => w.phase),
      shape,
      shapeScore,
      explanation,
    });
  }

  const story = segments.map(s => {
    return `${s.from} → ${s.to}: ${s.shape} (${s.explanation})`;
  });

  const warnings = segments
    .filter(s => s.shape === "burnout" || s.shape === "decline" || s.shape === "chaos")
    .map(s => `⚠️ ${s.explanation} (${s.from} → ${s.to})`);

  return { segments, story, warnings };
}
