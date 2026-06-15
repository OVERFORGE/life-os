// features/goals/engine/analyzeGoalPressure.ts

import { PhaseExplanation } from "@/features/insights/engine/explainLifePhase";

export type GoalPressureWeights = {
  cadence: number;
  energy: number;
  stress: number;
  phaseMismatch: number;
};

export type GoalPressureStatus =
  | "aligned"
  | "strained"
  | "conflicting"
  | "toxic";

export type GoalPressureReport = {
  goalId: string;
  pressureScore: number;
  status: GoalPressureStatus;

  breakdown: {
    cadencePressure: number;
    energyPressure: number;
    stressPressure: number;
    phaseMismatch: number;
  };

  reasons: string[];
  adaptations: string[];
};

/* -------------------------------------------------- */
/* Default Weights (Fallback Safety)                  */
/* -------------------------------------------------- */

const DEFAULT_WEIGHTS: GoalPressureWeights = {
  cadence: 0.25,
  energy: 0.25,
  stress: 0.25,
  phaseMismatch: 0.25,
};

/* -------------------------------------------------- */
/* Clamp Helper                                       */
/* -------------------------------------------------- */

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/* -------------------------------------------------- */
/* Normalize Weights                                  */
/* -------------------------------------------------- */

function normalizeWeights(w?: GoalPressureWeights): GoalPressureWeights {
  const weights = w ?? DEFAULT_WEIGHTS;

  const total =
    weights.cadence +
    weights.energy +
    weights.stress +
    weights.phaseMismatch;

  if (total <= 0.0001) {
    return DEFAULT_WEIGHTS;
  }

  return {
    cadence: weights.cadence / total,
    energy: weights.energy / total,
    stress: weights.stress / total,
    phaseMismatch: weights.phaseMismatch / total,
  };
}

/* -------------------------------------------------- */
/* Main Analyzer                                      */
/* -------------------------------------------------- */

export function analyzeGoalPressure({
  goal,
  stats,
  phase,
  weights,
}: {
  goal: any;
  stats: any | null;
  phase: PhaseExplanation & { phase?: string };
  weights?: GoalPressureWeights;
}): GoalPressureReport {
  const reasons: string[] = [];
  const adaptations: string[] = [];

  const w = normalizeWeights(weights);

  /* ---------------- Cadence Pressure ---------------- */

  let cadencePressure = 0;

  if (goal.cadence === "daily") {
    cadencePressure = 0.6;
    reasons.push("Daily cadence imposes continuous demand.");
  } else if (goal.cadence === "weekly") {
    cadencePressure = 0.3;
  } else {
    cadencePressure = 0.1;
  }

  if (phase.phase === "slump" || phase.phase === "recovery") {
    cadencePressure += 0.2;
    reasons.push(
      "Current life phase reduces tolerance for frequent goal demands."
    );
  }

  cadencePressure = clamp01(cadencePressure);

  /* ---------------- Energy Pressure ---------------- */

  let energyPressure = 0;

  if (phase.scores.energy < 0.4) {
    energyPressure += 0.4;
    reasons.push("Energy levels are currently low.");
  }

  if (goal.type === "performance") {
    energyPressure += 0.3;
    reasons.push("Performance goals require sustained output.");
  }

  if (stats?.momentum === "down") {
    energyPressure += 0.2;
    reasons.push("Goal momentum is declining.");
  }

  energyPressure = clamp01(energyPressure);

  /* ---------------- Stress Pressure ---------------- */

  let stressPressure = 0;

  if (phase.scores.load > 0.6) {
    stressPressure += 0.4;
    reasons.push("Overall system load is elevated.");
  }

  if (phase.scores.stress > 0.6) {
    stressPressure += 0.3;
    reasons.push("Stress levels are already high.");
  }

  if (phase.predictedNext === "burnout") {
    stressPressure += 0.3;
    reasons.push("Current trajectory risks burnout.");
  }

  stressPressure = clamp01(stressPressure);

  /* ---------------- Phase Mismatch ---------------- */

  let phaseMismatch = 0;

  if (
    goal.type === "performance" &&
    (phase.phase === "recovery" || phase.phase === "slump")
  ) {
    phaseMismatch = 0.6;

    reasons.push(
      "Performance goals conflict with recovery-oriented life phase."
    );
  }

  if (goal.type === "identity" && phase.phase === "burnout") {
    phaseMismatch = 0.5;

    reasons.push(
      "Identity change is costly during burnout."
    );
  }

  phaseMismatch = clamp01(phaseMismatch);

  /* ---------------- Final Score ---------------- */

  const pressureScore = clamp01(
    cadencePressure * w.cadence +
      energyPressure * w.energy +
      stressPressure * w.stress +
      phaseMismatch * w.phaseMismatch
  );

  /* ---------------- Status ---------------- */

  let status: GoalPressureStatus = "aligned";

  if (pressureScore > 0.7) status = "toxic";
  else if (pressureScore > 0.45) status = "conflicting";
  else if (pressureScore > 0.25) status = "strained";

  /* ---------------- Adaptations ---------------- */

  if (status === "toxic" || status === "conflicting") {
    if (goal.cadence === "daily") {
      adaptations.push("Reduce cadence to weekly or flexible.");
    }

    if (goal.type === "performance") {
      adaptations.push("Temporarily shift goal to maintenance mode.");
    }

    adaptations.push("Relax success criteria for the current phase.");
  }

  if (status === "strained") {
    adaptations.push("Lower intensity or frequency slightly.");
  }

  if (phase.phase === "recovery") {
    adaptations.push("Focus on consistency, not progress.");
  }

  return {
    goalId: String(goal._id),
    pressureScore,
    status,
    breakdown: {
      cadencePressure,
      energyPressure,
      stressPressure,
      phaseMismatch,
    },
    reasons,
    adaptations,
  };
}