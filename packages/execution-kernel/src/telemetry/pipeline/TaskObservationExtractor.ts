/**
 * TaskObservationExtractor.ts
 * Extracts normalized, deterministic observations from task completion and velocity events.
 * Part of Phase 2 Continuous Telemetry Engine.
 */

import { Observation, createFrozenObservation, generateDeterministicObservationId } from "../Observation";
import { RawTaskActivity } from "../contracts/ObservationEventContracts";

export interface TaskExtractionInput {
  userId: string;
  activities: RawTaskActivity[];
  windowDays?: number;
  generationTimestamp?: number;
}

export class TaskObservationExtractor {
  private static readonly TARGET_DAILY_VELOCITY = 5; // 5 completed tasks per day benchmark

  /**
   * Extracts TaskExecutionVelocity observations from active or completed tasks.
   */
  static extractObservations(input: TaskExtractionInput): Observation[] {
    const { userId, activities, windowDays = 1, generationTimestamp = Date.now() } = input;
    const observations: Observation[] = [];

    if (activities.length === 0) {
      return observations;
    }

    const latestCompletedAt = Math.max(...activities.map((a) => a.completedAt));
    const completedCount = activities.length;
    const velocityPerDay = completedCount / Math.max(1, windowDays);
    const normalizedVelocity = Math.min(1.0, velocityPerDay / TaskObservationExtractor.TARGET_DAILY_VELOCITY);

    const sourceKey = `tasks-${userId}-${latestCompletedAt}`;

    observations.push(
      createFrozenObservation({
        id: generateDeterministicObservationId("TaskExecutionVelocity", sourceKey, latestCompletedAt),
        type: "TaskExecutionVelocity",
        userId,
        timestamp: latestCompletedAt,
        generatedAt: generationTimestamp,
        generatedBy: "TaskObservationExtractor-v1",
        confidence: 1.0,
        normalizedValue: Number(normalizedVelocity.toFixed(3)),
        rawValue: Number(velocityPerDay.toFixed(2)),
        unit: "tasks/day",
        metadata: {
          totalCompleted: completedCount,
          windowDays,
          taskIds: activities.map((a) => a.taskId),
        },
        ownership: {
          sourceCollection: "tasks",
          sourceEntityId: sourceKey,
          originatingSubsystem: "ExecutionTelemetry",
          createdAt: latestCompletedAt,
        },
      })
    );

    return observations;
  }
}
