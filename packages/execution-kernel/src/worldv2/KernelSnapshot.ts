import { Observation, ObservationType } from "../telemetry/Observation";
import { TelemetryQuality } from "../telemetry/TelemetryQuality";
import { ExecutionGraphSummary } from "./WorldSnapshotV2";
import { LifeStateResult } from "./LifeStateEngine";
import { GoalPressureResult } from "./GoalPressureEngineV2";
import { LearningEngineOutput } from "../learning/LearningEngine";
import { WorldTrend } from "./WorldTrendEngine";
import { WorldPrediction } from "./WorldPredictionEngineV2";

/**
 * Replay Metadata Header
 * Constitutional Ownership: Telemetry Recovery Layer / Replay Harness
 */
export interface ReplayMetadata {
  isReplay: boolean;
  replayId: string;
  fixtureVersion: string;
}

/**
 * Calibration Metadata Header
 * Constitutional Ownership: CalibrationRegistry (Chapter 8)
 */
export interface CalibrationMetadata {
  calibrationVersion: string;
  weightPackageId: string;
  featureFlags: Record<string, boolean>;
  experimentalEngineFlags?: Record<string, boolean>;
}

/**
 * Snapshot Metadata Specification
 * Constitutional Ownership: KernelSnapshotBuilder Aggregator
 */
export interface KernelSnapshotMetadata {
  snapshotId: string;           // Deterministic Snapshot ID e.g. "snap-user123-1785096398950"
  schemaVersion: 1;             // Snapshot schema version
  kernelVersion: "1.0.0";       // Kernel release version
  telemetryVersion: "1.0.0";    // Telemetry ingestion version
  engineVersions: {
    lifeStateVersion: "2.0.0";
    goalPressureVersion: "2.0.0";
    learningVersion: "1.0.0";
    trendVersion: "1.0.0";
    predictionVersion: "1.0.0";
  };
  calibration: CalibrationMetadata;
  generationTimestamp: number;  // Telemetry baseline epoch ms
  pipelineSignature: string;   // SHA-256 deterministic hash
  replayMetadata: ReplayMetadata;
}

/**
 * Subsystem Intelligence Registries
 * Constitutional Ownership: Respective Subsystem Engines
 */
export interface KernelSnapshotSubsystems {
  lifeState: LifeStateResult;
  goalPressure: GoalPressureResult[];
  learning: LearningEngineOutput;
  trends: WorldTrend[];
  predictions: WorldPrediction[];
  [customEngineKey: string]: unknown; // Strongly typed extension point for future engines
}

/**
 * Kernel Diagnostics Registry
 * Constitutional Ownership: Kernel Diagnostics Engine (Chapter 7)
 */
export interface KernelSnapshotDiagnostics {
  isSealed: boolean;
  missingTelemetryTypes: ObservationType[];
  subsystemConfidenceMap: Record<string, number>;
}

/**
 * Canonical KernelSnapshot Contract
 * 
 * Single canonical, immutable, read-only representation of the complete internal intelligence state of LifeOS Kernel.
 * Inherits all laws from Chapter 7 Snapshot Architecture.
 */
export interface KernelSnapshot {
  metadata: KernelSnapshotMetadata;
  userId: string;
  telemetry: {
    quality: TelemetryQuality;
    observations: Observation[];
  };
  executionGraphSummary: ExecutionGraphSummary;
  subsystems: KernelSnapshotSubsystems;
  diagnostics: KernelSnapshotDiagnostics;
}
