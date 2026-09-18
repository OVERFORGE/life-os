/**
 * Telemetry Window Registry
 * 
 * Central constitutional registry defining evaluation horizons for every Kernel subsystem.
 * Prevents hardcoding of log query ranges across engines.
 */

export interface SubsystemWindowConfig {
  subsystemName: string;
  windowDays: number;
  description: string;
}

export const TELEMETRY_WINDOW_REGISTRY: Record<string, SubsystemWindowConfig> = Object.freeze({
  LifeStateEngine: {
    subsystemName: "LifeStateEngine",
    windowDays: 14,
    description: "14-day rolling physiological check-in window for macro state inference",
  },
  GoalPressureEngineV2: {
    subsystemName: "GoalPressureEngineV2",
    windowDays: 7,
    description: "7-day execution velocity and deadline proximity window",
  },
  LearningEngine: {
    subsystemName: "LearningEngine",
    windowDays: 90,
    description: "90-day behavioral observation window for pattern clustering",
  },
  PredictionEngine: {
    subsystemName: "PredictionEngine",
    windowDays: 30,
    description: "30-day trajectory trend regression horizon",
  },
  RecoveryEngine: {
    subsystemName: "RecoveryEngine",
    windowDays: 21,
    description: "21-day physiological recovery and sleep debt tracking window",
  },
  WorldModelV2: {
    subsystemName: "WorldModelV2",
    windowDays: 90,
    description: "Full reality snapshot aggregation window",
  },
});

export function getSubsystemWindowDays(subsystemName: string): number {
  return TELEMETRY_WINDOW_REGISTRY[subsystemName]?.windowDays ?? 14;
}
