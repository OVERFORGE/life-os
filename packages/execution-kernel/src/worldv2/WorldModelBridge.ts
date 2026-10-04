/**
 * WorldModelBridge.ts
 * High-speed caching bridge projecting ILifeContextProjection to Supervisor and Aven.
 * In-memory TTL caching with explicit degraded path handling.
 * Part of Phase 1 Canonical Unified World Model & Context Bridge.
 */

import {
  ILifeContextProjection,
  IContextDegradationState,
  EvidenceProvenanceType,
} from "./contracts/LifeContextProjectionContracts";
import { WorldModelV2, ComputeWorldModelInput } from "./WorldModelV2";
import { ContextProjectionSerializer } from "./ContextProjectionSerializer";
import { CognitiveStateEngine } from "./CognitiveStateEngine";


export interface CachedProjectionEntry {
  projection: ILifeContextProjection;
  cachedAt: number;
  expiresAt: number;
}

export class WorldModelBridge {
  private static instance: WorldModelBridge;
  private cache: Map<string, CachedProjectionEntry> = new Map();
  private defaultTtlMs: number = 60_000; // 60 seconds TTL [POLICY DEFAULT]
  private worldModel: WorldModelV2;

  constructor(worldModel: WorldModelV2 = WorldModelV2.getInstance()) {
    this.worldModel = worldModel;
  }

  public static getInstance(): WorldModelBridge {
    if (!WorldModelBridge.instance) {
      WorldModelBridge.instance = new WorldModelBridge();
    }
    return WorldModelBridge.instance;
  }

  public async getProjection(
    userId: string,
    inputOverrides?: Partial<ComputeWorldModelInput>
  ): Promise<ILifeContextProjection> {
    const now = Date.now();
    const cached = this.cache.get(userId);

    // Return cached projection if valid and unexpired
    if (cached && cached.expiresAt > now && !inputOverrides) {
      return cached.projection;
    }

    try {
      const projection = await this.hydrateProjection(userId, inputOverrides);
      this.cache.set(userId, {
        projection,
        cachedAt: now,
        expiresAt: now + this.defaultTtlMs,
      });
      return projection;
    } catch (error: any) {
      console.warn(
        `[WorldModelBridge] Hydration failed for user ${userId}: ${error?.message || error}. Generating degraded context.`
      );
      return this.generateDegradedProjection(userId, error?.message);
    }
  }

  private async hydrateProjection(
    userId: string,
    inputOverrides?: Partial<ComputeWorldModelInput>
  ): Promise<ILifeContextProjection> {
    const now = Date.now();
    const input: ComputeWorldModelInput = {
      userId,
      generationTimestamp: now,
      ...inputOverrides,
    };

    const kernelSnapshot = this.worldModel.computeKernelSnapshot(input);
    const lifeState = kernelSnapshot.subsystems.lifeState;
    const goalPressures = kernelSnapshot.subsystems.goalPressure;
    const observations = (kernelSnapshot as any).observations || kernelSnapshot.telemetry?.observations || [];

    // Evaluate Probabilistic Cognitive State via CognitiveStateEngine (Phase 3)
    const cognitiveEstimate = CognitiveStateEngine.getInstance().evaluate({
      userId,
      observations,
      currentTime: now,
    });

    let stateLabel: "NORMAL" | "OVERLOADED" | "DEPLETED" = "NORMAL";
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

    const cognitiveState = {
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
    };

    // Map Physical Readiness from observations
    const sleepObs = observations.find((o: any) => o.type === "SleepDurationHours");
    const recoveryObs = observations.find((o: any) => o.type === "SleepRecoveryScore");
    const sleepMins = sleepObs ? Math.round(Number(sleepObs.rawValue) * 60) : 420;
    const sleepQuality = recoveryObs ? Number(recoveryObs.normalizedValue) : 0.8;
    const recoveryStatus = sleepQuality >= 0.75 ? "OPTIMAL" : sleepQuality >= 0.5 ? "REDUCED" : "CRITICAL";

    const physicalReadiness = {
      readinessScore: cognitiveEstimate.focusReadiness.estimate,
      sleepDurationMinutes: sleepMins,
      sleepQualityScore: sleepQuality,
      recoveryStatus: recoveryStatus as any,
      freshnessTimestamp: now,
    };

    // Map Operational Schedule from observations
    const densityObs = observations.find((o: any) => o.type === "ScheduleDensity");
    const deepWorkObs = observations.find((o: any) => o.type === "DeepWorkWindow");
    const meetingHours = densityObs ? Number(densityObs.rawValue) : 2.0;
    const meetingCount = densityObs?.metadata?.meetingCount !== undefined ? Number(densityObs.metadata.meetingCount) : 3;
    const freeBlocks = deepWorkObs ? Math.max(1, Math.round(Number(deepWorkObs.rawValue) / 1.5)) : 2;

    const operationalSchedule = {
      todayMeetingCount: meetingCount,
      todayMeetingDurationMinutes: Math.round(meetingHours * 60),
      freeFocusBlocksRemaining: freeBlocks,
      isScheduleTight: cognitiveEstimate.cognitiveLoad.estimate > 0.65,
      freshnessTimestamp: now,
    };

    const mappedGoals = goalPressures.map((gp: any) => ({
      goalId: gp.goalId,
      title: gp.goalTitle || "Primary Goal",
      domain: gp.domain || "productivity",
      pressureScore: gp.pressureScore !== undefined ? (gp.pressureScore > 1 ? gp.pressureScore / 100 : gp.pressureScore) : 0.5,
      isCritical: (gp.pressureScore ?? 0) >= (gp.pressureScore > 1 ? 80 : 0.8),
      daysUntilDeadline: gp.daysUntilDeadline,
    }));

    const degradation: IContextDegradationState = {
      isDegraded: false,
      missingFields: [],
      fallbackActive: false,
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
      quietHoursActive: this.isQuietHours(now),
    };

    // Serialize summary
    const serialization = ContextProjectionSerializer.serialize(projection);
    projection.systemPromptContextSummary = serialization.serializedContext;

    return projection;
  }

  public generateDegradedProjection(
    userId: string,
    reason: string = "WorldModel unavailable"
  ): ILifeContextProjection {
    const now = Date.now();
    const degradation: IContextDegradationState = {
      isDegraded: true,
      degradationReason: reason,
      missingFields: ["cognitiveState", "physicalReadiness", "goalPressures"],
      fallbackActive: true,
    };

    const projection: ILifeContextProjection = {
      userId,
      projectionTimestamp: now,
      projectionVersion: 2,
      degradation,
      cognitiveState: {
        state: "NORMAL",
        confidence: 0.5,
        provenance: "INFERRED",
        freshnessTimestamp: now,
        primaryDrivers: ["degraded_fallback"],
        estimatedFatigue: 0.5,
        estimatedReadiness: 0.5,
      },
      physicalReadiness: {
        readinessScore: 0.5,
        sleepDurationMinutes: 420,
        sleepQualityScore: 0.5,
        recoveryStatus: "UNKNOWN",
        freshnessTimestamp: now,
      },
      operationalSchedule: {
        todayMeetingCount: 0,
        todayMeetingDurationMinutes: 0,
        freeFocusBlocksRemaining: 0,
        isScheduleTight: false,
        freshnessTimestamp: now,
      },
      goalPressures: [],
      activeInterventions: [],
      quietHoursActive: this.isQuietHours(now),
    };

    const serialization = ContextProjectionSerializer.serialize(projection);
    projection.systemPromptContextSummary = serialization.serializedContext;

    return projection;
  }

  public invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  public clear(): void {
    this.cache.clear();
  }

  private isQuietHours(timestamp: number): boolean {
    const hour = new Date(timestamp).getHours();
    return hour >= 22 || hour < 7; // Quiet hours: 22:00 to 07:00 [POLICY DEFAULT]
  }
}
