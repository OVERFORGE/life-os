export type PhaseExplanation = {
  summary: string;
  signals: string[];
  causes: string[];
  risks: string[];
  leverage: string[];
  predictedNext: string | null;
  scores: {
    stress: number;
    energy: number;
    mood: number;
    sleep: number;
    stability: number;
    load: number;
  };
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function explainLifePhase(phase: any): PhaseExplanation {
  const s = phase.snapshot || {};

  const stress = clamp01((s.avgStress ?? 0) / 10);
  const mood = clamp01((s.avgMood ?? 0) / 10);
  const energy = clamp01((s.avgEnergy ?? 0) / 10);
  const sleep = clamp01((s.avgSleep ?? 0) / 10);

  const load = clamp01((stress + (1 - sleep)) / 2);
  const stability = clamp01(1 - Math.abs(mood - energy) / 5);

  const signals: string[] = [];
  const causes: string[] = [];
  const risks: string[] = [];
  const leverage: string[] = [];

  // ----------------------
  // SIGNALS
  // ----------------------
  if (stress > 0.7) signals.push("High stress load.");
  if (sleep < 0.4) signals.push("Sleep is insufficient.");
  if (energy < 0.4) signals.push("Energy is low.");
  if (mood < 0.4) signals.push("Mood is low.");
  if (stability > 0.7) signals.push("Internal state is stable.");
  if (load > 0.7) signals.push("Overall load is high.");

  signals.push(`Detected phase: ${phase.phase}.`);

  // ----------------------
  // CAUSES
  // ----------------------
  if (stress > 0.7 && sleep < 0.5) {
    causes.push("High stress combined with insufficient recovery.");
  }

  if (energy < 0.4 && mood < 0.4) {
    causes.push("System-wide fatigue and motivational depletion.");
  }

  if (phase.phase === "drifting") {
    causes.push("Loss of structure and weak execution consistency.");
  }

  // ----------------------
  // RISKS
  // ----------------------
  if (phase.phase === "burnout" || load > 0.8) {
    risks.push("Burnout spiral and long recovery debt.");
  }

  if (phase.phase === "slump") {
    risks.push("Entrenching low motivation and avoidance loops.");
  }

  if (stability < 0.3) {
    risks.push("Emotional volatility may destabilize routines.");
  }

  // ----------------------
  // LEVERAGE
  // ----------------------
  if (sleep < 0.5) {
    leverage.push("Fix sleep before touching productivity.");
  }

  if (phase.phase === "drifting") {
    leverage.push("Reintroduce strict daily structure.");
  }

  if (phase.phase === "balanced") {
    leverage.push("Carefully increase challenge while protecting recovery.");
  }

  if (phase.phase === "recovery") {
    leverage.push("Do not rush output; rebuild capacity first.");
  }

  if (energy < 0.5) {
    leverage.push("Reduce cognitive load and simplify tasks.");
  }

  // ----------------------
  // PREDICTION ENGINE
  // ----------------------
  let predictedNext: string | null = null;

  if (load > 0.75 && sleep < 0.45 && stress > 0.7) {
    predictedNext = "burnout";
  } else if (energy < 0.4 && mood < 0.4) {
    predictedNext = "slump";
  }

  // ----------------------
  // SUMMARY
  // ----------------------
  let summary = "This phase represents your current operating state.";

  if (phase.phase === "burnout") {
    summary = "Your system is overloaded and under-recovered.";
  } else if (phase.phase === "slump") {
    summary = "Your energy, mood, and execution capacity are suppressed.";
  } else if (phase.phase === "recovery") {
    summary = "Your system is stabilizing after overload.";
  } else if (phase.phase === "grind") {
    summary = "You are operating at high output under sustained load.";
  } else if (phase.phase === "balanced") {
    summary = "Your system is operating within sustainable bounds.";
  } else if (phase.phase === "drifting") {
    summary = "You are active but losing structural alignment.";
  }

  return {
    summary,
    signals,
    causes,
    risks,
    leverage,
    predictedNext,
    scores: {
      stress,
      energy,
      mood,
      sleep,
      stability,
      load,
    },
  };
}
