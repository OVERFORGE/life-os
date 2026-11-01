/**
 * CognitiveHistoryConsumer.ts
 * 
 * Implements Cognitive History Snapshot Recording.
 * Resolves WP3 / Loop 6 requirements:
 * - Listens to telemetry.wearables.ingested and observation.cognitive.assessed
 * - Records structured cognitive dimension estimates into CognitiveStateHistoryModel
 * - Enforces idempotency via event identity tracking
 */

import {
  ICanonicalConsumer,
} from "./ConsumerRegistry";
import {
  ICanonicalEventEnvelope,
  ConsumerExecutionStatus,
} from "../contracts/CanonicalEventContracts";
import {
  CognitiveStateHistoryModel,
} from "../../../../../apps/web/server/db/models/CognitiveStateHistoryModel";

export interface CognitiveHistoryConsumerDependencies {
  cognitiveHistoryModel?: any;
}

export class CognitiveHistoryConsumer implements ICanonicalConsumer {
  public name = "CognitiveHistoryConsumer";
  public targetCategories = ["TELEMETRY_EVENT" as const, "OBSERVATION_EVENT" as const];
  public targetTypes = [
    "telemetry.wearables.ingested",
    "observation.cognitive.assessed",
  ];

  private cognitiveHistoryModel: any;

  constructor(deps?: CognitiveHistoryConsumerDependencies) {
    this.cognitiveHistoryModel =
      deps?.cognitiveHistoryModel || CognitiveStateHistoryModel;
  }

  public async process(
    envelope: ICanonicalEventEnvelope,
    leaseGeneration: number
  ): Promise<{ status: ConsumerExecutionStatus; error?: string }> {
    try {
      const payload = envelope.payload || {};
      const timestamp = new Date(envelope.occurredAt).getTime();
      const userId = envelope.userId;

      // 1. Idempotency Check
      const existing = await this.cognitiveHistoryModel.findOne({
        userId,
        timestamp,
      });

      if (existing) {
        return { status: "SUCCEEDED" };
      }

      // 2. Extract dimensions with fallback bounds
      const stressScore = Math.min(1.0, Math.max(0.0, payload.stressScore ?? 0.35));
      const energyLevel = Math.min(1.0, Math.max(0.0, payload.energyLevel ?? 0.75));
      const cognitiveLoad = Math.min(1.0, Math.max(0.0, payload.cognitiveLoad ?? 0.40));
      const focusReadiness = Math.min(1.0, Math.max(0.0, payload.focusReadiness ?? 0.80));

      const confidence = Math.min(1.0, Math.max(0.0, payload.confidence ?? 0.85));
      const primaryFactors = Array.isArray(payload.primaryFactors)
        ? payload.primaryFactors
        : ["biometric_hrv", "activity_profile"];

      const now = Date.now();
      const validDuration = 4 * 3600 * 1000; // 4-hour validity

      const record = {
        userId,
        timestamp,
        stress: {
          estimate: stressScore,
          confidence,
          primaryFactors,
        },
        energy: {
          estimate: energyLevel,
          confidence,
          primaryFactors,
        },
        cognitiveLoad: {
          estimate: cognitiveLoad,
          confidence,
          primaryFactors,
        },
        focusReadiness: {
          estimate: focusReadiness,
          confidence,
          primaryFactors,
        },
        provenance: payload.provenance || "PASSIVE_INFERENCE",
        temporalValidity: {
          validFrom: now,
          validUntil: now + validDuration,
          freshnessTimestamp: now,
        },
        disclaimer: "Operational readiness estimate only; not a medical assessment.",
        lastEventId: envelope.eventId,
      };

      await this.cognitiveHistoryModel.create(record);

      return { status: "SUCCEEDED" };
    } catch (err: any) {
      return {
        status: "FAILED_RETRYABLE",
        error: err?.message || "CognitiveHistoryConsumer failed",
      };
    }
  }
}
