/**
 * TemporalContracts.ts
 * 
 * Canonical data contracts for LifeOS Temporal Reality & Cadence Architecture (V3).
 * Decouples:
 * 1. Domain Entity (Task, Goal, InstitutionalCommitment)
 * 2. Temporal Occurrence (Concrete scheduled container on a specific date)
 * 3. Execution Evidence (Append-only chronicle of actual execution intervals)
 * 4. Temporal Projection (Computed on-demand composite for UI / AI)
 */

export type TemporalEntityKind =
  | "HARD_EVENT"          // Inflexible external institutional anchor (lecture, exam, doctor, flight)
  | "ROUTINE_BLOCK"        // Lifestyle & biological cadence (sleep, meals, gym, morning prep, wind-down)
  | "WORK_SESSION"         // Time-blocked focus container executing one or more Tasks
  | "TRANSITION_BUFFER"    // Spatial movement, commute, prep, or decompression between locations
  | "EPHEMERAL_PING";      // Zero-duration contextual alert/alarm ("boil milk", "take creatine")

export type RigidityLevel =
  | "UNMOVABLE"            // Hard anchor: solver will never shift without explicit user override
  | "ELASTIC"              // Soft cadence: solver can shift/compress within elasticity envelope
  | "OPTIONAL";            // Discretionary: can be dropped or deferred if day becomes overloaded

export type TemporalLocationCategory =
  | "HOME"
  | "WORK_SITE"
  | "ACADEMIC"
  | "GYM"
  | "TRANSIT"
  | "THIRD_PLACE"
  | "VIRTUAL"
  | "CUSTOM";

export interface StructuredLocationContext {
  category: TemporalLocationCategory;
  label?: string;                  // e.g. "Campus Hall 4", "Main St Gym", "Downtown Coworking"
  customIdentifier?: string;       // Unique user-defined place ID if configured
  coordinates?: {
    lat: number;
    lng: number;
  };
  requiresPhysicalTransit?: boolean; // false for HOME -> HOME or VIRTUAL -> VIRTUAL
}

export interface TemporalInterval {
  dateOnly: string;                // YYYY-MM-DD in local time
  startMinute: number;             // 0 - 1439 minute of the day (e.g. 780 = 13:00)
  endMinute: number;               // 0 - 1439 (or > 1440 if crossing midnight)
  durationMinutes: number;         // Positive integer duration
  startIsoUtc: string;             // Authoritative ISO 8601 UTC timestamp
  endIsoUtc: string;               // Authoritative ISO 8601 UTC timestamp
  timezone: string;                // IANA Timezone string (e.g. "Asia/Kolkata", "America/New_York", "UTC")
  isMidnightCrossing: boolean;     // True if endMinute > 1440 or interval spans across midnight
}

export type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";

export interface TemporalRecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;                // e.g. 1 (every week), 2 (every 2 weeks)
  daysOfWeek?: number[];           // 0=Sun, 1=Mon, ..., 6=Sat
  effectiveStartDate: string;      // YYYY-MM-DD
  effectiveEndDate?: string;       // YYYY-MM-DD or undefined if open-ended
  count?: number;                  // Maximum occurrences if bounded by count
}

export interface TemporalSeriesTemplate {
  seriesId: string;                // Canonical ID: ser_${timestamp}_${random}
  userId: string;
  title: string;
  kind: TemporalEntityKind;
  locationContext: StructuredLocationContext;
  recurrence: TemporalRecurrenceRule;
  baseStartTime: string;           // HH:MM (24-hour format)
  baseDurationMinutes: number;
  linkedEntity?: {
    entityType: "task" | "goal" | "none";
    entityId?: string;
  };
  status: "ACTIVE" | "ARCHIVED";
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export type OccurrenceStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED"
  | "RESCHEDULED";

export type OccurrenceOverrideType =
  | "NONE"
  | "SINGLE_INSTANCE_MODIFIED"
  | "SINGLE_INSTANCE_CANCELLED";

export interface TemporalOccurrence {
  occurrenceId: string;            // occ_${seriesId}_${YYYYMMDD} OR occ_adhoc_${timestamp}_${random}
  userId: string;
  seriesId?: string;               // Defined if projected from a recurring series template
  title: string;
  kind: TemporalEntityKind;
  dateOnly: string;                // YYYY-MM-DD in local time
  plannedInterval: TemporalInterval;
  locationContext: StructuredLocationContext;
  rigidity: RigidityLevel;
  status: OccurrenceStatus;
  linkedEntity?: {
    entityType: "task" | "goal" | "workout" | "none";
    entityId?: string;
    taskTitle?: string;
  };
  version: number;                 // Optimistic concurrency version
  overrideType: OccurrenceOverrideType;
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface ExecutionChronicleEntry {
  chronicleId: string;             // chron_${timestamp}_${random}
  userId: string;
  occurrenceId?: string;           // Optional link to scheduled TemporalOccurrence
  entityType: "task" | "goal" | "workout" | "routine" | "general";
  entityId?: string;
  title: string;
  startedAtMs: number;
  endedAtMs: number;
  durationMinutes: number;
  interruptionsCount: number;
  completedWorkUnits?: string[];   // Specific deliverables or subtask titles verified complete
  notes?: string;
  source: "aven_voice" | "web_manual" | "mobile_touch" | "desktop_heartbeat" | "imported";
  createdAt: number;
}

export interface CadenceRoutineBlock {
  category: "SLEEP" | "PREP" | "MEAL" | "COMMUTE" | "GYM" | "WIND_DOWN" | "FOCUS";
  title: string;
  targetStartMinute: number;       // 0 - 1439
  targetEndMinute: number;         // 0 - 1439
  durationMinutes: number;
  elasticityRatio: number;         // 0.0 (rigid) to 1.0 (very flexible)
  confidence: number;              // 0.0 to 1.0 based on sample size and variance
  varianceMinutes: number;         // Standard deviation of actual execution
}

export interface DayCadenceProfile {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun .. 6=Sat
  baselineWakeMinute: number;
  baselineSleepMinute: number;
  routines: CadenceRoutineBlock[];
  preferredFocusWindows: Array<{ startMinute: number; endMinute: number }>;
  commuteEstimates: Array<{ fromLocation: string; toLocation: string; durationMinutes: number }>;
  sampleCount: number;
  updatedAt: number;
}

/**
 * Deterministic helper to construct canonical occurrence IDs
 */
export function buildOccurrenceId(seriesId: string | undefined, dateOnly: string, fallbackId?: string): string {
  if (seriesId) {
    const cleanDate = dateOnly.replace(/-/g, "");
    return `occ_${seriesId}_${cleanDate}`;
  }
  return fallbackId || `occ_adhoc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}
