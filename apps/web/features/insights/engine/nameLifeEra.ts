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
  const hasSprintSeason = phases.some(p => (p as any).contextMode === "sprint" || p.snapshot?.contextMode === "sprint");
  const hasSanctuarySeason = phases.some(p => (p as any).contextMode === "sanctuary" || p.snapshot?.contextMode === "sanctuary");
  const hasSabbaticalSeason = phases.some(p => (p as any).contextMode === "sabbatical" || p.snapshot?.contextMode === "sabbatical");

  // 0. Intentional Context Modes (Seasons of Life take precedence over accidental labels)
  if (hasSprintSeason) {
    return {
      title: "The Crucible",
      subtitle: "Intentional high-velocity focus under protected constraints",
      theme: "Sprint & Conquest",
      story:
        "You entered an intentional sprint season, trading transient comfort for breakthrough velocity. Sleep and recovery floors were guarded to prevent involuntary collapse.",
      risks: [
        "Over-extending beyond the scheduled sprint window",
        "Neglecting social connection",
        "Post-sprint rebound fatigue",
      ],
      opportunities: [
        "Consolidate major milestone breakthroughs",
        "Transition gracefully into recovery or balanced cadence",
        "Codify sprint efficiencies into standard systems",
      ],
    };
  }

  if (hasSanctuarySeason) {
    return {
      title: "The Sanctuary",
      subtitle: "Sacred pause and nervous system restoration",
      theme: "Sanctuary & Healing",
      story:
        "An intentional retreat from urgency. Output expectations were zeroed out to allow autonomic nervous system restoration and deep emotional grounding.",
      risks: [
        "Prematurely reintroducing heavy demands",
        "Guilt over necessary stillness",
      ],
      opportunities: [
        "Deep biological and psychological rejuvenation",
        "Reconnecting with foundational values without performance pressure",
      ],
    };
  }

  if (hasSabbaticalSeason) {
    return {
      title: "The Sabbatical",
      subtitle: "Strategic pause for perspective, exploration, and renewal",
      theme: "Perspective & Renewal",
      story:
        "Execution metrics and habit decay were frozen to make room for exploration, perspective, and genuine rest outside routine productivity.",
      risks: [
        "Difficulty establishing reentry trajectory",
        "Anxiety from unstructured time",
      ],
      opportunities: [
        "Synthesizing long-term vision",
        "Exploring emergent curiosities without utilitarian pressure",
        "Returning with renewed clarity",
      ],
    };
  }

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

  // 3. Peak Compounding / Harvest Era
  if (dominantPhase === "balanced" && direction === "up" && stability > 0.75 && !isDriftingHeavy) {
    return {
      title: "The Harvest",
      subtitle: "Compounding returns and peak flow",
      theme: "Realization",
      story:
        "Your systems, capacity, and execution are compounding simultaneously. High stability paired with an upward trajectory indicates peak operational flow.",
      risks: [
        "Neglecting restorative boundaries",
        "Overcommitting future bandwidth based on current peak output",
      ],
      opportunities: [
        "Codify what is working into permanent habits",
        "Bank excess capacity for future inflection points",
        "Celebrate meaningful compounding milestones",
      ],
    };
  }

  // 4. Ascent Era — upward momentum takes precedence over entropy
  if (direction === "up" && stability > 0.45 && !isDriftingHeavy) {
    return {
      title: "The Ascent",
      subtitle: "Momentum is compounding",
      theme: "Growth",
      story:
        "This chapter shows a clear upward trajectory in energy, mood, or execution. Systems are working, resilience is high, and progress is visible.",
      risks: [
        "Overconfidence",
        "Overextension",
        "Neglecting recovery during rapid acceleration",
      ],
      opportunities: [
        "Lock in systems",
        "Scale what works",
        "Protect restorative boundaries",
      ],
    };
  }

  // 5. Long Stable but Flat
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

  // 6. Drift Era — lack of strategic direction or severe chaos
  if (isDriftingHeavy || (dominantPhase === "balanced" && isChaotic && direction !== "up")) {
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
