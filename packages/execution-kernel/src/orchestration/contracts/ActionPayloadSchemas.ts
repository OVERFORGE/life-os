/**
 * ActionPayloadSchemas.ts
 * 
 * Strongly-typed action payload contracts for all DomainActionTypes.
 * Invariant: No action proposal may utilize unconstrained `any` or ambiguous key shapes.
 */

import { DomainActionType } from "./ActionProposalContracts";

export interface CreateTaskPayload {
  title: string;
  dueDate?: string;               // ISO YYYY-MM-DD
  dueTime?: string;               // 24-hour HH:MM
  priority?: "low" | "medium" | "high" | "urgent";
  reminderOffsetMinutes?: number; // Minutes before due time
  goalId?: string;
  notes?: string;
  taskId?: string;                // Pre-generated ID if created idempotently
}

export interface CompleteTaskPayload {
  taskId?: string;                // Authoritative MongoDB ObjectId
  title?: string;                 // Exact title filter if resolving by title
  resolvedTitle?: string;
}

export interface UpdateTaskPayload {
  taskId: string;                 // Authoritative MongoDB ObjectId
  status?: "pending" | "in_progress" | "completed" | "cancelled";
  dueDate?: string;
  dueTime?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  title?: string;
}

export interface DeleteTaskPayload {
  taskId: string;
  reason?: string;
}

export interface RescheduleTaskPayload {
  taskId: string;
  dueDate: string;                // ISO YYYY-MM-DD
  dueTime?: string;
  reason?: string;
}

export interface AdjustTaskPriorityPayload {
  taskId: string;
  priority: "low" | "medium" | "high" | "urgent";
  reason?: string;
}

export interface MealItemDetail {
  name: string;
  quantity?: number;
  unit?: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface LogMealPayload {
  description: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  date?: string;                  // ISO YYYY-MM-DD (defaults to today)
  items?: MealItemDetail[];
  totalCalories?: number;
  enrichmentSource?: "user_food_library" | "ai_nutrition_estimator" | "manual_user_entry";
  rawQuery?: string;
}

export interface LogWorkoutPayload {
  workoutType: string;
  durationMinutes: number;
  date?: string;                  // ISO YYYY-MM-DD
  exercises?: Array<{
    name: string;
    sets?: number;
    reps?: number;
    weightKg?: number;
  }>;
  intensity?: "low" | "moderate" | "high" | "extreme";
  caloriesBurned?: number;
}

export interface ModifyWorkoutPayload {
  sessionId?: string;
  durationMinutes?: number;
  notes?: string;
}

export interface LogActivityPayload {
  activityType: "hydration" | "walking" | "meditation" | "reading" | "deep_work" | "general";
  amount?: number;                // e.g. 500 for ml of water, or minutes for meditation
  unit?: string;                  // "ml", "oz", "minutes", "pages", "steps"
  date?: string;
  notes?: string;
}

export interface RecordMentalStatePayload {
  date?: string;                  // ISO YYYY-MM-DD
  mood?: number;                  // 1-10
  energy?: number;                // 1-10
  stress?: number;                // 1-10
  focus?: number;                 // 1-10
  anxiety?: number;               // 1-10
  verbatimEvidence?: string;
  notes?: string;
}

export interface ApplyRecoveryConstraintPayload {
  maxWorkloadHours?: number;
  disallowOvertime?: boolean;
  mandatoryRestPeriodHours?: number;
  effectiveUntil?: string;        // ISO timestamp
  reason: string;
}

export interface ProposeGoalPayload {
  title: string;
  type: "performance" | "identity" | "maintenance";
  cadence: "daily" | "weekly" | "flexible";
  targetCount?: number;
  domain?: "productivity" | "health" | "wellness";
}

export interface ConfirmGoalPayload {
  proposalId?: string;
  goalId?: string;
  title?: string;
  adjustments?: Record<string, any>;
}

export interface DeleteGoalPayload {
  goalId: string;
  reason?: string;
}

export interface SetContextModePayload {
  mode: "sprint" | "sanctuary" | "sabbatical" | "standard";
  durationDays?: number;
  reason?: string;
}

export interface ClearContextModePayload {
  reason?: string;
}

// ============================================================
// RoutineAI / Temporal Reality Action Payloads (V3)
// ============================================================

export interface ScheduleOccurrencePayload {
  title: string;
  dateOnly: string;                // YYYY-MM-DD
  startTime: string;               // HH:MM (24-hour format)
  durationMinutes?: number;
  endTime?: string;                // HH:MM (24-hour format)
  timezone?: string;               // IANA timezone
  kind?: "HARD_EVENT" | "ROUTINE_BLOCK" | "WORK_SESSION" | "TRANSITION_BUFFER" | "EPHEMERAL_PING";
  rigidity?: "UNMOVABLE" | "ELASTIC" | "OPTIONAL";
  locationCategory?: "HOME" | "WORK_SITE" | "ACADEMIC" | "GYM" | "TRANSIT" | "THIRD_PLACE" | "VIRTUAL" | "CUSTOM";
  locationLabel?: string;
  linkedEntity?: {
    entityType: "task" | "goal" | "workout" | "none";
    entityId?: string;
    taskTitle?: string;
  };
  occurrenceId?: string;
  seriesId?: string;
}

export interface RescheduleOccurrencePayload {
  occurrenceId: string;
  newDateOnly?: string;            // YYYY-MM-DD
  newStartTime?: string;           // HH:MM
  newEndTime?: string;             // HH:MM
  newDurationMinutes?: number;
  timezone?: string;
  reason?: string;
}

export interface CancelOccurrencePayload {
  occurrenceId: string;
  reason?: string;
  cancelSeriesScope?: "THIS_INSTANCE_ONLY" | "ALL_FUTURE_INSTANCES";
}

export interface CreateTemporalSeriesPayload {
  title: string;
  kind: "HARD_EVENT" | "ROUTINE_BLOCK" | "WORK_SESSION" | "TRANSITION_BUFFER" | "EPHEMERAL_PING";
  baseStartTime: string;           // HH:MM
  baseDurationMinutes: number;
  recurrence: {
    frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
    interval: number;
    daysOfWeek?: number[];         // 0=Sun .. 6=Sat
    effectiveStartDate: string;    // YYYY-MM-DD
    effectiveEndDate?: string;
    count?: number;
  };
  locationCategory?: "HOME" | "WORK_SITE" | "ACADEMIC" | "GYM" | "TRANSIT" | "THIRD_PLACE" | "VIRTUAL" | "CUSTOM";
  locationLabel?: string;
  linkedEntity?: {
    entityType: "task" | "goal" | "none";
    entityId?: string;
  };
}

export interface LogExecutionIntervalPayload {
  title: string;
  startedAtMs: number;
  endedAtMs: number;
  occurrenceId?: string;
  entityType?: "task" | "goal" | "workout" | "routine" | "general";
  entityId?: string;
  interruptionsCount?: number;
  completedWorkUnits?: string[];
  notes?: string;
  source?: "aven_voice" | "web_manual" | "mobile_touch" | "desktop_heartbeat" | "imported";
}

/**
 * Mapping from DomainActionType to its strongly-typed payload interface
 */
export interface DomainActionPayloadMap {
  create_task: CreateTaskPayload;
  complete_task: CompleteTaskPayload;
  update_task: UpdateTaskPayload;
  delete_task: DeleteTaskPayload;
  reschedule_task: RescheduleTaskPayload;
  adjust_task_priority: AdjustTaskPriorityPayload;
  create_goal: ProposeGoalPayload;
  propose_goal: ProposeGoalPayload;
  confirm_goal: ConfirmGoalPayload;
  delete_goal: DeleteGoalPayload;
  log_workout: LogWorkoutPayload;
  modify_workout: ModifyWorkoutPayload;
  log_meal: LogMealPayload;
  update_weight: { weightKg: number; date?: string };
  propose_diet_mode: { mode: "bulk" | "cut" | "recomp" | "maintain"; targetCalories?: number };
  confirm_diet_mode: { mode: string; targetCalories?: number };
  log_activity: LogActivityPayload;
  record_mental_estimate: RecordMentalStatePayload;
  apply_recovery_constraint: ApplyRecoveryConstraintPayload;
  set_context_mode: SetContextModePayload;
  clear_context_mode: ClearContextModePayload;
  schedule_occurrence: ScheduleOccurrencePayload;
  reschedule_occurrence: RescheduleOccurrencePayload;
  cancel_occurrence: CancelOccurrencePayload;
  create_temporal_series: CreateTemporalSeriesPayload;
  log_execution_interval: LogExecutionIntervalPayload;
}

