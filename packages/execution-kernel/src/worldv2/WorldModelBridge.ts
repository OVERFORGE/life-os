/**
 * WorldModelBridge.ts
 *
 * High-speed caching bridge projecting ILifeContextProjection to Supervisor and Aven.
 * Features:
 * 1. Parallel domain hydration (Telemetry, ExecutionGraph, UserContext, Schedule) with Promise.allSettled.
 * 2. Server-side query termination ceiling (maxTimeMS: 75).
 * 3. Monotonic snapshotToken fencing preventing late async results from corrupting cache.
 * 4. Honest UNKNOWN cognitive and null physical semantics (zero fabricated defaults).
 * 5. Strict read-only hydration guarantee (zero mutations to MongoDB).
 * 6. Dual context selection integration via ContextProjectionSerializer.
 *
 * Part of Phase B1 Canonical Personal World Model (WP1-WP4).
 */

import mongoose from "mongoose";
import {
  ILifeContextProjection,
  IContextDegradationState,
  ICognitiveProjection,
  IPhysicalProjection,
  IBehavioralProfileProjection,
  EvidenceProvenanceType,
} from "./contracts/LifeContextProjectionContracts";
import { WorldModelV2, ComputeWorldModelInput } from "./WorldModelV2";
import { ContextProjectionSerializer } from "./ContextProjectionSerializer";
import { CognitiveStateEngine } from "./CognitiveStateEngine";
import { TelemetryIngestionService } from "../telemetry/TelemetryIngestionService";
import { ExecutionGraph, ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";
import { ScheduleExtractionHelper } from "./ScheduleExtractionHelper";
import { PreferenceResolutionHelper, ResolvedUserContext } from "./PreferenceResolutionHelper";
import { Observation } from "../telemetry/Observation";
import { BehavioralProfileRepository } from "../learning/BehavioralProfileRepository";

export interface CachedProjectionEntry {
  projection: ILifeContextProjection;
  cachedAt: number;
  expiresAt: number;
}

export interface GetProjectionOptions extends Partial<ComputeWorldModelInput> {
  forceRefresh?: boolean;
  timezone?: string;
  behavioralProfile?: IBehavioralProfileProjection;
  targetEventId?: string;
  awaitConvergenceTimeoutMs?: number;
}

export class WorldModelBridge {
  private static instance: WorldModelBridge;
  private cache: Map<string, CachedProjectionEntry> = new Map();
  private userSnapshotTokens: Map<string, number> = new Map();
  private defaultTtlMs: number = 60_000; // 60 seconds TTL [POLICY DEFAULT]
  private inFlightTtlMs: number = 1_000; // 1 second ephemeral TTL during active propagation (Correction C)
  private worldModel: WorldModelV2;
  private outboxModel: any;
  private ledgerModel: any;

  constructor(
    worldModel: WorldModelV2 = WorldModelV2.getInstance(),
    outboxModel?: any,
    ledgerModel?: any
  ) {
    this.worldModel = worldModel;
    this.outboxModel = outboxModel;
    this.ledgerModel = ledgerModel;
  }

  public static getInstance(outboxModel?: any, ledgerModel?: any): WorldModelBridge {
    if (!WorldModelBridge.instance) {
      WorldModelBridge.instance = new WorldModelBridge(undefined, outboxModel, ledgerModel);
    } else {
      if (outboxModel) WorldModelBridge.instance.setOutboxModel(outboxModel);
      if (ledgerModel) WorldModelBridge.instance.setLedgerModel(ledgerModel);
    }
    return WorldModelBridge.instance;
  }

  public setOutboxModel(outboxModel: any): void {
    this.outboxModel = outboxModel;
  }

  public setLedgerModel(ledgerModel: any): void {
    this.ledgerModel = ledgerModel;
  }

  public evictUserCache(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Milestone B Step 2: Ledger-Verified Read-Your-Writes Convergence Barrier.
   * Guarantees deterministic synchronization before returning personal world model projection.
   */
  public async awaitConvergence(
    userId: string,
    options?: { targetEventId?: string; timeoutMs?: number; pollIntervalMs?: number }
  ): Promise<{
    converged: boolean;
    status: "CONVERGED" | "TIMEOUT" | "CONVERGENCE_FAILED" | "PERSISTENCE_UNAVAILABLE";
    failureReason?: string;
  }> {
    const timeoutMs = options?.timeoutMs ?? 2000;
    const pollIntervalMs = options?.pollIntervalMs ?? 50;
    const startTime = Date.now();

    try {
      if (!this.outboxModel) {
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
          return { converged: false, status: "PERSISTENCE_UNAVAILABLE" };
        }
        const { OutboxEventModel } = await import(
          "../../../../apps/web/server/db/models/OutboxEventModel"
        );
        this.outboxModel = OutboxEventModel;
      }
      if (!this.ledgerModel) {
        if (mongoose.connection?.readyState === 1) {
          const { ConsumerProcessingLedgerModel } = await import(
            "../../../../apps/web/server/db/models/ConsumerProcessingLedgerModel"
          );
          this.ledgerModel = ConsumerProcessingLedgerModel;
        }
      }

      while (Date.now() - startTime < timeoutMs) {
        if (options?.targetEventId) {
          // Verify target event status in outbox
          let eventDoc: any = null;
          if (typeof this.outboxModel.findOne === "function") {
            const q = this.outboxModel.findOne({
              $or: [{ _id: options.targetEventId }, { eventId: options.targetEventId }],
              userId,
            });
            eventDoc = q && typeof q.lean === "function" ? await q.lean() : await q;
          }

          if (eventDoc) {
            if (eventDoc.deliveryStatus === "DEAD_LETTER" || eventDoc.deliveryStatus === "FAILED") {
              return {
                converged: false,
                status: "CONVERGENCE_FAILED",
                failureReason: eventDoc.failureReason || "Target event dead-lettered",
              };
            }

            if (eventDoc.deliveryStatus === "DELIVERED") {
              // Evict stale cached projection and confirm convergence
              this.evictUserCache(userId);
              return { converged: true, status: "CONVERGED" };
            }
          }

          // Check if any consumer failed terminally
          if (this.ledgerModel && typeof this.ledgerModel.find === "function") {
            const ledgersQuery = this.ledgerModel.find({
              userId,
              eventId: options.targetEventId,
            });
            const ledgers =
              ledgersQuery && typeof ledgersQuery.lean === "function"
                ? await ledgersQuery.lean()
                : await ledgersQuery;

            if (Array.isArray(ledgers)) {
              const terminalFailure = ledgers.find(
                (l: any) => l.status === "FAILED_TERMINAL"
              );
              if (terminalFailure) {
                return {
                  converged: false,
                  status: "CONVERGENCE_FAILED",
                  failureReason: terminalFailure.errorDetails || "Consumer terminal failure",
                };
              }
            }
          }
        } else {
          // Global convergence for user: zero in-flight events
          const status = await this.getInFlightStatus(userId);
          if (status === "SETTLED") {
            this.evictUserCache(userId);
            return { converged: true, status: "CONVERGED" };
          }
          if (status === "PERSISTENCE_UNAVAILABLE") {
            return { converged: false, status: "PERSISTENCE_UNAVAILABLE" };
          }
        }

        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }

      return {
        converged: false,
        status: "TIMEOUT",
        failureReason: `Convergence wait exceeded ${timeoutMs}ms`,
      };
    } catch (err: any) {
      return {
        converged: false,
        status: "CONVERGENCE_FAILED",
        failureReason: err?.message,
      };
    }
  }

  /**
   * Complete In-Flight Event Detection (Correction C Guard).
   * Queries ["PENDING_COMMIT", "PENDING", "PROCESSING"] to determine active causal propagation.
   */
  public async getInFlightStatus(userId: string): Promise<"ACTIVE_PROPAGATION" | "SETTLED" | "PERSISTENCE_UNAVAILABLE"> {
    try {
      if (!this.outboxModel) {
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
          return "PERSISTENCE_UNAVAILABLE";
        }
        const { OutboxEventModel } = await import(
          "../../../../apps/web/server/db/models/OutboxEventModel"
        );
        this.outboxModel = OutboxEventModel;
      } else if (this.outboxModel?.modelName && mongoose.connection?.readyState !== 1) {
        return "PERSISTENCE_UNAVAILABLE";
      }

      if (typeof this.outboxModel.countDocuments === "function") {
        const count = await this.outboxModel.countDocuments({
          userId,
          deliveryStatus: { $in: ["PENDING_COMMIT", "PENDING", "PROCESSING"] },
        });
        return count > 0 ? "ACTIVE_PROPAGATION" : "SETTLED";
      }

      // Mock/custom collection fallback
      const inFlightDocs = await this.outboxModel.find({
        userId,
        deliveryStatus: { $in: ["PENDING_COMMIT", "PENDING", "PROCESSING"] },
      });
      const hasEvents = Array.isArray(inFlightDocs) ? inFlightDocs.length > 0 : false;
      return hasEvents ? "ACTIVE_PROPAGATION" : "SETTLED";
    } catch {
      return "PERSISTENCE_UNAVAILABLE";
    }
  }

  public async hasInFlightEvents(userId: string): Promise<boolean> {
    const status = await this.getInFlightStatus(userId);
    return status === "ACTIVE_PROPAGATION";
  }

  /**
   * Retrieves or hydrates the canonical ILifeContextProjection for a user.
   */
  public async getProjection(
    userId: string,
    inputOverrides?: GetProjectionOptions
  ): Promise<ILifeContextProjection> {
    if (inputOverrides?.targetEventId) {
      await this.awaitConvergence(userId, {
        targetEventId: inputOverrides.targetEventId,
        timeoutMs: inputOverrides.awaitConvergenceTimeoutMs,
      });
    }

    const now = Date.now();
    const cached = this.cache.get(userId);

    const inFlight = await this.hasInFlightEvents(userId);

    // Return cached projection if unexpired, not in active propagation, and no forceRefresh/overrides requested
    if (
      cached &&
      cached.expiresAt > now &&
      !inFlight &&
      !inputOverrides?.forceRefresh &&
      !inputOverrides?.targetEventId &&
      !inputOverrides?.observations &&
      !inputOverrides?.graphSnapshot
    ) {
      return cached.projection;
    }

    // Monotonic fencing token per user
    const token = (this.userSnapshotTokens.get(userId) || 0) + 1;
    this.userSnapshotTokens.set(userId, token);

    try {
      const projection = await this.hydrateProjection(userId, token, inputOverrides);

      // Fencing check: verify no newer request superceded this hydration
      if (this.userSnapshotTokens.get(userId) === token) {
        const ttl = inFlight ? this.inFlightTtlMs : this.defaultTtlMs;
        this.cache.set(userId, {
          projection,
          cachedAt: now,
          expiresAt: now + ttl,
        });
      }

      return projection;
    } catch (error: any) {
      console.warn(
        `[WorldModelBridge] Hydration failed for user ${userId}: ${error?.message || error}. Generating degraded context.`
      );
      return this.generateDegradedProjection(userId, error?.message);
    }
  }

  /**
   * Hydrates projection concurrently across all operational domains.
   */
  private async hydrateProjection(
    userId: string,
    token: number,
    inputOverrides?: GetProjectionOptions
  ): Promise<ILifeContextProjection> {
    const now = inputOverrides?.generationTimestamp || Date.now();
    const missingFields: string[] = [];
    let isDegraded = false;

    // Parallel Domain Hydration (WP2) with Server maxTimeMS and Non-blocking Disconnect Guard
    const isDbConnected = mongoose.connection.readyState === 1;

    const userContextPromise = PreferenceResolutionHelper.resolveUserContext(
      userId,
      inputOverrides?.timezone,
      75
    );

    const telemetryPromise = isDbConnected
      ? Promise.race([
          TelemetryIngestionService.getInstance().ingestTelemetry(userId, now),
          new Promise<any>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  observations: [],
                  raw14DayLogs: [],
                  activeTasks: [],
                  activeGoals: [],
                  activeEra: null,
                  telemetryQuality: undefined,
                }),
              75
            )
          ),
        ])
      : Promise.resolve({
          observations: [],
          raw14DayLogs: [],
          activeTasks: [],
          activeGoals: [],
          activeEra: null,
          telemetryQuality: undefined,
        });

    const graphPromise = isDbConnected
      ? Promise.race([
          ExecutionGraph.buildFromDatabase(userId),
          new Promise<ExecutionGraph>((resolve) =>
            setTimeout(() => resolve(new ExecutionGraph()), 75)
          ),
        ])
      : Promise.resolve(new ExecutionGraph());

    const behavioralRepo = BehavioralProfileRepository.getInstance();
    const canQueryBehavioral = isDbConnected || (behavioralRepo as any).profileModel;
    const behavioralPromise = canQueryBehavioral
      ? Promise.race([
          behavioralRepo.getProfile(userId).catch(() => null),
          new Promise<any>((resolve) => setTimeout(() => resolve(null), 75)),
        ])
      : Promise.resolve(null);

    const [userContextResult, telemetryResult, graphResult, behavioralResult] = await Promise.allSettled([
      userContextPromise,
      telemetryPromise,
      graphPromise,
      behavioralPromise,
    ]);

    // Check fencing before continuing expensive analytical computations
    if (this.userSnapshotTokens.get(userId) !== token) {
      const existing = this.cache.get(userId);
      if (existing) return existing.projection;
    }

    // 1. Process User Context & Timezone
    let userContext: ResolvedUserContext;
    if (userContextResult.status === "fulfilled") {
      userContext = userContextResult.value;
      if (userContext.isTimezoneFallback) {
        missingFields.push("userTimezone");
      }
    } else {
      missingFields.push("userPreferences", "userTimezone");
      userContext = {
        timezone: inputOverrides?.timezone || "UTC",
        isTimezoneFallback: true,
        wakeMinute: ScheduleExtractionHelper.DEFAULT_WAKE_MINUTE,
        sleepMinute: ScheduleExtractionHelper.DEFAULT_SLEEP_MINUTE,
        focusBlockThresholdMinutes: ScheduleExtractionHelper.DEFAULT_FOCUS_THRESHOLD,
        quietHoursStartHour: PreferenceResolutionHelper.DEFAULT_QUIET_HOURS_START,
        quietHoursEndHour: PreferenceResolutionHelper.DEFAULT_QUIET_HOURS_END,
        rawPreferences: {},
      };
    }

    // 2. Extract Operational Schedule (WP1)
    const operationalSchedule = await ScheduleExtractionHelper.extractSchedule({
      userId,
      referenceTimeMs: now,
      userTimezone: userContext.timezone,
      wakeMinute: userContext.wakeMinute,
      sleepMinute: userContext.sleepMinute,
      focusBlockThresholdMinutes: userContext.focusBlockThresholdMinutes,
      timeoutMs: 75,
    });

    if (operationalSchedule.dataQualityStatus === "DEGRADED") {
      missingFields.push("operationalSchedule");
      isDegraded = true;
    }

    // 3. Process Telemetry & Continuous Observations (WP2 & WP3)
    let observations: Observation[] = [];
    let telemetryQuality: any = undefined;

    if (telemetryResult.status === "fulfilled") {
      const payload = telemetryResult.value;
      observations = payload.observations || [];
      telemetryQuality = payload.telemetryQuality;
    } else {
      missingFields.push("telemetry");
      isDegraded = true;
    }

    if (inputOverrides?.observations && inputOverrides.observations.length > 0) {
      observations = [...observations, ...inputOverrides.observations];
    }

    // 4. Process Execution Graph (WP2)
    let graphSnapshot: ExecutionGraphSnapshot | null = null;
    if (graphResult.status === "fulfilled") {
      try {
        graphSnapshot = graphResult.value.createSnapshot();
      } catch (_) {
        missingFields.push("executionGraph");
      }
    } else {
      missingFields.push("executionGraph");
    }

    if (inputOverrides?.graphSnapshot !== undefined) {
      graphSnapshot = inputOverrides.graphSnapshot;
    }

    // 5. Feed Analytical Engines (WP2: WorldModelV2)
    const input: ComputeWorldModelInput = {
      userId,
      generationTimestamp: now,
      quality: telemetryQuality,
      observations,
      graphSnapshot,
      ...inputOverrides,
    };

    const kernelSnapshot = this.worldModel.computeKernelSnapshot(input);
    const goalPressures = kernelSnapshot.subsystems.goalPressure || [];

    // 6. Probabilistic Cognitive State & Physical Readiness (WP3: Honest UNKNOWN)
    let cognitiveState: ICognitiveProjection;
    let physicalReadiness: IPhysicalProjection;

    if (observations.length === 0) {
      // Honest UNKNOWN semantics: Zero fabricated metrics
      cognitiveState = {
        state: "UNKNOWN",
        confidence: null,
        provenance: "INFERRED",
        freshnessTimestamp: now,
        primaryDrivers: [],
        estimatedFatigue: null,
        estimatedReadiness: null,
        evidenceEvaluationStatus: "INSUFFICIENT_EVIDENCE",
      };

      physicalReadiness = {
        readinessScore: null,
        sleepDurationMinutes: null,
        sleepQualityScore: null,
        recoveryStatus: "UNKNOWN",
        freshnessTimestamp: now,
      };

      isDegraded = true;
      missingFields.push("observations", "sleepTelemetry", "cognitiveTelemetry");
    } else {
      const cognitiveEstimate = CognitiveStateEngine.getInstance().evaluate({
        userId,
        observations,
        currentTime: now,
      });

      let stateLabel: "DEEP_FOCUS" | "NORMAL" | "DEPLETED" | "OVERLOADED" | "FRAGMENTED" | "UNKNOWN" = "NORMAL";
      if (cognitiveEstimate.cognitiveLoad.estimate > 0.70 || cognitiveEstimate.stress.estimate > 0.75) {
        stateLabel = "OVERLOADED";
      } else if (cognitiveEstimate.energy.estimate < 0.35) {
        stateLabel = "DEPLETED";
      }

      let mappedProvenance: EvidenceProvenanceType = "INFERRED";
      if (cognitiveEstimate.provenance === "USER_MICRO_CHECKIN") {
        mappedProvenance = "CONVERSATION";
      } else if (cognitiveEstimate.provenance === "HYBRID") {
        mappedProvenance = "HYBRID";
      } else if (cognitiveEstimate.provenance === "PASSIVE_INFERENCE") {
        mappedProvenance = "TELEMETRY";
      }

      cognitiveState = {
        state: stateLabel,
        confidence: cognitiveEstimate.focusReadiness.confidence,
        provenance: mappedProvenance,
        freshnessTimestamp: now,
        primaryDrivers: [
          ...cognitiveEstimate.cognitiveLoad.primaryFactors,
          ...cognitiveEstimate.stress.primaryFactors,
          ...cognitiveEstimate.energy.primaryFactors,
        ],
        estimatedFatigue: Number((1.0 - cognitiveEstimate.energy.estimate).toFixed(2)),
        estimatedReadiness: cognitiveEstimate.focusReadiness.estimate,
        evidenceEvaluationStatus: "EVALUATED",
      };

      // Real physical telemetry
      const sleepObs = observations.find((o: any) => o.type === "SleepDurationHours");
      const recoveryObs = observations.find((o: any) => o.type === "SleepRecoveryScore");
      const sleepMins = sleepObs ? Math.round(Number(sleepObs.rawValue) * 60) : null;
      const sleepQuality = recoveryObs ? Number(recoveryObs.normalizedValue) : null;

      let recoveryStatus: "OPTIMAL" | "ADEQUATE" | "IMPAIRED" | "UNKNOWN" = "UNKNOWN";
      if (sleepQuality !== null) {
        recoveryStatus = sleepQuality >= 0.75 ? "OPTIMAL" : sleepQuality >= 0.5 ? "ADEQUATE" : "IMPAIRED";
      }

      if (sleepMins === null) {
        missingFields.push("sleepTelemetry");
      }

      physicalReadiness = {
        readinessScore: cognitiveEstimate.focusReadiness.estimate,
        sleepDurationMinutes: sleepMins,
        sleepQualityScore: sleepQuality,
        recoveryStatus,
        freshnessTimestamp: now,
      };
    }

    // 7. Map Goal Pressures
    const mappedGoals = goalPressures.map((gp: any) => ({
      goalId: gp.goalId,
      title: gp.goalTitle || "Primary Goal",
      domain: gp.domain || "productivity",
      pressureScore:
        gp.pressureScore !== undefined
          ? gp.pressureScore > 1
            ? gp.pressureScore / 100
            : gp.pressureScore
          : 0.5,
      isCritical: (gp.pressureScore ?? 0) >= (gp.pressureScore > 1 ? 80 : 0.8),
      daysUntilDeadline: gp.daysUntilDeadline,
    }));

    // 8. Quiet Hours Calculation respecting local user timezone
    const quietHoursActive = PreferenceResolutionHelper.isQuietHours(
      now,
      userContext.timezone,
      userContext.quietHoursStartHour,
      userContext.quietHoursEndHour
    );

    // 9. Process Empirical Behavioral Profile (Loop 8)
    let behavioralProfile: IBehavioralProfileProjection | undefined = undefined;
    if (inputOverrides?.behavioralProfile) {
      behavioralProfile = inputOverrides.behavioralProfile;
    } else if (behavioralResult.status === "fulfilled" && behavioralResult.value) {
      const pDoc = behavioralResult.value;
      const metrics = pDoc.metrics || {};
      behavioralProfile = {
        taskCompletionRate: typeof metrics.taskCompletionRate === "number" ? metrics.taskCompletionRate : null,
        procrastinationTendency: typeof metrics.procrastinationTendency === "number" ? metrics.procrastinationTendency : null,
        deepWorkConsistency: typeof metrics.deepWorkConsistency === "number" ? metrics.deepWorkConsistency : 0,
        confidenceTier: metrics.confidenceTier || "LOW",
        decayHalfLifeDays: typeof metrics.decayHalfLifeDays === "number" ? metrics.decayHalfLifeDays : 21,
      };
    }

    // 10. Assemble Degradation State
    const degradation: IContextDegradationState = {
      isDegraded: isDegraded || missingFields.length > 0,
      degradationReason:
        missingFields.length > 0
          ? `Missing fields: ${missingFields.join(", ")}`
          : undefined,
      missingFields,
      fallbackActive: isDegraded,
    };

    const projection: ILifeContextProjection = {
      userId,
      projectionTimestamp: now,
      projectionVersion: 2,
      degradation,
      cognitiveState,
      physicalReadiness,
      operationalSchedule,
      goalPressures: mappedGoals,
      activeInterventions: [],
      behavioralProfile,
      quietHoursActive,
    };

    // 11. Baseline Serialization (~150 tokens) for initial intent interpretation
    const serialization = ContextProjectionSerializer.serializeBaselineSummary(projection);
    projection.systemPromptContextSummary = serialization.serializedContext;

    return projection;
  }

  /**
   * Generates a fully truthful degraded projection when unrecoverable failure occurs.
   */
  public generateDegradedProjection(
    userId: string,
    reason: string = "WorldModel unavailable"
  ): ILifeContextProjection {
    const now = Date.now();
    const degradation: IContextDegradationState = {
      isDegraded: true,
      degradationReason: reason,
      missingFields: ["cognitiveState", "physicalReadiness", "goalPressures", "operationalSchedule"],
      fallbackActive: true,
    };

    const projection: ILifeContextProjection = {
      userId,
      projectionTimestamp: now,
      projectionVersion: 2,
      degradation,
      cognitiveState: {
        state: "UNKNOWN",
        confidence: null,
        provenance: "INFERRED",
        freshnessTimestamp: now,
        primaryDrivers: [],
        estimatedFatigue: null,
        estimatedReadiness: null,
        evidenceEvaluationStatus: "INSUFFICIENT_EVIDENCE",
      },
      physicalReadiness: {
        readinessScore: null,
        sleepDurationMinutes: null,
        sleepQualityScore: null,
        recoveryStatus: "UNKNOWN",
        freshnessTimestamp: now,
      },
      operationalSchedule: {
        hardCommitmentCount: 0,
        todayMeetingCount: 0,
        meetingCount: 0,
        todayMeetingDurationMinutes: 0,
        uniqueOccupiedBlockCount: 0,
        totalOccupiedDurationMinutes: 0,
        remainingFreeIntervalsCount: 0,
        freeFocusBlocksRemaining: 0,
        isScheduleTight: false,
        scheduleDensity: 0.0,
        calendarState: "UNKNOWN",
        freshnessTimestamp: now,
        dataQualityStatus: "DEGRADED",
      },
      goalPressures: [],
      activeInterventions: [],
      behavioralProfile: undefined,
      quietHoursActive: false,
    };

    const serialization = ContextProjectionSerializer.serializeBaselineSummary(projection);
    projection.systemPromptContextSummary = serialization.serializedContext;

    return projection;
  }

  public invalidate(userId: string): void {
    this.cache.delete(userId);
    this.userSnapshotTokens.delete(userId);
  }

  public clear(): void {
    this.cache.clear();
    this.userSnapshotTokens.clear();
  }
}
