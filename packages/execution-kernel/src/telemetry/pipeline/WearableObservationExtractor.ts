/**
 * WearableObservationExtractor.ts
 * Extracts normalized, deterministic observations from connected wearable biometrics
 * (Apple Health, Google Fit, Whoop, Oura, Garmin).
 * Part of Phase 2 Continuous Telemetry Engine.
 */

import { Observation, createFrozenObservation, generateDeterministicObservationId } from "../Observation";
import { RawWearableData } from "../contracts/ObservationEventContracts";

export interface WearableExtractionInput {
  userId: string;
  data: RawWearableData;
  generationTimestamp?: number;
}

export class WearableObservationExtractor {
  private static readonly OPTIMAL_SLEEP_HOURS = 8.0;
  private static readonly OPTIMAL_ACTIVE_MINUTES = 60.0;

  /**
   * Extracts biometric observations with deterministic IDs and normalized scores.
   */
  static extractObservations(input: WearableExtractionInput): Observation[] {
    const { userId, data, generationTimestamp = Date.now() } = input;
    const observations: Observation[] = [];
    const sourceKey = `${data.source}-${data.timestamp}`;

    // 1. Sleep Duration Hours
    if (data.sleepHours !== undefined && data.sleepHours !== null) {
      const sleepHours = data.sleepHours;
      const normalizedSleep = Math.min(1.0, Math.max(0.0, sleepHours / WearableObservationExtractor.OPTIMAL_SLEEP_HOURS));
      
      observations.push(
        createFrozenObservation({
          id: generateDeterministicObservationId("SleepDurationHours", sourceKey, data.timestamp),
          type: "SleepDurationHours",
          userId,
          timestamp: data.timestamp,
          generatedAt: generationTimestamp,
          generatedBy: "WearableObservationExtractor-v1",
          confidence: 0.95,
          normalizedValue: Number(normalizedSleep.toFixed(3)),
          rawValue: Number(sleepHours.toFixed(2)),
          unit: "hours",
          metadata: {
            sourceProvider: data.source,
            optimalReferenceHours: 8.0,
          },
          ownership: {
            sourceCollection: "wearable_telemetry",
            sourceEntityId: sourceKey,
            originatingSubsystem: "PhysiologyTelemetry",
            createdAt: data.timestamp,
          },
        })
      );

      // Also compute SleepDeprivation deficit observation for unified WorldModel compatibility
      const sleepDeficit = Math.max(0.0, WearableObservationExtractor.OPTIMAL_SLEEP_HOURS - sleepHours);
      const sleepDeprivationNorm = Math.min(1.0, sleepDeficit / WearableObservationExtractor.OPTIMAL_SLEEP_HOURS);
      observations.push(
        createFrozenObservation({
          id: generateDeterministicObservationId("SleepDeprivation", sourceKey, data.timestamp),
          type: "SleepDeprivation",
          userId,
          timestamp: data.timestamp,
          generatedAt: generationTimestamp,
          generatedBy: "WearableObservationExtractor-v1",
          confidence: 0.95,
          normalizedValue: Number(sleepDeprivationNorm.toFixed(3)),
          rawValue: Number(sleepDeficit.toFixed(2)),
          unit: "hours_deficit",
          metadata: {
            sourceProvider: data.source,
            deficitHours: sleepDeficit,
          },
          ownership: {
            sourceCollection: "wearable_telemetry",
            sourceEntityId: sourceKey,
            originatingSubsystem: "PhysiologyTelemetry",
            createdAt: data.timestamp,
          },
        })
      );
    }

    // 2. Sleep Recovery Score
    if (data.sleepQualityScore !== undefined && data.sleepQualityScore !== null) {
      const recoveryScore = data.sleepQualityScore;
      const normalizedRecovery = Math.min(1.0, Math.max(0.0, recoveryScore / 100.0));

      observations.push(
        createFrozenObservation({
          id: generateDeterministicObservationId("SleepRecoveryScore", sourceKey, data.timestamp),
          type: "SleepRecoveryScore",
          userId,
          timestamp: data.timestamp,
          generatedAt: generationTimestamp,
          generatedBy: "WearableObservationExtractor-v1",
          confidence: 0.95,
          normalizedValue: Number(normalizedRecovery.toFixed(3)),
          rawValue: recoveryScore,
          unit: "score",
          metadata: {
            sourceProvider: data.source,
            rawScore: recoveryScore,
          },
          ownership: {
            sourceCollection: "wearable_telemetry",
            sourceEntityId: sourceKey,
            originatingSubsystem: "PhysiologyTelemetry",
            createdAt: data.timestamp,
          },
        })
      );
    }

    // 3. Workout & Physical Activity
    if (data.activeMinutes !== undefined && data.activeMinutes !== null) {
      const activeMinutes = data.activeMinutes;
      const normalizedActivity = Math.min(1.0, activeMinutes / WearableObservationExtractor.OPTIMAL_ACTIVE_MINUTES);

      observations.push(
        createFrozenObservation({
          id: generateDeterministicObservationId("WorkoutCompleted", sourceKey, data.timestamp),
          type: "WorkoutCompleted",
          userId,
          timestamp: data.timestamp,
          generatedAt: generationTimestamp,
          generatedBy: "WearableObservationExtractor-v1",
          confidence: 0.95,
          normalizedValue: Number(normalizedActivity.toFixed(3)),
          rawValue: activeMinutes,
          unit: "minutes",
          metadata: {
            sourceProvider: data.source,
            stepCount: data.steps,
          },
          ownership: {
            sourceCollection: "wearable_telemetry",
            sourceEntityId: sourceKey,
            originatingSubsystem: "PhysiologyTelemetry",
            createdAt: data.timestamp,
          },
        })
      );
    }

    // 4. Physiological Stress (resting heart rate / HRV)
    if (data.restingHeartRate !== undefined && data.restingHeartRate !== null) {
      // Baseline 55 bpm, high stress at 90+ bpm
      const rhr = data.restingHeartRate;
      const stressNorm = Math.min(1.0, Math.max(0.0, (rhr - 55) / 35.0));

      observations.push(
        createFrozenObservation({
          id: generateDeterministicObservationId("HighPhysiologicalStress", sourceKey, data.timestamp),
          type: "HighPhysiologicalStress",
          userId,
          timestamp: data.timestamp,
          generatedAt: generationTimestamp,
          generatedBy: "WearableObservationExtractor-v1",
          confidence: 0.90,
          normalizedValue: Number(stressNorm.toFixed(3)),
          rawValue: rhr,
          unit: "bpm",
          metadata: {
            sourceProvider: data.source,
            restingHeartRate: rhr,
            hrvMs: data.hrvMs,
          },
          ownership: {
            sourceCollection: "wearable_telemetry",
            sourceEntityId: sourceKey,
            originatingSubsystem: "PhysiologyTelemetry",
            createdAt: data.timestamp,
          },
        })
      );
    }

    return observations;
  }
}
