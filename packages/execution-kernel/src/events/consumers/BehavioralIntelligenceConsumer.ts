/**
 * BehavioralIntelligenceConsumer.ts
 * 
 * Milestone B — Phase B3: Work Package 4 / Loop 7
 * Canonical Behavioral Intelligence Consumer
 * 
 * Consumes:
 * - domain.task.completed, domain.task.created, domain.task.deferred
 * - domain.signal.logged
 * - domain.physical.workout_logged, domain.health.workout_logged
 * 
 * Strict Invariants:
 * 1. Option C Ingestion: Out-of-order retention guaranteed.
 * 2. Deterministic Observation Identity: obs_{aggregateType}_{aggregateId}_v{aggregateVersion}_{eventOrdinal}.
 * 3. Authoritative Journaling: Journal status updated to APPLIED strictly after profile incorporated.
 * 4. Eviction Safety: Redelivery after ring buffer eviction uses journal to skip metric duplication.
 */

import { ICanonicalConsumer } from "./ConsumerRegistry";
import {
  ICanonicalEventEnvelope,
  ConsumerExecutionStatus,
} from "../contracts/CanonicalEventContracts";
import {
  BehavioralProfileRepository,
  BehavioralObservationDraft,
} from "../../learning/BehavioralProfileRepository";

export interface BehavioralIntelligenceConsumerDependencies {
  profileRepository?: BehavioralProfileRepository;
}

export class BehavioralIntelligenceConsumer implements ICanonicalConsumer {
  public name = "BehavioralIntelligenceConsumer";
  public targetCategories = ["DOMAIN_EVENT" as const, "OBSERVATION_EVENT" as const];
  public targetTypes = [
    "domain.task.completed",
    "domain.task.created",
    "domain.task.deferred",
    "domain.signal.logged",
    "domain.health.workout_logged",
    "domain.physical.workout_logged",
  ];

  private repository: BehavioralProfileRepository;

  constructor(deps?: BehavioralIntelligenceConsumerDependencies) {
    this.repository = deps?.profileRepository || BehavioralProfileRepository.getInstance();
  }

  public async process(
    envelope: ICanonicalEventEnvelope,
    _leaseGeneration: number
  ): Promise<{ status: ConsumerExecutionStatus; error?: string }> {
    try {
      const payload = envelope.payload || {};
      const observationId = `obs_${envelope.aggregateType}_${envelope.aggregateId}_v${envelope.aggregateVersion}_${envelope.eventOrdinal}`;

      // Category derivation
      let category: BehavioralObservationDraft["category"] = "EXECUTION";
      if (envelope.type.startsWith("domain.task.")) {
        category = "EXECUTION";
      } else if (envelope.type.includes("workout")) {
        category = "PHYSICAL";
      } else if (envelope.type.includes("signal")) {
        const key = payload.key || "";
        if (["energy", "mood", "stress", "focus", "deepWorkHours", "anxiety"].includes(key)) {
          category = "COGNITIVE";
        } else if (["sleepHours", "sleepTime", "wakeTime"].includes(key)) {
          category = "ROUTINE";
        } else {
          category = "PHYSICAL";
        }
      }

      const draft: BehavioralObservationDraft = {
        observationId,
        userId: envelope.userId,
        source: envelope.aggregateType,
        category,
        type: envelope.type,
        causalSequence: envelope.causalSequence,
        observedAt: envelope.occurredAt ? new Date(envelope.occurredAt) : new Date(),
        data: {
          ...payload,
          aggregateId: envelope.aggregateId,
          causalSequence: envelope.causalSequence,
        },
      };

      const result = await this.repository.ingestObservation(draft);

      if (result.status === "SUCCEEDED" || result.status === "SKIPPED_ALREADY_APPLIED") {
        return { status: "SUCCEEDED" };
      }

      if (result.status === "CONCURRENT_CONFLICT_RETRY") {
        return {
          status: "FAILED_RETRYABLE",
          error: "CAS projectionRevision conflict; retryable",
        };
      }

      return { status: "SUCCEEDED" };
    } catch (err: any) {
      return {
        status: "FAILED_RETRYABLE",
        error: err?.message || "BehavioralIntelligenceConsumer failed",
      };
    }
  }
}

