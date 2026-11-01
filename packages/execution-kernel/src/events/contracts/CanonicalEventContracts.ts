/**
 * CanonicalEventContracts.ts
 * 
 * Strict contracts governing the Unified Causal Integration Layer (Milestone B — Phase B2).
 * Establishes five-tier event taxonomy, Option B deterministic event identity,
 * monotonic causal sequencing, and canonical consumer operation identities.
 */

export type CanonicalEventCategory =
  | "DOMAIN_EVENT"
  | "TELEMETRY_EVENT"
  | "ANALYTICAL_EVENT"
  | "SYSTEM_EVENT"
  | "OBSERVATION_EVENT";

export type AggregateType =
  | "task"
  | "goal"
  | "occurrence"
  | "dailylog"
  | "user"
  | "workout"
  | "autonomous_cycle"
  | "autonomous_intervention"
  | "autonomous_action"
  | "workflow";

export type OutboxDeliveryStatus =
  | "PENDING_COMMIT"
  | "PENDING"
  | "PROCESSING"
  | "DELIVERED"
  | "DEAD_LETTER"
  | "ABORTED";

export type ConsumerExecutionStatus =
  | "SUCCEEDED"
  | "SKIPPED_STALE"
  | "FAILED_RETRYABLE"
  | "FAILED_TERMINAL";

export type ConsumerLifecycleState =
  | "NOT_YET_APPLIED"
  | "ALREADY_APPLIED"
  | "ALREADY_SUBSUMED"
  | "RETRYABLE_FAILURE";

export interface ICanonicalEventEnvelope<TPayload = any> {
  /** Deterministic Option B event ID: evt_{aggregateType}_{aggregateId}_v{aggregateVersion}_{eventOrdinal}_{eventDiscriminator} */
  eventId: string;
  userId: string;
  category: CanonicalEventCategory;
  type: string;
  aggregateId: string;
  aggregateType: AggregateType;
  aggregateVersion: number;
  eventOrdinal: number;
  causalSequence: number;
  occurredAt: number;
  recordedAt: number;
  correlationId: string;
  causalityRef?: string;
  source: string;
  payload: TPayload;
  metadata?: {
    clientMutationId?: string;
    idempotencyKey?: string;
    fencingEpoch?: number;
    traceId?: string;
    [key: string]: any;
  };
}

/**
 * Deterministic Option B Event Identity Formatter.
 * Format: evt_{aggregateType}_{aggregateId}_v{aggregateVersion}_{eventOrdinal}_{eventDiscriminator}
 */
export function formatCanonicalEventId(
  aggregateType: string,
  aggregateId: string,
  aggregateVersion: number,
  eventOrdinal: number,
  eventDiscriminator: string
): string {
  const cleanType = (aggregateType || "agg").toLowerCase().trim();
  const cleanId = String(aggregateId).replace(/[^a-zA-Z0-9_\-]/g, "");
  const cleanDisc = (eventDiscriminator || "evt").toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return `evt_${cleanType}_${cleanId}_v${aggregateVersion}_${eventOrdinal}_${cleanDisc}`;
}

/**
 * Calculates monotonic causal sequence token.
 * Formula: (aggregateVersion * 1000) + eventOrdinal
 * Enforces strict boundary: 0 <= eventOrdinal < 1000 and non-negative integer aggregateVersion.
 */
export function calculateCausalSequence(aggregateVersion: number, eventOrdinal: number = 0): number {
  if (!Number.isInteger(aggregateVersion) || aggregateVersion < 0) {
    throw new Error(`aggregateVersion must be a non-negative integer, received: ${aggregateVersion}`);
  }
  if (!Number.isInteger(eventOrdinal) || eventOrdinal < 0 || eventOrdinal >= 1000) {
    throw new Error(`eventOrdinal must be an integer in range [0, 999], received: ${eventOrdinal}`);
  }
  return (aggregateVersion * 1000) + eventOrdinal;
}

/**
 * Formats Canonical Consumer Operation Identity.
 * Formula: ${consumerName}_${eventId}
 */
export function formatConsumerOpId(consumerName: string, eventId: string): string {
  return `${consumerName}_${eventId}`;
}

// ============================================================================
// DOMAIN EVENT PAYLOADS
// ============================================================================

export interface TaskCompletedPayload {
  taskId: string;
  userId: string;
  completedAt: string;
  goalId?: string;
  title: string;
}

export interface TaskCreatedPayload {
  taskId: string;
  userId: string;
  title: string;
  dueDate: string;
  goalId?: string;
  priority?: "low" | "medium" | "high";
}

export interface TaskDeferredPayload {
  taskId: string;
  userId: string;
  originalDueDate: string;
  newDueDate: string;
}

export interface GoalCreatedPayload {
  goalId: string;
  userId: string;
  title: string;
  nature: "finite_deliverable" | "habitual_cadence";
  targetDate?: string;
}

export interface GoalProgressUpdatedPayload {
  goalId: string;
  userId: string;
  previousProgress: number;
  newProgress: number;
  triggerEventId?: string;
}

export interface GoalCompletedPayload {
  goalId: string;
  userId: string;
  completedAt: string;
  finalScore?: number;
}

export interface OccurrenceScheduledPayload {
  occurrenceId: string;
  userId: string;
  title: string;
  dateOnly: string;
  startIsoUtc: string;
  endIsoUtc: string;
  kind: string;
}

export interface OccurrenceRescheduledPayload {
  occurrenceId: string;
  userId: string;
  previousInterval: {
    startIsoUtc: string;
    endIsoUtc: string;
  };
  newInterval: {
    startIsoUtc: string;
    endIsoUtc: string;
  };
}

export interface WorkoutLoggedPayload {
  sessionId: string;
  userId: string;
  date: string;
  trainingStrainScore?: number;
  exercisesCount?: number;
  durationMinutes?: number;
  durationSeconds?: number;
  exercises?: any[];
  [key: string]: any;
}

export interface SignalLoggedPayload {
  userId: string;
  date: string;
  key: string;
  value: any;
}

export interface TelemetryIngestedPayload {
  userId: string;
  generationTimestamp: number;
  observationIds: string[];
  telemetryQuality: number;
}

export interface TaskUpdatedPayload {
  taskId: string;
  userId: string;
  changes: Record<string, any>;
  updatedAt: string;
  title?: string;
  status?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
}

export interface TaskDeletedPayload {
  taskId: string;
  userId: string;
  deletedAt: string;
}

export interface GoalUpdatedPayload {
  goalId: string;
  userId: string;
  changes: Record<string, any>;
  updatedAt: string;
}

export interface GoalDeletedPayload {
  goalId: string;
  userId: string;
  deletedAt: string;
}

export interface OccurrenceDeletedPayload {
  occurrenceId: string;
  userId: string;
  deletedAt: string;
}

export interface AutonomousCycleEvaluatedPayload {
  cycleId: string;
  userId: string;
  durationMs: number;
  evaluationsCount: number;
  actionsTriggered: number;
  timestamp: number;
}

export interface AutonomousInterventionTriggeredPayload {
  interventionId: string;
  userId: string;
  actionType: string;
  priority: string;
  requiresHITL: boolean;
  timestamp: number;
}

export interface AutonomousActionExecutedPayload {
  actionId: string;
  userId: string;
  actionType: string;
  success: boolean;
  verificationPassed: boolean;
  timestamp: number;
}

export interface ScheduleConflictDetectedPayload {
  conflictId: string;
  userId: string;
  conflictingOccurrenceIds: string[];
  overlapMinutes: number;
  dateOnly: string;
}

export type CanonicalEventPayloadMap = {
  "domain.task.completed": TaskCompletedPayload;
  "domain.task.created": TaskCreatedPayload;
  "domain.task.updated": TaskUpdatedPayload;
  "domain.task.deleted": TaskDeletedPayload;
  "domain.task.deferred": TaskDeferredPayload;
  "domain.goal.created": GoalCreatedPayload;
  "domain.goal.updated": GoalUpdatedPayload;
  "domain.goal.deleted": GoalDeletedPayload;
  "domain.goal.progress_updated": GoalProgressUpdatedPayload;
  "domain.goal.completed": GoalCompletedPayload;
  "domain.temporal.scheduled": OccurrenceScheduledPayload;
  "domain.temporal.rescheduled": OccurrenceRescheduledPayload;
  "domain.temporal.deleted": OccurrenceDeletedPayload;
  "domain.health.workout_logged": WorkoutLoggedPayload;
  "domain.physical.workout_logged": WorkoutLoggedPayload;
  "domain.signal.logged": SignalLoggedPayload;
  "telemetry.wearables.ingested": TelemetryIngestedPayload;
  "analytical.schedule.conflict_detected": ScheduleConflictDetectedPayload;
  "autonomous.cycle_evaluated": AutonomousCycleEvaluatedPayload;
  "autonomous.intervention_triggered": AutonomousInterventionTriggeredPayload;
  "autonomous.action_executed": AutonomousActionExecutedPayload;
};
