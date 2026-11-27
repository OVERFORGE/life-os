/**
 * CognitiveHistoryConsumer.ts
 * 
 * Implements Cognitive History Snapshot Recording.
 * Resolves WP3 / Loop 6 requirements:
 * - Listens to telemetry.wearables.ingested and observation.cognitive.assessed
 * - Records structured cognitive dimension estimates into CognitiveStateHistoryModel
 * - Enforces idempotency via event identity tracking
 */

import mongoose from "mongoose";
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
import { DailyLog } from "../../../../../apps/web/server/db/models/DailyLog";
import { CognitiveStateEngine } from "../../worldv2/CognitiveStateEngine";
import { ObservationMapper } from "../../telemetry/ObservationMapper";
import { Observation, createFrozenObservation } from "../../telemetry/Observation";
import { ObservationPipeline } from "../../telemetry/pipeline/ObservationPipeline";
import { UserMicroCheckinInput, CognitiveProvenanceType } from "../../worldv2/contracts/CognitiveStateContracts";

export interface CognitiveHistoryConsumerDependencies {
  cognitiveHistoryModel?: any;
  dailyLogModel?: any;
  cognitiveStateEngine?: CognitiveStateEngine;
  observationPipeline?: ObservationPipeline;
}

function normalizeScaleScore(val: unknown): number | undefined {
  if (typeof val !== "number" || Number.isNaN(val)) return undefined;
  const normalized = val <= 5 ? val / 5 : val / 10;
  return Math.min(1.0, Math.max(0.0, normalized));
}

export class CognitiveHistoryConsumer implements ICanonicalConsumer {
  public name = "CognitiveHistoryConsumer";
  public targetCategories = ["DOMAIN_EVENT" as const, "TELEMETRY_EVENT" as const, "OBSERVATION_EVENT" as const];
  public targetTypes = [
    "telemetry.wearables.ingested",
    "observation.cognitive.assessed",
    "domain.daily_log.updated",
    "domain.signal.logged",
  ];

  private cognitiveHistoryModel: any;
  private dailyLogModel: any;
  private cognitiveStateEngine: CognitiveStateEngine;
  private observationPipeline: ObservationPipeline;

  constructor(deps?: CognitiveHistoryConsumerDependencies) {
    this.cognitiveHistoryModel =
      deps?.cognitiveHistoryModel || CognitiveStateHistoryModel;
    this.dailyLogModel = deps?.dailyLogModel || DailyLog;
    this.cognitiveStateEngine = deps?.cognitiveStateEngine || CognitiveStateEngine.getInstance();
    this.observationPipeline = deps?.observationPipeline || ObservationPipeline.getInstance();
  }

  public async process(
    envelope: ICanonicalEventEnvelope,
    _leaseGeneration: number
  ): Promise<{ status: ConsumerExecutionStatus; error?: string }> {
    try {
      const payload = envelope.payload || {};
      const timestamp = new Date(envelope.occurredAt).getTime() || Date.now();
      const userId = envelope.userId;

      // 1. Idempotency Check by canonical eventId (and timestamp fallback for legacy mocks)
      const existingByEvent = await this.cognitiveHistoryModel.findOne({
        userId,
        lastEventId: envelope.eventId,
      });
      if (existingByEvent) {
        return { status: "SUCCEEDED" };
      }

      if (envelope.type === "observation.cognitive.assessed") {
        const existingByTs = await this.cognitiveHistoryModel.findOne({
          userId,
          timestamp,
        });
        if (existingByTs) {
          return { status: "SUCCEEDED" };
        }
      }

      // 2. If observation.cognitive.assessed already carries complete calibrated dimensions, honor them
      if (
        envelope.type === "observation.cognitive.assessed" &&
        typeof payload.stressScore === "number" &&
        typeof payload.energyLevel === "number" &&
        typeof payload.cognitiveLoad === "number" &&
        typeof payload.focusReadiness === "number"
      ) {
        const confidence = Math.min(1.0, Math.max(0.0, payload.confidence ?? 0.85));
        const primaryFactors = Array.isArray(payload.primaryFactors) ? payload.primaryFactors : [];
        const now = Date.now();
        const record = {
          userId,
          timestamp,
          stress: { estimate: Math.min(1.0, Math.max(0.0, payload.stressScore)), confidence, primaryFactors },
          energy: { estimate: Math.min(1.0, Math.max(0.0, payload.energyLevel)), confidence, primaryFactors },
          cognitiveLoad: { estimate: Math.min(1.0, Math.max(0.0, payload.cognitiveLoad)), confidence, primaryFactors },
          focusReadiness: { estimate: Math.min(1.0, Math.max(0.0, payload.focusReadiness)), confidence, primaryFactors },
          provenance: (payload.provenance || "PASSIVE_INFERENCE") as CognitiveProvenanceType,
          temporalValidity: {
            validFrom: now,
            validUntil: now + 4 * 3600 * 1000,
            freshnessTimestamp: now,
          },
          disclaimer: "Operational readiness estimate only; not a medical assessment.",
          lastEventId: envelope.eventId,
        };
        await this.persistRecordIdempotently(userId, envelope.eventId, record);
        return { status: "SUCCEEDED" };
      }

      // 3. Build real Observations & optional MicroCheckin from domain event + recent DailyLogs
      const observations: Observation[] = [];
      let recentMicroCheckin: UserMicroCheckinInput | null = null;

      // Load recent DailyLogs when DB is connected or mock model injected
      let recentLogs: any[] = [];
      try {
        const isDbReady = Boolean(mongoose.connection && mongoose.connection.readyState === 1);
        if (isDbReady || this.dailyLogModel !== DailyLog) {
          const userQueryId = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;
          const q = this.dailyLogModel.find({ userId: userQueryId });
          if (q && typeof q.sort === "function") {
            const sorted = q.sort({ date: -1 });
            const limited = typeof sorted.limit === "function" ? sorted.limit(7) : sorted;
            recentLogs = typeof limited.lean === "function" ? await limited.lean() : await limited;
          }
        }
      } catch {
        recentLogs = [];
      }

      if (recentLogs.length > 0) {
        observations.push(
          ...ObservationMapper.toObservations({
            userId,
            generationTimestamp: timestamp,
            dailyLogs: recentLogs,
            tasks: [],
            goals: [],
          })
        );
      }

      // Map direct event evidence (works even in unit tests without DailyLog history)
      if (envelope.type === "domain.daily_log.updated") {
        if (typeof payload.sleepHours === "number") {
          observations.push(
            createFrozenObservation({
              id: `obs-cog-sleep-${envelope.eventId}`,
              type: "SleepDurationHours",
              userId,
              timestamp,
              generatedAt: timestamp,
              generatedBy: "CognitiveHistoryConsumer",
              confidence: 0.95,
              normalizedValue: Math.min(1.0, Math.max(0.0, payload.sleepHours / 8.0)),
              rawValue: payload.sleepHours,
              unit: "hours",
              metadata: {},
              ownership: {
                sourceCollection: "dailylogs",
                sourceEntityId: envelope.aggregateId,
                originatingSubsystem: "DailyLog",
                createdAt: timestamp,
              },
            })
          );
        }
        const perceivedEnergy = normalizeScaleScore(payload.mentalEnergy);
        const perceivedStress = normalizeScaleScore(payload.mentalStress);
        if (perceivedEnergy !== undefined || perceivedStress !== undefined) {
          recentMicroCheckin = {
            userId,
            timestamp,
            ...(perceivedEnergy !== undefined ? { perceivedEnergy } : {}),
            ...(perceivedStress !== undefined ? { perceivedStress } : {}),
          };
        }
        if (typeof payload.deepWorkHours === "number") {
          observations.push(
            createFrozenObservation({
              id: `obs-cog-dw-${envelope.eventId}`,
              type: "DeepWorkWindow",
              userId,
              timestamp,
              generatedAt: timestamp,
              generatedBy: "CognitiveHistoryConsumer",
              confidence: 0.9,
              normalizedValue: Math.min(1.0, Math.max(0.0, payload.deepWorkHours / 6.0)),
              rawValue: payload.deepWorkHours,
              unit: "hours",
              metadata: {},
              ownership: {
                sourceCollection: "dailylogs",
                sourceEntityId: envelope.aggregateId,
                originatingSubsystem: "DailyLog",
                createdAt: timestamp,
              },
            })
          );
        }
      } else if (envelope.type === "domain.signal.logged") {
        const key = String(payload.key || "");
        const val = Number(payload.value);
        if (!Number.isNaN(val)) {
          if (key === "sleepHours") {
            observations.push(
              createFrozenObservation({
                id: `obs-cog-sig-sleep-${envelope.eventId}`,
                type: "SleepDurationHours",
                userId,
                timestamp,
                generatedAt: timestamp,
                generatedBy: "CognitiveHistoryConsumer",
                confidence: 0.95,
                normalizedValue: Math.min(1.0, Math.max(0.0, val / 8.0)),
                rawValue: val,
                unit: "hours",
                metadata: {},
                ownership: {
                  sourceCollection: "dailylogs",
                  sourceEntityId: envelope.aggregateId,
                  originatingSubsystem: "SignalLog",
                  createdAt: timestamp,
                },
              })
            );
          } else if (key === "energy" || key === "stress") {
            const norm = normalizeScaleScore(val);
            if (norm !== undefined) {
              recentMicroCheckin = {
                userId,
                timestamp,
                ...(key === "energy" ? { perceivedEnergy: norm } : { perceivedStress: norm }),
              };
            }
          }
        }
      } else if (envelope.type === "telemetry.wearables.ingested") {
        if (typeof payload.sleepHours === "number" || typeof payload.sleepDurationHours === "number") {
          const hrs = payload.sleepHours ?? payload.sleepDurationHours;
          observations.push(
            createFrozenObservation({
              id: `obs-cog-wear-sleep-${envelope.eventId}`,
              type: "SleepDurationHours",
              userId,
              timestamp,
              generatedAt: timestamp,
              generatedBy: "CognitiveHistoryConsumer",
              confidence: 0.95,
              normalizedValue: Math.min(1.0, Math.max(0.0, hrs / 8.0)),
              rawValue: hrs,
              unit: "hours",
              metadata: {},
              ownership: {
                sourceCollection: "wearable_telemetry",
                sourceEntityId: envelope.aggregateId,
                originatingSubsystem: "WearableTelemetry",
                createdAt: timestamp,
              },
            })
          );
        }
        if (typeof payload.sleepQuality === "number") {
          observations.push(
            createFrozenObservation({
              id: `obs-cog-wear-rec-${envelope.eventId}`,
              type: "SleepRecoveryScore",
              userId,
              timestamp,
              generatedAt: timestamp,
              generatedBy: "CognitiveHistoryConsumer",
              confidence: 0.9,
              normalizedValue: Math.min(1.0, Math.max(0.0, payload.sleepQuality > 1 ? payload.sleepQuality / 100 : payload.sleepQuality)),
              rawValue: payload.sleepQuality,
              unit: "score",
              metadata: {},
              ownership: {
                sourceCollection: "wearable_telemetry",
                sourceEntityId: envelope.aggregateId,
                originatingSubsystem: "WearableTelemetry",
                createdAt: timestamp,
              },
            })
          );
        }
      }

      if (observations.length > 0) {
        await this.observationPipeline.ingestObservations(observations).catch(() => {});
      }

      const estimate = this.cognitiveStateEngine.evaluate({
        userId,
        observations,
        currentTime: timestamp,
        recentMicroCheckin,
      });

      const record = {
        userId,
        timestamp: estimate.timestamp,
        stress: {
          estimate: estimate.stress.estimate,
          confidence: estimate.stress.confidence,
          primaryFactors: estimate.stress.primaryFactors,
        },
        energy: {
          estimate: estimate.energy.estimate,
          confidence: estimate.energy.confidence,
          primaryFactors: estimate.energy.primaryFactors,
        },
        cognitiveLoad: {
          estimate: estimate.cognitiveLoad.estimate,
          confidence: estimate.cognitiveLoad.confidence,
          primaryFactors: estimate.cognitiveLoad.primaryFactors,
        },
        focusReadiness: {
          estimate: estimate.focusReadiness.estimate,
          confidence: estimate.focusReadiness.confidence,
          primaryFactors: estimate.focusReadiness.primaryFactors,
        },
        provenance: estimate.provenance,
        temporalValidity: estimate.temporalValidity,
        disclaimer: estimate.disclaimer,
        lastEventId: envelope.eventId,
      };

      await this.persistRecordIdempotently(userId, envelope.eventId, record);

      return { status: "SUCCEEDED" };
    } catch (err: any) {
      return {
        status: "FAILED_RETRYABLE",
        error: err?.message || "CognitiveHistoryConsumer failed",
      };
    }
  }

  private async persistRecordIdempotently(userId: string, eventId: string, record: Record<string, any>): Promise<void> {
    if (
      this.cognitiveHistoryModel === CognitiveStateHistoryModel &&
      typeof this.cognitiveHistoryModel.findOneAndUpdate === "function"
    ) {
      await this.cognitiveHistoryModel.findOneAndUpdate(
        { userId, lastEventId: eventId },
        { $setOnInsert: record },
        { upsert: true, returnDocument: "after" }
      );
      return;
    }
    await this.cognitiveHistoryModel.create(record);
  }
}
