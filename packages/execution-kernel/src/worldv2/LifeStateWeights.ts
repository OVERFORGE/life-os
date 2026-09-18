/**
 * Canonical LifeState Engine V2 Weighting & Threshold Configurations
 *
 * Constitutional Configuration Module for LifeStateEngine V2.
 * All mathematical constants, feature weights, candidate scoring formulas,
 * and threshold parameters are defined here for calibration and tuning.
 *
 * Phase D Calibration Changes:
 * D-2:  CONFIDENCE.MISSING_TELEMETRY_PENALTY_PER_TYPE 0.10 → 0.07
 *       CONFIDENCE.MIN_CONFIDENCE 0.10 → 0.15
 */

export const LIFE_STATE_WEIGHTS = Object.freeze({
  // Physiological Sub-score Weights
  PHYSIOLOGICAL: Object.freeze({
    STRESS_WEIGHT: 0.40,
    ENERGY_WEIGHT: 0.35,
    SLEEP_WEIGHT:  0.25,
  }),

  // Execution Sub-score Weights
  EXECUTION: Object.freeze({
    VELOCITY_WEIGHT:    0.60,
    HABIT_DECAY_WEIGHT: 0.40,
  }),

  // Stability Overall Score Weights
  STABILITY: Object.freeze({
    PHYSIO_WEIGHT:     0.50,
    EXECUTION_WEIGHT:  0.50,
  }),

  // Candidate State Formula Weights
  CANDIDATE_SCORING: Object.freeze({
    BURNOUT: Object.freeze({
      STRESS_WEIGHT:        0.50,
      ENERGY_DEFICIT_WEIGHT: 0.35,
      SLEEP_DEFICIT_WEIGHT:  0.15,
    }),
    RECOVERY: Object.freeze({
      LOW_STRESS_WEIGHT:     0.40,
      ADEQUATE_SLEEP_WEIGHT: 0.35,
      LOW_EXECUTION_WEIGHT:  0.25,
    }),
    HIGH_MOMENTUM: Object.freeze({
      VELOCITY_WEIGHT:       0.45,
      EXECUTION_SCORE_WEIGHT: 0.35,
      STRESS_CONTROL_WEIGHT:  0.20,
    }),
    FOCUSED_EXECUTION: Object.freeze({
      VELOCITY_WEIGHT:     0.50,
      LOW_BLOCKAGE_WEIGHT: 0.50,
      // D-6: FocusedExecution score is gated by physiological health.
      // Gate = min(1.0, pScore / PHYSIO_GATE_THRESHOLD). Below threshold, score is suppressed.
      PHYSIO_GATE_THRESHOLD: 60, // pScore >= 60 → no suppression; pScore 30 → 50% suppression
    }),
    STAGNANT: Object.freeze({
      LOW_VELOCITY_WEIGHT: 0.60,
      LOW_STRESS_WEIGHT:   0.40,
    }),
    STABLE: Object.freeze({
      BALANCED_PHYSIO_WEIGHT:     0.50,
      BALANCED_EXECUTION_WEIGHT:  0.50,
    }),
  }),

  // Confidence & Penalties
  // D-2 Calibration: Reduced per-type penalty 0.10→0.07 and raised floor 0.10→0.15
  // to preserve confidence gradient when multiple telemetry types are missing.
  CONFIDENCE: Object.freeze({
    BASE_CONFIDENCE:                    0.95,
    MISSING_TELEMETRY_PENALTY_PER_TYPE: 0.07,  // was 0.10
    SPARSITY_PENALTY:                   0.20,
    MIN_CONFIDENCE:                     0.15,  // was 0.10
  }),
});
