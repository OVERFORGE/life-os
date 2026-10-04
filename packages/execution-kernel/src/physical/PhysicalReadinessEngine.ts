/**
 * PhysicalReadinessEngine.ts
 * Longitudinal Physical Model tracking training strain, recovery, nutrition consistency, and readiness.
 * Enforces Constitutional Rule 8: Probabilistic estimation, provenance, non-medical disclaimer.
 * Part of Phase 5 Behavioral, Relationship & Physical Models.
 */

import { Observation } from "../telemetry/Observation";

export interface RecentWorkoutLog {
  id: string;
  type: string;
  intensity: "low" | "medium" | "high";
  durationMinutes: number;
  timestamp: number;
}

export interface RecentNutritionLog {
  calories: number;
  targetCalories?: number;
  proteinGrams?: number;
  timestamp: number;
}

export interface EvaluatePhysicalReadinessInput {
  userId: string;
  observations: Observation[];
  recentWorkouts?: RecentWorkoutLog[];
  recentNutritionLogs?: RecentNutritionLog[];
  currentTime?: number;
}

export interface PhysicalReadinessResult {
  userId: string;
  timestamp: number;
  readinessScore: number; // 0.0 to 1.0
  trainingStrainScore: number; // 0.0 to 1.0
  recoveryStatus: "OPTIMAL" | "REDUCED" | "CRITICAL";
  nutritionConsistencyScore: number; // 0.0 to 1.0
  sleepDebtHours: number;
  primaryDrivers: string[];
  disclaimer: "Operational readiness estimate only; not a medical assessment.";
}

export class PhysicalReadinessEngine {
  private static instance: PhysicalReadinessEngine;

  static getInstance(): PhysicalReadinessEngine {
    if (!PhysicalReadinessEngine.instance) {
      PhysicalReadinessEngine.instance = new PhysicalReadinessEngine();
    }
    return PhysicalReadinessEngine.instance;
  }

  public evaluate(input: EvaluatePhysicalReadinessInput): PhysicalReadinessResult {
    const {
      userId,
      observations = [],
      recentWorkouts = [],
      recentNutritionLogs = [],
      currentTime = Date.now(),
    } = input;

    const drivers: string[] = [];

    // 1. Sleep & Wearable Telemetry
    const sleepObs = observations.find((o) => o.type === "SleepDurationHours");
    const recoveryObs = observations.find((o) => o.type === "SleepRecoveryScore");
    const stressObs = observations.find((o) => o.type === "HighPhysiologicalStress");

    let sleepHours = 7.0; // Baseline default
    if (sleepObs && typeof sleepObs.rawValue === "number") {
      sleepHours = sleepObs.rawValue;
    }

    const sleepDebtHours = Math.max(0.0, Number((8.0 - sleepHours).toFixed(1)));
    if (sleepDebtHours >= 2.0) {
      drivers.push(`Sleep debt of ${sleepDebtHours}h`);
    } else if (sleepHours >= 7.5) {
      drivers.push("Well-rested sleep");
    }

    const recoveryQuality = recoveryObs ? Number(recoveryObs.normalizedValue) : 0.75;
    const physStress = stressObs ? Number(stressObs.normalizedValue) : 0.3;

    // 2. Training Strain Calculation (last 48 hours)
    const lookback48h = currentTime - 48 * 60 * 60 * 1000;
    const activeWorkouts = recentWorkouts.filter((w) => w.timestamp >= lookback48h);

    let rawStrain = 0;
    for (const w of activeWorkouts) {
      const intensityFactor = w.intensity === "high" ? 1.0 : w.intensity === "medium" ? 0.6 : 0.3;
      const durationHours = w.durationMinutes / 60.0;
      rawStrain += intensityFactor * durationHours;
    }
    // Normalize against reference 3.0 strain units in 48h
    const trainingStrainScore = Number(Math.min(1.0, Math.max(0.0, rawStrain / 3.0)).toFixed(3));
    if (trainingStrainScore > 0.6) {
      drivers.push("Elevated training volume / strain");
    }

    // 3. Nutrition Consistency
    let nutritionConsistencyScore = 0.8; // Default baseline
    if (recentNutritionLogs.length > 0) {
      const deviations = recentNutritionLogs.map((log) => {
        const target = log.targetCalories || 2200;
        return Math.min(1.0, Math.abs(log.calories - target) / target);
      });
      const avgDeviation = deviations.reduce((sum, d) => sum + d, 0) / deviations.length;
      nutritionConsistencyScore = Number(Math.max(0.0, 1.0 - avgDeviation).toFixed(2));
      if (nutritionConsistencyScore < 0.6) {
        drivers.push("Inconsistent caloric intake");
      }
    }

    // 4. Composite Physical Readiness Score
    // Positive components: Rested sleep ratio, recovery quality, nutrition consistency
    // Negative components: Training strain, sleep debt, physiological stress
    const sleepComponent = Math.min(1.0, sleepHours / 8.0) * 0.40;
    const recoveryComponent = recoveryQuality * 0.30;
    const nutritionComponent = nutritionConsistencyScore * 0.15;
    const strainDeduction = trainingStrainScore * 0.25;
    const stressDeduction = physStress * 0.15;

    const rawReadiness = sleepComponent + recoveryComponent + nutritionComponent - strainDeduction - stressDeduction;
    const readinessScore = Number(Math.min(1.0, Math.max(0.0, rawReadiness)).toFixed(3));

    let recoveryStatus: "OPTIMAL" | "REDUCED" | "CRITICAL" = "OPTIMAL";
    if (readinessScore < 0.45) {
      recoveryStatus = "CRITICAL";
      drivers.push("Critical recovery deficit: short sleep combined with physical strain");
    } else if (readinessScore < 0.70) {
      recoveryStatus = "REDUCED";
    }

    return {
      userId,
      timestamp: currentTime,
      readinessScore,
      trainingStrainScore,
      recoveryStatus,
      nutritionConsistencyScore,
      sleepDebtHours,
      primaryDrivers: drivers,
      disclaimer: "Operational readiness estimate only; not a medical assessment.",
    };
  }
}
