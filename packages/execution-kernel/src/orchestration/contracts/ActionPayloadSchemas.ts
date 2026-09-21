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
}
