/**
 * CanonicalEventSchemas.ts
 * 
 * Zod runtime validation schemas for Canonical Event Envelopes and Payloads.
 * Enforces strict typing, Option B event ID regex compliance, and schema validation.
 */

import { z } from "zod";
import {
  CanonicalEventCategory,
  AggregateType,
  ICanonicalEventEnvelope,
} from "../contracts/CanonicalEventContracts";

export const CanonicalEventCategorySchema = z.enum([
  "DOMAIN_EVENT",
  "TELEMETRY_EVENT",
  "ANALYTICAL_EVENT",
  "SYSTEM_EVENT",
  "OBSERVATION_EVENT",
]);

export const AggregateTypeSchema = z.enum([
  "task",
  "goal",
  "occurrence",
  "dailylog",
  "user",
  "workout",
  "autonomous_cycle",
  "autonomous_intervention",
  "autonomous_action",
]);

export const OutboxDeliveryStatusSchema = z.enum([
  "PENDING_COMMIT",
  "PENDING",
  "PROCESSING",
  "DELIVERED",
  "DEAD_LETTER",
  "ABORTED",
]);

/**
 * Option B Event ID format regex:
 * evt_{aggregateType}_{aggregateId}_v{aggregateVersion}_{eventOrdinal}_{eventDiscriminator}
 */
export const CanonicalEventIdRegex = /^evt_[a-z0-9_\-]+_v\d+_\d+_[a-z0-9_]+$/;

export const CanonicalEventEnvelopeSchema = z.object({
  eventId: z.string().regex(CanonicalEventIdRegex, {
    message: "Invalid canonical eventId format. Expected Option B format: evt_{type}_{id}_v{version}_{ordinal}_{discriminator}",
  }),
  userId: z.string().min(1, { message: "userId is required for user-isolated events" }),
  category: CanonicalEventCategorySchema,
  type: z.string().min(1),
  aggregateId: z.string().min(1),
  aggregateType: AggregateTypeSchema,
  aggregateVersion: z.number().int().min(1),
  eventOrdinal: z.number().int().min(0),
  causalSequence: z.number().int().min(0),
  occurredAt: z.number().int().min(0),
  recordedAt: z.number().int().min(0),
  correlationId: z.string().min(1),
  causalityRef: z.string().optional(),
  source: z.string().min(1),
  payload: z.record(z.string(), z.any()),
  metadata: z.record(z.string(), z.any()).optional(),
});

// ============================================================================
// PAYLOAD SCHEMAS
// ============================================================================

export const TaskCompletedPayloadSchema = z.object({
  taskId: z.string().min(1),
  userId: z.string().min(1),
  completedAt: z.string().min(1),
  goalId: z.string().optional(),
  title: z.string().min(1),
});

export const TaskCreatedPayloadSchema = z.object({
  taskId: z.string().min(1),
  userId: z.string().min(1),
  title: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "dueDate must be YYYY-MM-DD" }),
  goalId: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});

export const GoalCreatedPayloadSchema = z.object({
  goalId: z.string().min(1),
  userId: z.string().min(1),
  title: z.string().min(1),
  nature: z.enum(["finite_deliverable", "habitual_cadence"]),
  targetDate: z.string().optional(),
});

export const GoalProgressUpdatedPayloadSchema = z.object({
  goalId: z.string().min(1),
  userId: z.string().min(1),
  previousProgress: z.number().min(0).max(100),
  newProgress: z.number().min(0).max(100),
  triggerEventId: z.string().optional(),
});

export const GoalCompletedPayloadSchema = z.object({
  goalId: z.string().min(1),
  userId: z.string().min(1),
  completedAt: z.string().min(1),
  finalScore: z.number().optional(),
});

export const OccurrenceScheduledPayloadSchema = z.object({
  occurrenceId: z.string().min(1),
  userId: z.string().min(1),
  title: z.string().min(1),
  dateOnly: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startIsoUtc: z.string().min(1),
  endIsoUtc: z.string().min(1),
  kind: z.string().min(1),
});

export const OccurrenceRescheduledPayloadSchema = z.object({
  occurrenceId: z.string().min(1),
  userId: z.string().min(1),
  previousInterval: z.object({
    startIsoUtc: z.string().min(1),
    endIsoUtc: z.string().min(1),
  }),
  newInterval: z.object({
    startIsoUtc: z.string().min(1),
    endIsoUtc: z.string().min(1),
  }),
});

export const WorkoutLoggedPayloadSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trainingStrainScore: z.number().min(0),
  exercisesCount: z.number().int().min(0),
  durationMinutes: z.number().min(0),
});

export const TelemetryIngestedPayloadSchema = z.object({
  userId: z.string().min(1),
  generationTimestamp: z.number().int().min(0),
  observationIds: z.array(z.string()),
  telemetryQuality: z.number().min(0).max(1),
});

export const ScheduleConflictDetectedPayloadSchema = z.object({
  conflictId: z.string().min(1),
  userId: z.string().min(1),
  conflictingOccurrenceIds: z.array(z.string()).min(2),
  overlapMinutes: z.number().min(1),
  dateOnly: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const TaskUpdatedPayloadSchema = z.object({
  taskId: z.string().min(1),
  userId: z.string().min(1),
  changes: z.record(z.string(), z.any()),
  updatedAt: z.string().min(1),
  title: z.string().optional(),
  status: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueDate: z.string().optional(),
});

export const TaskDeletedPayloadSchema = z.object({
  taskId: z.string().min(1),
  userId: z.string().min(1),
  deletedAt: z.string().min(1),
});

export const GoalUpdatedPayloadSchema = z.object({
  goalId: z.string().min(1),
  userId: z.string().min(1),
  changes: z.record(z.string(), z.any()),
  updatedAt: z.string().min(1),
});

export const GoalDeletedPayloadSchema = z.object({
  goalId: z.string().min(1),
  userId: z.string().min(1),
  deletedAt: z.string().min(1),
});

export const OccurrenceDeletedPayloadSchema = z.object({
  occurrenceId: z.string().min(1),
  userId: z.string().min(1),
  deletedAt: z.string().min(1),
});

export const AutonomousCycleEvaluatedPayloadSchema = z.object({
  cycleId: z.string().min(1),
  userId: z.string().min(1),
  durationMs: z.number().min(0),
  evaluationsCount: z.number().int().min(0),
  actionsTriggered: z.number().int().min(0),
  timestamp: z.number().int().min(0),
});

export const AutonomousInterventionTriggeredPayloadSchema = z.object({
  interventionId: z.string().min(1),
  userId: z.string().min(1),
  actionType: z.string().min(1),
  priority: z.string().min(1),
  requiresHITL: z.boolean(),
  timestamp: z.number().int().min(0),
});

export const AutonomousActionExecutedPayloadSchema = z.object({
  actionId: z.string().min(1),
  userId: z.string().min(1),
  actionType: z.string().min(1),
  success: z.boolean(),
  verificationPassed: z.boolean(),
  timestamp: z.number().int().min(0),
});

export const CanonicalPayloadSchemaMap: Record<string, z.ZodTypeAny> = {
  "domain.task.completed": TaskCompletedPayloadSchema,
  "domain.task.created": TaskCreatedPayloadSchema,
  "domain.task.updated": TaskUpdatedPayloadSchema,
  "domain.task.deleted": TaskDeletedPayloadSchema,
  "domain.goal.created": GoalCreatedPayloadSchema,
  "domain.goal.updated": GoalUpdatedPayloadSchema,
  "domain.goal.deleted": GoalDeletedPayloadSchema,
  "domain.goal.progress_updated": GoalProgressUpdatedPayloadSchema,
  "domain.goal.completed": GoalCompletedPayloadSchema,
  "domain.temporal.scheduled": OccurrenceScheduledPayloadSchema,
  "domain.temporal.rescheduled": OccurrenceRescheduledPayloadSchema,
  "domain.temporal.deleted": OccurrenceDeletedPayloadSchema,
  "domain.health.workout_logged": WorkoutLoggedPayloadSchema,
  "telemetry.wearables.ingested": TelemetryIngestedPayloadSchema,
  "analytical.schedule.conflict_detected": ScheduleConflictDetectedPayloadSchema,
  "autonomous.cycle_evaluated": AutonomousCycleEvaluatedPayloadSchema,
  "autonomous.intervention_triggered": AutonomousInterventionTriggeredPayloadSchema,
  "autonomous.action_executed": AutonomousActionExecutedPayloadSchema,
};

/**
 * Validates a canonical event envelope.
 * Throws ZodError on schema violation.
 */
export function validateCanonicalEnvelope<T = any>(data: unknown): ICanonicalEventEnvelope<T> {
  const envelope = CanonicalEventEnvelopeSchema.parse(data) as ICanonicalEventEnvelope<T>;
  
  // Specific payload validation if registered
  const specificPayloadSchema = CanonicalPayloadSchemaMap[envelope.type];
  if (specificPayloadSchema) {
    specificPayloadSchema.parse(envelope.payload);
  }
  
  return envelope;
}

/**
 * Safe validator returning boolean and error details.
 */
export function safeValidateCanonicalEnvelope(data: unknown): {
  success: boolean;
  error?: string;
  data?: ICanonicalEventEnvelope;
} {
  try {
    const validated = validateCanonicalEnvelope(data);
    return { success: true, data: validated };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}
