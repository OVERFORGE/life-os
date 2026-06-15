import { LifeEra } from "../types";

export type EraNarrative = {
  title: string;
  subtitle: string;
  theme: string;
  story: string;
  risks: string[];
  opportunities: string[];
};

export function nameLifeEra(era: LifeEra): EraNarrative {
  const { dominantPhase, direction, volatility, stability, phases, summaryVector } = era;

  const duration =
    phases.reduce((a, b) => a + (b.durationDays || 0), 0);

  // -----------------------------
  // Helpers
  // -----------------------------
  const isLong = duration > 90;
  const isVeryLong = duration > 180;
  const isStable = stability > 0.7;
  const isChaotic = volatility > 0.6;
  const isDriftingHeavy = phases.filter(p => p.phase === "drifting").length > phases.length * 0.3;

  // -----------------------------
  // Main classification
  // -----------------------------
  // 1. Burnout Era
  if (dominantPhase === "burnout") {
    return {
      title: "The Burnout Cycle",
      subtitle: "Output exceeded recovery for too long",
      theme: "Overextension",
      story:
        "This period shows a sustained pattern of pushing beyond your recovery capacity. Stress accumulated while energy and mood eroded. The system eventually forced a slowdown.",
      risks: [
        "Chronic exhaustion",
        "Loss of motivation",
        "Long recovery debt",
      ],
      opportunities: [
        "Redesign workload",
        "Rebuild sustainable routines",
        "Recalibrate ambition",
      ],
    };
  }

  // 2. Slump Era
  if (dominantPhase === "slump") {
    return {
      title: "The Low Tide",
      subtitle: "Low output and low internal drive",
      theme: "Contraction",
      story:
        "This chapter is characterized by reduced energy, mood, and execution. It likely followed either overload or prolonged uncertainty.",
      risks: [
        "Identity stagnation",
        "Avoidance loops",
        "Confidence erosion",
      ],
      opportunities: [
        "Small consistent wins",
        "Rebuild self-trust",
        "Lower activation energy for action",
      ],
    };
  }

  // 3. Long Stable but Flat
  if (dominantPhase === "balanced" && isLong && direction === "flat") {
    return {
      title: "The Long Plateau",
      subtitle: "Stable, but not meaningfully progressing",
      theme: "Stagnation",
      story:
        "Life is not in crisis here, but it is also not compounding. You are maintaining, not climbing. Comfort and routine dominate this chapter.",
      risks: [
        "Wasted potential",
        "Invisible stagnation",
        "Slow decay of ambition",
      ],
      opportunities: [
        "Introduce deliberate challenges",
        "Raise goals",
        "Reignite long-term vision",
      ],
    };
  }

  // 4. Drift Era
  if (isDriftingHeavy || (dominantPhase === "balanced" && isChaotic)) {
    return {
      title: "The Drift",
      subtitle: "Structure exists, direction does not",
      theme: "Entropy",
      story:
        "This phase shows signs of inconsistency and loss of strategic direction. You are active, but not aligned.",
      risks: [
        "Time leakage",
        "False productivity",
        "Long-term misalignment",
      ],
      opportunities: [
        "Re-clarify priorities",
        "Tighten daily structure",
        "Reduce cognitive load",
      ],
    };
  }

  // 5. Ascent Era
  if (direction === "up" && stability > 0.5) {
    return {
      title: "The Ascent",
      subtitle: "Momentum is compounding",
      theme: "Growth",
      story:
        "This chapter shows a clear upward trajectory in energy, mood, or execution. Systems are working and progress is visible.",
      risks: [
        "Overconfidence",
        "Overextension",
      ],
      opportunities: [
        "Lock in systems",
        "Scale what works",
        "Protect recovery",
      ],
    };
  }

  // 6. Recovery Era
  if (dominantPhase === "recovery") {
    return {
      title: "The Rebuild",
      subtitle: "Stability is being reconstructed",
      theme: "Restoration",
      story:
        "This period reflects deliberate downshifting and repair after stress or collapse. The focus is on rebuilding capacity.",
      risks: [
        "Impatience",
        "Returning to overload too fast",
      ],
      opportunities: [
        "Build antifragile routines",
        "Redesign pace of life",
      ],
    };
  }

  // 7. Default
  return {
    title: "The Holding Pattern",
    subtitle: "Neither collapsing nor compounding",
    theme: "Neutral",
    story:
      "This chapter is relatively neutral. No major deterioration, no major growth. It represents a transitional or undecided phase.",
    risks: [
      "Wasting time",
      "Drifting without noticing",
    ],
    opportunities: [
      "Decide a direction",
      "Introduce intentionality",
    ],
  };
}
