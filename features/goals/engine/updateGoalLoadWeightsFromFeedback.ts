// features/goals/engine/updateGoalLoadWeightsFromFeedback.ts

type GoalPressureWeights = {
  cadence: number;
  energy: number;
  stress: number;
  phaseMismatch: number;
};

/**
 * Clamp weights into safe range
 */
function clamp(n: number, min = 0.05, max = 0.6) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Smooth Goal Load Feedback Learning V2
 *
 * - Overload → increase cadence + stress sensitivity
 * - Underload → relax energy + mismatch sensitivity
 * - Stable → no change
 *
 * Uses confidence-scaled EMA smoothing to prevent oscillation.
 */
export function updateGoalLoadWeightsFromFeedback({
  outcome,
  currentWeights,
  confidence,
}: {
  outcome: "stable" | "overloaded" | "underutilized";
  currentWeights: GoalPressureWeights;
  confidence: number; // 0 → 1
}): {
  changed: boolean;
  nextWeights: GoalPressureWeights;
  reason: string;
} {
  /* ---------------- Stable → No Learning ---------------- */

  if (outcome === "stable") {
    return {
      changed: false,
      nextWeights: currentWeights,
      reason: "System stable → no goal load adjustment",
    };
  }

  /* ---------------- Learning Rate ---------------- */

  // Confidence controls how strong updates are
  const lr = 0.05 * Math.max(0.2, confidence);

  /* ---------------- Target Shift ---------------- */

  const target =
    outcome === "overloaded"
      ? {
          cadence: currentWeights.cadence + 0.05,
          stress: currentWeights.stress + 0.05,
          energy: currentWeights.energy,
          phaseMismatch: currentWeights.phaseMismatch,
        }
      : {
          cadence: currentWeights.cadence,
          stress: currentWeights.stress,
          energy: currentWeights.energy - 0.05,
          phaseMismatch: currentWeights.phaseMismatch - 0.05,
        };

  /* ---------------- EMA Update ---------------- */

  const next: GoalPressureWeights = {
    cadence: clamp(
      currentWeights.cadence * (1 - lr) + target.cadence * lr
    ),

    stress: clamp(
      currentWeights.stress * (1 - lr) + target.stress * lr
    ),

    energy: clamp(
      currentWeights.energy * (1 - lr) + target.energy * lr
    ),

    phaseMismatch: clamp(
      currentWeights.phaseMismatch * (1 - lr) +
        target.phaseMismatch * lr
    ),
  };

  /* ---------------- Reason ---------------- */

  const reason =
    outcome === "overloaded"
      ? "Overload detected → increased cadence & stress sensitivity smoothly"
      : "Underutilization detected → relaxed energy & mismatch pressure smoothly";

  return {
    changed: true,
    nextWeights: next,
    reason,
  };
}
