import { KernelSnapshot, KernelSnapshotMetadata } from "./KernelSnapshot";
import { Observation, ObservationType } from "../telemetry/Observation";
import { TelemetryQuality } from "../telemetry/TelemetryQuality";
import { ExecutionGraphSummary } from "./WorldSnapshotV2";
import { LifeStateResult } from "./LifeStateEngine";
import { GoalPressureResult } from "./GoalPressureEngineV2";
import { LearningEngineOutput } from "../learning/LearningEngine";
import { WorldTrend } from "./WorldTrendEngine";
import { WorldPrediction } from "./WorldPredictionEngineV2";

export interface BuildKernelSnapshotInput {
  userId: string;
  generationTimestamp: number;
  quality: TelemetryQuality;
  observations: Observation[];
  executionGraphSummary: ExecutionGraphSummary;
  lifeState: LifeStateResult;
  goalPressure: GoalPressureResult[];
  learning: LearningEngineOutput;
  trends: WorldTrend[];
  predictions: WorldPrediction[];
  isReplay?: boolean;
  replayId?: string;
}

/**
 * Production Deep Freeze Specification
 * Recursively applies Object.freeze across nested object trees and arrays.
 * 
 * LIMITATION POLICY: Maps and Sets are intentionally NOT permitted inside serializable
 * KernelSnapshot instances. Only plain objects, arrays, and primitives are frozen to
 * guarantee 100% JSON serialization safety and replay hash determinism.
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  const record = obj as Record<string, unknown>;
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const value = record[prop];
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  });

  return Object.freeze(obj);
}

/**
 * KernelSnapshotBuilder
 * 
 * SOLE CONSTITUTIONAL BUILDER & SEALER of KernelSnapshot instances (Chapter 7).
 * Pure aggregation, schema validation, metadata attachment, and deep freezing ONLY.
 * ZERO business logic or score computation.
 */
export class KernelSnapshotBuilder {
  static build(input: BuildKernelSnapshotInput): KernelSnapshot {
    const {
      userId,
      generationTimestamp,
      quality,
      observations,
      executionGraphSummary,
      lifeState,
      goalPressure,
      learning,
      trends,
      predictions,
      isReplay = false,
      replayId = `replay-${userId}-${generationTimestamp}`,
    } = input;

    // 1. Validate Engine Output Completeness
    if (!lifeState || !goalPressure || !learning || !trends || !predictions) {
      throw new Error("[KernelSnapshotBuilder] Failed completeness check: all subsystem engine outputs must be non-null.");
    }

    // 2. Derive Missing Telemetry Types
    const missingTelemetryTypes: ObservationType[] = (quality.defects?.missingLogsCount || 0) > 0
      ? (lifeState.diagnostics?.missingObservationTypes || [])
      : [];

    /**
     * Subsystem Confidence Map
     * Uses explicit engine confidence output where available; falls back to quality.overallConfidence.
     * TODO (Phase B2.2 / B2.3): Expose top-level confidence fields on GoalPressureResult and LearningEngineOutput.
     */
    const subsystemConfidenceMap: Record<string, number> = Object.freeze({
      lifeState: lifeState.confidence,
      goalPressure: quality.overallConfidence,
      learning: quality.overallConfidence,
      trends: trends[0]?.confidence ?? quality.overallConfidence,
      predictions: predictions[0]?.confidence ?? quality.overallConfidence,
    });

    // 3. Generate Deterministic Pipeline Signature Hash (SHA-256 simulation using deterministic string)
    const topGoalPressure = goalPressure[0]?.pressureScore || 0;
    const pipelineSignature = `sha256-${userId}-${generationTimestamp}-${observations.length}-${lifeState.state}-${topGoalPressure}`;

    // 4. Construct Metadata Header
    const metadata: KernelSnapshotMetadata = Object.freeze({
      snapshotId: `snap-${userId}-${generationTimestamp}`,
      schemaVersion: 1,
      kernelVersion: "1.0.0",
      telemetryVersion: "1.0.0",
      engineVersions: Object.freeze({
        lifeStateVersion: "2.0.0",
        goalPressureVersion: "2.0.0",
        learningVersion: "1.0.0",
        trendVersion: "1.0.0",
        predictionVersion: "1.0.0",
      }),
      calibration: Object.freeze({
        calibrationVersion: "1.0.0",
        weightPackageId: "weights-v1-standard",
        featureFlags: Object.freeze({ enableExperimentalRecoveryScoring: false }),
      }),
      generationTimestamp,
      pipelineSignature,
      replayMetadata: Object.freeze({
        isReplay,
        replayId,
        fixtureVersion: "v1-golden",
      }),
    });

    // 5. Assemble KernelSnapshot Object Tree
    const rawSnapshot: KernelSnapshot = {
      metadata,
      userId,
      telemetry: {
        quality,
        observations,
      },
      executionGraphSummary,
      subsystems: {
        lifeState,
        goalPressure,
        learning,
        trends,
        predictions,
      },
      diagnostics: {
        isSealed: true,
        missingTelemetryTypes,
        subsystemConfidenceMap,
      },
    };

    // 6. Apply Deep Freeze & Return Immutable Snapshot
    return deepFreeze(rawSnapshot);
  }
}
