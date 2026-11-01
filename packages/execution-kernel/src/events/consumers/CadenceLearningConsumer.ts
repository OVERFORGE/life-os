/**
 * CadenceLearningConsumer.ts
 * 
 * Milestone B — Phase B3: Work Package 4 / Loop 7
 * Canonical Cadence Learning Event Consumer
 * 
 * Consumes:
 * - domain.temporal.scheduled, domain.temporal.rescheduled
 * - domain.physical.workout_logged, domain.health.workout_logged
 * - domain.task.completed
 * 
 * Invariants:
 * 1. Day-Segmented: Chronicle entries are partitioned strictly by day of week.
 * 2. Circular Math: Uses trigonometric modulo-1440 minute averaging for routines.
 * 3. Durable Cadence Profile: Persists derived patterns to CadenceProfileRepository.
 */

import { ICanonicalConsumer } from "./ConsumerRegistry";
import {
  ICanonicalEventEnvelope,
  ConsumerExecutionStatus,
} from "../contracts/CanonicalEventContracts";
import { CadenceLearningEngine } from "../../temporal/cadence/CadenceLearningEngine";
import { CadenceProfileRepository } from "../../temporal/cadence/CadenceProfileRepository";
import { ExecutionChronicleEntry } from "../../temporal/contracts/TemporalContracts";

export interface CadenceLearningConsumerDependencies {
  learningEngine?: CadenceLearningEngine;
  cadenceRepository?: CadenceProfileRepository;
}

export class CadenceLearningConsumer implements ICanonicalConsumer {
  public name = "CadenceLearningConsumer";
  public targetCategories = ["DOMAIN_EVENT" as const];
  public targetTypes = [
    "domain.temporal.scheduled",
    "domain.temporal.rescheduled",
    "domain.physical.workout_logged",
    "domain.health.workout_logged",
    "domain.task.completed",
  ];

  private engine: CadenceLearningEngine;
  private repository: CadenceProfileRepository;

  constructor(deps?: CadenceLearningConsumerDependencies) {
    this.engine = deps?.learningEngine || CadenceLearningEngine.getInstance();
    this.repository = deps?.cadenceRepository || CadenceProfileRepository.getInstance();
  }

  public async process(
    envelope: ICanonicalEventEnvelope,
    _leaseGeneration: number
  ): Promise<{ status: ConsumerExecutionStatus; error?: string }> {
    try {
      const payload = envelope.payload || {};
      const occurredAtMs = envelope.occurredAt
        ? new Date(envelope.occurredAt).getTime()
        : Date.now();

      let title: string;
      let durationMinutes: number;

      switch (envelope.type) {
        case "domain.physical.workout_logged":
        case "domain.health.workout_logged": {
          title = payload.title || payload.workoutType || "Workout";
          const durSec = payload.durationSeconds || (payload.durationMinutes ? payload.durationMinutes * 60 : undefined);
          durationMinutes = durSec ? Math.max(1, Math.round(durSec / 60)) : (payload.durationMinutes || 0);
          break;
        }
        case "domain.temporal.scheduled":
        case "domain.temporal.rescheduled": {
          title = payload.title || "Scheduled Occurrence";
          if (payload.startIsoUtc && payload.endIsoUtc) {
            const startMs = new Date(payload.startIsoUtc).getTime();
            const endMs = new Date(payload.endIsoUtc).getTime();
            durationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));
          } else {
            durationMinutes = payload.durationMinutes || 0;
          }
          break;
        }
        case "domain.task.completed": {
          title = payload.title || "Task completion";
          durationMinutes = payload.durationMinutes || 0;
          break;
        }
        default: {
          title = payload.title || "Activity";
          durationMinutes = payload.durationMinutes || 0;
          break;
        }
      }

      const isWorkout =
        envelope.type === "domain.physical.workout_logged" ||
        envelope.type === "domain.health.workout_logged";

      const chronicle: ExecutionChronicleEntry = {
        chronicleId: `chron_${envelope.eventId}`,
        userId: envelope.userId,
        occurrenceId: envelope.aggregateId,
        entityType: isWorkout ? "workout" : "task",
        entityId: envelope.aggregateId,
        title,
        startedAtMs: occurredAtMs,
        endedAtMs: occurredAtMs + durationMinutes * 60000,
        durationMinutes,
        interruptionsCount: 0,
        source: "web_manual",
        createdAt: Date.now(),
      };

      const dayProfiles = this.engine.deriveDayCadenceProfiles(
        envelope.userId,
        [chronicle],
        "UTC",
        Date.now()
      );

      await this.repository.saveDayPatterns(envelope.userId, dayProfiles);

      return { status: "SUCCEEDED" };
    } catch (err: any) {
      return {
        status: "FAILED_RETRYABLE",
        error: err?.message || "CadenceLearningConsumer failed",
      };
    }
  }
}
