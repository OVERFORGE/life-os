export const DEFAULT_THRESHOLDS = {
  burnout: {
    sleepBelow: -1.0,
    stressAbove: +1.2,
    workAbove: +1.0,
  },
  grind: {
    workAbove: +0.7,
    sleepBelow: -0.5,
  },
  recovery: {
    sleepAbove: +0.8,
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
};
