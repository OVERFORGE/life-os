// features/goals/engine/updateGoalLoadWeightsFromFeedback.ts

/* ===================================================== */
/* Types                                                 */
/* ===================================================== */

export type GoalPressureWeights = {
  cadence: number;
  energy: number;
  stress: number;
  phaseMismatch: number;
};

export type GoalLoadOutcome =
  | "stable"
  | "overloaded"
  | "underutilized";

/* ===================================================== */
/* Helpers                                               */
/* ===================================================== */

/**
 * Clamp weights into safe range
 */
function clamp(n: number, min = 0.05, max = 0.6) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Normalize weights so they always sum to 1
 */
function normalize(w: GoalPressureWeights): GoalPressureWeights {
  const sum =
    w.cadence + w.energy + w.stress + w.phaseMismatch;

  return {
    cadence: w.cadence / sum,
    energy: w.energy / sum,
    stress: w.stress / sum,
    phaseMismatch: w.phaseMismatch / sum,
  };
}

/**
 * Smooth EMA update
 */
function emaUpdate(current: number, target: number, lr: number) {
  return current * (1 - lr) + target * lr;
}

/* ===================================================== */
/* Goal Load Feedback Learning Engine V2                 */
/* ===================================================== */

/**
 * Goal Load Weight Learner (V2)
 *
 * Learns slowly + safely from overload patterns.
 *
 * Key Features:
 * ✅ persistence gating
 * ✅ confidence-weight scaling
 * ✅ oscillation-safe EMA
 * ✅ normalization
 * ✅ learning event output
 */
export function updateGoalLoadWeightsFromFeedback({
  outcome,
  currentWeights,
  confidence,
  persistenceDays,
  topDriver,
}: {
  outcome: GoalLoadOutcome;

  currentWeights: GoalPressureWeights;

  /** Phase confidence (0–1) */
  confidence: number;

  /** How many days overload/underload has persisted */
  persistenceDays: number;

  /** Main pressure source ("cadence" | "stress" | etc.) */
  topDriver?: keyof GoalPressureWeights;
}): {
  changed: boolean;
  nextWeights: GoalPressureWeights;
  learningEvent: null | {
    outcome: GoalLoadOutcome;
    persistenceDays: number;
    driver: string;
    delta: GoalPressureWeights;
    reason: string;
  };
} {
  /* ===================================================== */
  /* 0️⃣ Stable → No Learning                               */
  /* ===================================================== */

  if (outcome === "stable") {
    return {
      changed: false,
      nextWeights: currentWeights,
      learningEvent: null,
    };
  }

  /* ===================================================== */
  /* 1️⃣ Persistence Gate (Anti-Oscillation)                */
  /* ===================================================== */

  if (persistenceDays < 3) {
    return {
      changed: false,
      nextWeights: currentWeights,
      learningEvent: {
        outcome,
        persistenceDays,
        driver: "none",
        delta: {
          cadence: 0,
          energy: 0,
          stress: 0,
          phaseMismatch: 0,
        },
        reason:
          "Outcome not persistent enough (<3 days) → no weight update",
      },
    };
  }

  /* ===================================================== */
  /* 2️⃣ Learning Rate Scaling                              */
  /* ===================================================== */

  /**
   * Base LR is tiny (Jarvis learns slowly)
   * Confidence + persistence amplify slightly
   */
  const lr =
    0.02 *
    Math.max(0.25, confidence) *
    Math.min(2, persistenceDays / 5);

  /* ===================================================== */
  /* 3️⃣ Target Weight Shift                                */
  /* ===================================================== */

  let target: GoalPressureWeights = { ...currentWeights };

  if (outcome === "overloaded") {
    // Overload → become more sensitive to cadence + stress
    target.cadence += 0.06;
    target.stress += 0.06;

    // Reduce weaker contributors slightly
    target.energy -= 0.03;
    target.phaseMismatch -= 0.03;
  }

  if (outcome === "underutilized") {
    // Underload → relax cadence + stress sensitivity
    target.cadence -= 0.05;
    target.stress -= 0.05;

    // Encourage challenge signals
    target.energy += 0.03;
    target.phaseMismatch += 0.03;
  }

  /* ===================================================== */
  /* 4️⃣ Driver Boost (Jarvis Explanation Learning)         */
  /* ===================================================== */

  if (topDriver) {
    target[topDriver] += 0.05;
  }

  /* ===================================================== */
  /* 5️⃣ EMA Smooth Update                                 */
  /* ===================================================== */

  const updated: GoalPressureWeights = {
    cadence: clamp(
      emaUpdate(currentWeights.cadence, target.cadence, lr)
    ),
    energy: clamp(
      emaUpdate(currentWeights.energy, target.energy, lr)
    ),
    stress: clamp(
      emaUpdate(currentWeights.stress, target.stress, lr)
    ),
    phaseMismatch: clamp(
      emaUpdate(
        currentWeights.phaseMismatch,
        target.phaseMismatch,
        lr
      )
    ),
  };

  /* ===================================================== */
  /* 6️⃣ Normalize Always                                  */
  /* ===================================================== */

  const nextWeights = normalize(updated);

  /* ===================================================== */
  /* 7️⃣ Learning Event Output                             */
  /* ===================================================== */

  const delta: GoalPressureWeights = {
    cadence: nextWeights.cadence - currentWeights.cadence,
    energy: nextWeights.energy - currentWeights.energy,
    stress: nextWeights.stress - currentWeights.stress,
    phaseMismatch:
      nextWeights.phaseMismatch - currentWeights.phaseMismatch,
  };

  const reason =
    outcome === "overloaded"
      ? "Persistent overload → Jarvis increased cadence/stress sensitivity"
      : "Persistent underutilization → Jarvis relaxed load sensitivity";

  return {
    changed: true,
    nextWeights,
    learningEvent: {
      outcome,
      persistenceDays,
      driver: topDriver ?? "none",
      delta,
      reason,
    },
  };
}
