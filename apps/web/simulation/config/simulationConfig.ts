/**
 * SimulationConfig — Data-Driven Simulation Configuration
 *
 * Central data object containing all biometric coefficients, activity parameters,
 * circadian rhythm multipliers, difficulty rates, and environment defaults.
 */

export interface CircadianProfileConfig {
  phaseName: string;
  startMinuteOfDay: number;
  endMinuteOfDay: number;
  focusMultiplier: number;
  energyMultiplier: number;
  fatigueMultiplier: number;
  sleepPressureMultiplier: number;
}

export interface BiometricCoefficients {
  minLimit: number;
  maxLimit: number;
  baseSleepPressureRate: number;
  sleepRecoveryRate: number;
  criticalEnergyThreshold: number;
  criticalSleepPressureThreshold: number;
}

export interface SimulationConfig {
  masterSeed: number;
  biometrics: BiometricCoefficients;
  circadianProfiles: CircadianProfileConfig[];
  environmentDefaults: {
    defaultLocation: string;
    defaultNoiseLevel: "quiet" | "moderate" | "loud";
    defaultWeather: "Clear" | "Rainy" | "Cloudy";
  };
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  masterSeed: 42,
  biometrics: {
    minLimit: 0,
    maxLimit: 100,
    baseSleepPressureRate: 0.08,
    sleepRecoveryRate: -0.7,
    criticalEnergyThreshold: 20,
    criticalSleepPressureThreshold: 80,
  },
  circadianProfiles: [
    {
      phaseName: "MORNING_PEAK",
      startMinuteOfDay: 360, // 06:00
      endMinuteOfDay: 690,   // 11:30
      focusMultiplier: 1.25,
      energyMultiplier: 1.1,
      fatigueMultiplier: 0.8,
      sleepPressureMultiplier: 0.5,
    },
    {
      phaseName: "MIDDAY",
      startMinuteOfDay: 690, // 11:30
      endMinuteOfDay: 780,   // 13:00
      focusMultiplier: 0.9,
      energyMultiplier: 0.95,
      fatigueMultiplier: 1.0,
      sleepPressureMultiplier: 1.0,
    },
    {
      phaseName: "POST_LUNCH_DIP",
      startMinuteOfDay: 780, // 13:00
      endMinuteOfDay: 870,   // 14:30
      focusMultiplier: 0.7,
      energyMultiplier: 0.8,
      fatigueMultiplier: 1.4,
      sleepPressureMultiplier: 1.5,
    },
    {
      phaseName: "AFTERNOON_RECOVERY",
      startMinuteOfDay: 870,  // 14:30
      endMinuteOfDay: 1080,  // 18:00
      focusMultiplier: 1.05,
      energyMultiplier: 1.0,
      fatigueMultiplier: 1.0,
      sleepPressureMultiplier: 1.0,
    },
    {
      phaseName: "EVENING",
      startMinuteOfDay: 1080, // 18:00
      endMinuteOfDay: 1320, // 22:00
      focusMultiplier: 0.8,
      energyMultiplier: 0.85,
      fatigueMultiplier: 1.3,
      sleepPressureMultiplier: 1.6,
    },
    {
      phaseName: "NIGHT",
      startMinuteOfDay: 1320, // 22:00
      endMinuteOfDay: 360,   // 06:00
      focusMultiplier: 0.4,
      energyMultiplier: 0.6,
      fatigueMultiplier: 2.0,
      sleepPressureMultiplier: 2.5,
    },
  ],
  environmentDefaults: {
    defaultLocation: "Home Office",
    defaultNoiseLevel: "quiet",
    defaultWeather: "Clear",
  },
};
