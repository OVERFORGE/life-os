// features/goals/engine/analyzeGoalPressure.ts

import { Goal } from "../models/Goal";
import { GoalStats } from "../models/GoalStats";
import { PhaseExplanation } from "@/features/insights/engine/explainLifePhase";

export type GoalPressureStatus =
  | "aligned"
  | "strained"
  | "conflicting"
  | "toxic";

export type GoalPressureReport = {
  goalId: string;
  pressureScore: number; // 0 → 1
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

/**
 * Clamp helper
 */
function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/**
 * Main analyzer
 */
export function analyzeGoalPressure({
  goal,
  stats,
  phase,
}: {
  goal: any;
  stats: any | null;
  phase: PhaseExplanation & { phase?: string };
}): GoalPressureReport {
  const reasons: string[] = [];
  const adaptations: string[] = [];

  // -----------------------------
  // 1️⃣ Cadence Pressure
  // -----------------------------
  let cadencePressure = 0;

  if (goal.cadence === "daily") {
    cadencePressure = 0.6;
    reasons.push("Daily cadence imposes continuous demand.");
  } else if (goal.cadence === "weekly") {
    cadencePressure = 0.3;
  } else {
    cadencePressure = 0.1;
  }

  // Slump / recovery amplify cadence pressure
  if (phase.phase === "slump" || phase.phase === "recovery") {
    cadencePressure += 0.2;
    reasons.push(
      "Current life phase reduces tolerance for frequent goal demands."
    );
  }

  cadencePressure = clamp01(cadencePressure);

  // -----------------------------
  // 2️⃣ Energy Pressure
  // -----------------------------
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

  // -----------------------------
  // 3️⃣ Stress / Load Pressure
  // -----------------------------
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

  // -----------------------------
  // 4️⃣ Phase Mismatch (structural)
  // -----------------------------
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

  if (
    goal.type === "identity" &&
    phase.phase === "burnout"
  ) {
    phaseMismatch = 0.5;
    reasons.push("Identity change is costly during burnout.");
  }

  phaseMismatch = clamp01(phaseMismatch);

  // -----------------------------
  // 5️⃣ Final Pressure Score
  // -----------------------------
  const pressureScore = clamp01(
    cadencePressure * 0.25 +
      energyPressure * 0.25 +
      stressPressure * 0.25 +
      phaseMismatch * 0.25
  );

  // -----------------------------
  // 6️⃣ Status Mapping
  // -----------------------------
  let status: GoalPressureStatus = "aligned";

  if (pressureScore > 0.7) status = "toxic";
  else if (pressureScore > 0.45) status = "conflicting";
  else if (pressureScore > 0.25) status = "strained";

  // -----------------------------
  // 7️⃣ Adaptation Suggestions
  // -----------------------------
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
