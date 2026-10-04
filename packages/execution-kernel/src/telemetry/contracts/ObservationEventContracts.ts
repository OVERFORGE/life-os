/**
 * ObservationEventContracts.ts
 * Authoritative contracts for the Observation & Continuous Telemetry Engine (Phase 2).
 * Strictly typed, zero any, deterministic IDs.
 */

export type ObservationType =
  | "HighPhysiologicalStress"
  | "EnergyDeficit"
  | "SleepDeprivation"
  | "TaskExecutionVelocity"
  | "CadenceDrift"
  | "HabitDecay"
  | "GoalTargetApproach"
  | "PhaseTransition"
  | "ScheduleDensity"
  | "CalendarFragmentation"
  | "DeepWorkWindow"
  | "SleepDurationHours"
  | "SleepRecoveryScore"
  | "WorkoutCompleted"
  | "AppInterruptionFrequency";

export interface IEvidenceProvenance {
  source: "calendar" | "wearable" | "tasks" | "dailylog" | "system" | "manual";
  sourceId: string;
  subsystem: string;
  extractedAt: number;
  fingerprint?: string;
}

export interface IObservationEvent {
  id: string; // Deterministic obs-{type}-{sourceId}-{timestamp}
  type: ObservationType;
  userId: string;
  timestamp: number;
  generatedAt: number;
  normalizedValue: number; // 0.0 - 1.0
  rawValue: number | string | boolean | Record<string, unknown>;
  unit: string;
  confidence: number; // Epistemic quality (0.0 to 1.0)
  metadata: Record<string, unknown>;
  provenance: IEvidenceProvenance;
}

export interface RawCalendarEvent {
  id: string;
  title: string;
  startTime: number; // epoch ms
  endTime: number;   // epoch ms
  isAllDay?: boolean;
  status?: "confirmed" | "tentative" | "cancelled";
}

export interface RawWearableData {
  source: "apple_health" | "google_fit" | "whoop" | "oura" | "garmin" | "synthetic";
  timestamp: number;
  sleepHours?: number;
  sleepQualityScore?: number; // 0-100
  restingHeartRate?: number;  // bpm
  steps?: number;
  activeMinutes?: number;
  hrvMs?: number;
}

export interface RawTaskActivity {
  taskId: string;
  title: string;
  completedAt: number;
  scheduledAt?: number;
  priority?: string;
  velocityScore?: number;
}

export interface ObservationIngestionBatchResult {
  totalSubmitted: number;
  insertedCount: number;
  duplicateCount: number;
  failedCount: number;
  durationMs: number;
  observationIds: string[];
}
