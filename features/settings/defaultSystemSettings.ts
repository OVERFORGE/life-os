export const DEFAULT_SYSTEM_SETTINGS = {
  phases: {
    minDays: {
      burnout: 3,
      grind: 3,
      slump: 4,
      recovery: 4,
      balanced: 7,
    },

    thresholds: {
      burnout: {
        sleepBelow: -1.0,
        stressAbove: 1.2,
        workAbove: 1.0,
      },
      grind: {
        workAbove: 0.7,
        sleepBelow: -0.5,
      },
      recovery: {
        sleepAbove: 0.8,
        workBelow: -0.6,
      },
      slump: {
        moodBelow: -0.8,
        workBelow: -0.8,
      },
      drifting: {
        workBand: 0.4,
        sleepBand: 0.4,
        moodBand: 0.4,
      },
    },
  },

  goals: {
    pressureWeights: {
      cadence: 0.25,
      energy: 0.25,
      stress: 0.25,
      phaseMismatch: 0.25,
    },

    cadenceBasePressure: {
      daily: 0.6,
      weekly: 0.3,
      flexible: 0.1,
    },
  },

  simulation: {
    deltaScale: {
      sleep: 0.5,   // ≈ 30–45 min
      stress: 0.4,
      mood: 0.3,
      energy: 0.3,
    },
    maxDelta: 3,
  },
};
