/**
 * Canonical LifeState Engine V2 Weighting & Threshold Configurations
 *
 * Constitutional Configuration Module for LifeStateEngine V2.
 * All mathematical constants, feature weights, candidate scoring formulas,
 * and threshold parameters are defined here for calibration and tuning.
 * Supports configurable profile objects for user-calibrated weights.
 */

export interface LifeStateWeightsProfile {
  PHYSIOLOGICAL: {
    STRESS_WEIGHT: number;
    ENERGY_WEIGHT: number;
    SLEEP_WEIGHT: number;
  };
  EXECUTION: {
    VELOCITY_WEIGHT: number;
    HABIT_DECAY_WEIGHT: number;
  };
  STABILITY: {
    PHYSIO_WEIGHT: number;
    EXECUTION_WEIGHT: number;
  };
  CANDIDATE_SCORING: {
    BURNOUT: {
      STRESS_WEIGHT: number;
      ENERGY_DEFICIT_WEIGHT: number;
      SLEEP_DEFICIT_WEIGHT: number;
    };
    RECOVERY: {
      LOW_STRESS_WEIGHT: number;
      ADEQUATE_SLEEP_WEIGHT: number;
      LOW_EXECUTION_WEIGHT: number;
    };
    HIGH_MOMENTUM: {
      VELOCITY_WEIGHT: number;
      EXECUTION_SCORE_WEIGHT: number;
      STRESS_CONTROL_WEIGHT: number;
    };
    FOCUSED_EXECUTION: {
      VELOCITY_WEIGHT: number;
      LOW_BLOCKAGE_WEIGHT: number;
      PHYSIO_GATE_THRESHOLD: number;
    };
    STAGNANT: {
      LOW_VELOCITY_WEIGHT: number;
      LOW_STRESS_WEIGHT: number;
    };
    STABLE: {
      BALANCED_PHYSIO_WEIGHT: number;
      BALANCED_EXECUTION_WEIGHT: number;
    };
  };
  CONFIDENCE: {
    BASE_CONFIDENCE: number;
    MISSING_TELEMETRY_PENALTY_PER_TYPE: number;
    SPARSITY_PENALTY: number;
    MIN_CONFIDENCE: number;
  };
}

export const DEFAULT_LIFE_STATE_WEIGHTS: LifeStateWeightsProfile = Object.freeze({
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
      PHYSIO_GATE_THRESHOLD: 60,
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
  CONFIDENCE: Object.freeze({
    BASE_CONFIDENCE:                    0.95,
    MISSING_TELEMETRY_PENALTY_PER_TYPE: 0.07,
    SPARSITY_PENALTY:                   0.20,
    MIN_CONFIDENCE:                     0.15,
  }),
});

/**
 * Creates a calibrated weights profile by merging custom user-calibrated overrides onto the baseline.
 */
export function createLifeStateWeightsProfile(
  custom?: Partial<LifeStateWeightsProfile>
): LifeStateWeightsProfile {
  if (!custom) return DEFAULT_LIFE_STATE_WEIGHTS;

  return {
    PHYSIOLOGICAL: {
      ...DEFAULT_LIFE_STATE_WEIGHTS.PHYSIOLOGICAL,
      ...(custom.PHYSIOLOGICAL || {}),
    },
    EXECUTION: {
      ...DEFAULT_LIFE_STATE_WEIGHTS.EXECUTION,
      ...(custom.EXECUTION || {}),
    },
    STABILITY: {
      ...DEFAULT_LIFE_STATE_WEIGHTS.STABILITY,
      ...(custom.STABILITY || {}),
    },
    CANDIDATE_SCORING: {
      BURNOUT: {
        ...DEFAULT_LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.BURNOUT,
        ...(custom.CANDIDATE_SCORING?.BURNOUT || {}),
      },
      RECOVERY: {
        ...DEFAULT_LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.RECOVERY,
        ...(custom.CANDIDATE_SCORING?.RECOVERY || {}),
      },
      HIGH_MOMENTUM: {
        ...DEFAULT_LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.HIGH_MOMENTUM,
        ...(custom.CANDIDATE_SCORING?.HIGH_MOMENTUM || {}),
      },
      FOCUSED_EXECUTION: {
        ...DEFAULT_LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.FOCUSED_EXECUTION,
        ...(custom.CANDIDATE_SCORING?.FOCUSED_EXECUTION || {}),
      },
      STAGNANT: {
        ...DEFAULT_LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.STAGNANT,
        ...(custom.CANDIDATE_SCORING?.STAGNANT || {}),
      },
      STABLE: {
        ...DEFAULT_LIFE_STATE_WEIGHTS.CANDIDATE_SCORING.STABLE,
        ...(custom.CANDIDATE_SCORING?.STABLE || {}),
      },
    },
    CONFIDENCE: {
      ...DEFAULT_LIFE_STATE_WEIGHTS.CONFIDENCE,
      ...(custom.CONFIDENCE || {}),
    },
  };
}

export const LIFE_STATE_WEIGHTS = DEFAULT_LIFE_STATE_WEIGHTS;
