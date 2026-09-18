/**
 * Canonical Versioned Observation Model
 * 
 * Represents an immutable, versioned, traceable factual event extracted from telemetry.
 * Inherits all constitutional rules from Chapter 3 & Chapter 7 Section 13.
 */

export type ObservationType =
  | "HighPhysiologicalStress"
  | "EnergyDeficit"
  | "SleepDeprivation"
  | "TaskExecutionVelocity"
  | "CadenceDrift"
  | "HabitDecay"
  | "GoalTargetApproach"
  | "PhaseTransition";

export interface ObservationOwnership {
  sourceCollection: string;     // e.g. "dailylogs", "tasks", "goals", "habitlogs", "eras"
  sourceEntityId: string;       // Originating MongoDB ObjectId string
  originatingSubsystem: string; // e.g. "PhysiologyTelemetry", "ExecutionTelemetry", "MacroTelemetry"
  createdAt: number;            // UTC Epoch ms timestamp
}

export interface ObservationMetadata {
  windowDays?: number;
  windowStartTimestamp?: number;
  windowEndTimestamp?: number;
  goalId?: string;
  taskId?: string;
  completionRate?: number;
  rollingAverage?: number;
  trend?: "rising" | "stable" | "falling";
  [key: string]: any;
}

export interface Observation {
  schemaVersion: 1;             // Schema version for replay compatibility
  telemetryVersion: "1.0.0";   // Telemetry extraction version string
  id: string;                   // Deterministic Unique Identifier
  type: ObservationType;
  userId: string;
  timestamp: number;            // Telemetry epoch ms (UTC)
  generatedAt: number;          // Generation epoch ms (UTC)
  generatedBy: string;          // "ObservationMapper-v1"
  confidence: number;           // Data quality confidence (0.0 to 1.0)
  normalizedValue: number;      // First-class 0.0 to 1.0 normalized value
  rawValue: number;             // First-class raw telemetry value
  unit: string;                 // First-class measurement unit
  metadata: ObservationMetadata;
  ownership: ObservationOwnership;
}

/**
 * Creates an immutable frozen Observation instance.
 */
export function createFrozenObservation(data: Omit<Observation, "schemaVersion" | "telemetryVersion">): Observation {
  const observation: Observation = {
    schemaVersion: 1,
    telemetryVersion: "1.0.0",
    ...data,
  };
  return Object.freeze(observation);
}
