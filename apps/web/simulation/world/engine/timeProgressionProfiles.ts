/**
 * TimeProgressionProfiles — Non-Linear Circadian & Biometric Curves
 *
 * Evaluates non-linear multipliers based on virtual time of day (circadian rhythm)
 * and active activity definition.
 */

import { ActivityDefinitionId, ActivityDefinitionRegistry } from "../contracts/activityDefinitionRegistry";

export interface CircadianMultiplier {
  focusMultiplier: number;
  energyMultiplier: number;
  fatigueMultiplier: number;
  sleepPressureMultiplier: number;
  phaseName: string;
}

export function getCircadianMultiplier(virtualMinute: number): CircadianMultiplier {
  const minuteOfDay = virtualMinute % 1440;

  if (minuteOfDay >= 360 && minuteOfDay < 690) {
    return {
      focusMultiplier: 1.25,
      energyMultiplier: 1.1,
      fatigueMultiplier: 0.8,
      sleepPressureMultiplier: 0.5,
      phaseName: "MORNING_PEAK",
    };
  }

  if (minuteOfDay >= 690 && minuteOfDay < 780) {
    return {
      focusMultiplier: 0.9,
      energyMultiplier: 0.95,
      fatigueMultiplier: 1.0,
      sleepPressureMultiplier: 1.0,
      phaseName: "MIDDAY",
    };
  }

  if (minuteOfDay >= 780 && minuteOfDay < 870) {
    return {
      focusMultiplier: 0.7,
      energyMultiplier: 0.8,
      fatigueMultiplier: 1.4,
      sleepPressureMultiplier: 1.5,
      phaseName: "POST_LUNCH_DIP",
    };
  }

  if (minuteOfDay >= 870 && minuteOfDay < 1080) {
    return {
      focusMultiplier: 1.05,
      energyMultiplier: 1.0,
      fatigueMultiplier: 1.0,
      sleepPressureMultiplier: 1.0,
      phaseName: "AFTERNOON_RECOVERY",
    };
  }

  if (minuteOfDay >= 1080 && minuteOfDay < 1320) {
    return {
      focusMultiplier: 0.8,
      energyMultiplier: 0.85,
      fatigueMultiplier: 1.3,
      sleepPressureMultiplier: 1.6,
      phaseName: "EVENING",
    };
  }

  return {
    focusMultiplier: 0.4,
    energyMultiplier: 0.6,
    fatigueMultiplier: 2.0,
    sleepPressureMultiplier: 2.5,
    phaseName: "NIGHT",
  };
}

export function getActivityProfile(activityId: ActivityDefinitionId) {
  const def = ActivityDefinitionRegistry.getDefinition(activityId);
  return {
    baseFocusDeltaPerMin: def.baseFocusDeltaPerMin,
    baseEnergyDeltaPerMin: def.baseEnergyDeltaPerMin,
    baseFatigueDeltaPerMin: def.baseFatigueDeltaPerMin,
    baseStressDeltaPerMin: def.baseStressDeltaPerMin,
    baseHungerDeltaPerMin: def.baseHungerDeltaPerMin,
    baseHydrationDeltaPerMin: def.baseHydrationDeltaPerMin,
  };
}
