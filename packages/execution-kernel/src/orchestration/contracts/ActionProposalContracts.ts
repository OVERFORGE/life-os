/**
 * Action Proposal & Kernel Mutation Contracts
 * 
 * Invariant 2: Agents never directly mutate authoritative MongoDB domain models.
 * Invariant 11: Every mutation is retry-safe and crash-safe.
 * Invariant 12: No false "exactly once" guarantee is claimed without proof.
 */

export type DomainActionType =
  // Productivity actions
  | "create_task"
  | "complete_task"
  | "update_task"
  | "delete_task"
  | "reschedule_task"
  | "adjust_task_priority"
  | "create_goal"
  | "propose_goal"
  | "confirm_goal"
  | "delete_goal"
  // Health actions
  | "log_workout"
  | "modify_workout"
  | "log_meal"
  | "update_weight"
  | "propose_diet_mode"
  | "confirm_diet_mode"
  // Wellness actions
  | "log_activity"
  | "record_mental_estimate"
  | "apply_recovery_constraint"
  // Context / Life Season actions
  | "set_context_mode"
  | "clear_context_mode";

export interface DomainActionCapability {
  actionType: DomainActionType;
  domain: "productivity" | "health" | "wellness" | "context";
  operationKind:
    | "CREATE"
    | "READ"
    | "UPDATE"
    | "DELETE"
    | "COMPLETE"
    | "CANCEL"
    | "RESCHEDULE"
    | "PRIORITIZE"
    | "APPEND_CORRECT"
    | "CONFIRM"
    | "RETRACT";
  requiresTargetEntity: boolean;
  targetEntityType?: "task" | "goal" | "meal" | "workout" | "activity" | "context_mode" | "weight";
  supportsContinuation: boolean;
  duplicatePolicy: "DETECT_AND_CLARIFY" | "IDEMPOTENT_IGNORE" | "APPEND_TO_EXISTING" | "ALLOW_ALWAYS" | "DUPLICATE_DETECTED" | "UPDATE_EXISTING";
  idempotencyScope: "GLOBAL_CONTENT" | "TEMPORAL_SLOT" | "TRANSACTION_KEY" | "DAILY_SLOT";
  verbalization: {
    entityNoun: string;
    actionVerbPast: string;
  };
}

export const DOMAIN_CAPABILITIES: Record<DomainActionType, DomainActionCapability> = {
  create_task: {
    actionType: "create_task",
    domain: "productivity",
    operationKind: "CREATE",
    requiresTargetEntity: false,
    targetEntityType: "task",
    supportsContinuation: false,
    duplicatePolicy: "DETECT_AND_CLARIFY",
    idempotencyScope: "TEMPORAL_SLOT",
    verbalization: { entityNoun: "task", actionVerbPast: "scheduled" },
  },
  complete_task: {
    actionType: "complete_task",
    domain: "productivity",
    operationKind: "COMPLETE",
    requiresTargetEntity: true,
    targetEntityType: "task",
    supportsContinuation: true,
    duplicatePolicy: "IDEMPOTENT_IGNORE",
    idempotencyScope: "TRANSACTION_KEY",
    verbalization: { entityNoun: "task", actionVerbPast: "completed" },
  },
  update_task: {
    actionType: "update_task",
    domain: "productivity",
    operationKind: "UPDATE",
    requiresTargetEntity: true,
    targetEntityType: "task",
    supportsContinuation: true,
    duplicatePolicy: "ALLOW_ALWAYS",
    idempotencyScope: "TRANSACTION_KEY",
    verbalization: { entityNoun: "task", actionVerbPast: "updated" },
  },
  delete_task: {
    actionType: "delete_task",
    domain: "productivity",
    operationKind: "DELETE",
    requiresTargetEntity: true,
    targetEntityType: "task",
    supportsContinuation: true,
    duplicatePolicy: "IDEMPOTENT_IGNORE",
    idempotencyScope: "TRANSACTION_KEY",
    verbalization: { entityNoun: "task", actionVerbPast: "deleted" },
  },
  reschedule_task: {
    actionType: "reschedule_task",
    domain: "productivity",
    operationKind: "RESCHEDULE",
    requiresTargetEntity: true,
    targetEntityType: "task",
    supportsContinuation: true,
    duplicatePolicy: "ALLOW_ALWAYS",
    idempotencyScope: "TRANSACTION_KEY",
    verbalization: { entityNoun: "task", actionVerbPast: "rescheduled" },
  },
  adjust_task_priority: {
    actionType: "adjust_task_priority",
    domain: "productivity",
    operationKind: "PRIORITIZE",
    requiresTargetEntity: true,
    targetEntityType: "task",
    supportsContinuation: true,
    duplicatePolicy: "ALLOW_ALWAYS",
    idempotencyScope: "TRANSACTION_KEY",
    verbalization: { entityNoun: "task", actionVerbPast: "reprioritized" },
  },
  create_goal: {
    actionType: "create_goal",
    domain: "productivity",
    operationKind: "CREATE",
    requiresTargetEntity: false,
    targetEntityType: "goal",
    supportsContinuation: false,
    duplicatePolicy: "DUPLICATE_DETECTED",
    idempotencyScope: "GLOBAL_CONTENT",
    verbalization: { entityNoun: "goal", actionVerbPast: "created" },
  },
  propose_goal: {
    actionType: "propose_goal",
    domain: "productivity",
    operationKind: "CREATE",
    requiresTargetEntity: false,
    targetEntityType: "goal",
    supportsContinuation: false,
    duplicatePolicy: "DUPLICATE_DETECTED",
    idempotencyScope: "TRANSACTION_KEY",
    verbalization: { entityNoun: "goal", actionVerbPast: "proposed" },
  },
  confirm_goal: {
    actionType: "confirm_goal",
    domain: "productivity",
    operationKind: "CONFIRM",
    requiresTargetEntity: true,
    targetEntityType: "goal",
    supportsContinuation: true,
    duplicatePolicy: "IDEMPOTENT_IGNORE",
    idempotencyScope: "TRANSACTION_KEY",
    verbalization: { entityNoun: "goal", actionVerbPast: "confirmed" },
  },
  delete_goal: {
    actionType: "delete_goal",
    domain: "productivity",
    operationKind: "DELETE",
    requiresTargetEntity: true,
    targetEntityType: "goal",
    supportsContinuation: true,
    duplicatePolicy: "IDEMPOTENT_IGNORE",
    idempotencyScope: "TRANSACTION_KEY",
    verbalization: { entityNoun: "goal", actionVerbPast: "deleted" },
  },
  log_workout: {
    actionType: "log_workout",
    domain: "health",
    operationKind: "CREATE",
    requiresTargetEntity: false,
    targetEntityType: "workout",
    supportsContinuation: false,
    duplicatePolicy: "APPEND_TO_EXISTING",
    idempotencyScope: "DAILY_SLOT",
    verbalization: { entityNoun: "workout", actionVerbPast: "logged" },
  },
  modify_workout: {
    actionType: "modify_workout",
    domain: "health",
    operationKind: "UPDATE",
    requiresTargetEntity: true,
    targetEntityType: "workout",
    supportsContinuation: true,
    duplicatePolicy: "ALLOW_ALWAYS",
    idempotencyScope: "TRANSACTION_KEY",
    verbalization: { entityNoun: "workout", actionVerbPast: "modified" },
  },
  log_meal: {
    actionType: "log_meal",
    domain: "health",
    operationKind: "CREATE",
    requiresTargetEntity: false,
    targetEntityType: "meal",
    supportsContinuation: false,
    duplicatePolicy: "APPEND_TO_EXISTING",
    idempotencyScope: "DAILY_SLOT",
    verbalization: { entityNoun: "meal", actionVerbPast: "logged" },
  },
  update_weight: {
    actionType: "update_weight",
    domain: "health",
    operationKind: "UPDATE",
    requiresTargetEntity: false,
    targetEntityType: "weight",
    supportsContinuation: false,
    duplicatePolicy: "UPDATE_EXISTING",
    idempotencyScope: "DAILY_SLOT",
    verbalization: { entityNoun: "weight", actionVerbPast: "recorded" },
  },
  propose_diet_mode: {
    actionType: "propose_diet_mode",
    domain: "health",
    operationKind: "CREATE",
    requiresTargetEntity: false,
    targetEntityType: "context_mode",
    supportsContinuation: false,
    duplicatePolicy: "IDEMPOTENT_IGNORE",
    idempotencyScope: "TRANSACTION_KEY",
    verbalization: { entityNoun: "diet mode", actionVerbPast: "proposed" },
  },
  confirm_diet_mode: {
    actionType: "confirm_diet_mode",
    domain: "health",
    operationKind: "CONFIRM",
    requiresTargetEntity: true,
    targetEntityType: "context_mode",
    supportsContinuation: true,
    duplicatePolicy: "IDEMPOTENT_IGNORE",
    idempotencyScope: "TRANSACTION_KEY",
    verbalization: { entityNoun: "diet mode", actionVerbPast: "confirmed" },
  },
  log_activity: {
    actionType: "log_activity",
    domain: "wellness",
    operationKind: "CREATE",
    requiresTargetEntity: false,
    targetEntityType: "activity",
    supportsContinuation: false,
    duplicatePolicy: "ALLOW_ALWAYS",
    idempotencyScope: "DAILY_SLOT",
    verbalization: { entityNoun: "activity", actionVerbPast: "logged" },
  },
  record_mental_estimate: {
    actionType: "record_mental_estimate",
    domain: "wellness",
    operationKind: "UPDATE",
    requiresTargetEntity: false,
    supportsContinuation: false,
    duplicatePolicy: "UPDATE_EXISTING",
    idempotencyScope: "DAILY_SLOT",
    verbalization: { entityNoun: "mental check-in", actionVerbPast: "recorded" },
  },
  apply_recovery_constraint: {
    actionType: "apply_recovery_constraint",
    domain: "wellness",
    operationKind: "UPDATE",
    requiresTargetEntity: false,
    supportsContinuation: false,
    duplicatePolicy: "UPDATE_EXISTING",
    idempotencyScope: "DAILY_SLOT",
    verbalization: { entityNoun: "recovery constraint", actionVerbPast: "applied" },
  },
  set_context_mode: {
    actionType: "set_context_mode",
    domain: "context",
    operationKind: "UPDATE",
    requiresTargetEntity: false,
    targetEntityType: "context_mode",
    supportsContinuation: false,
    duplicatePolicy: "IDEMPOTENT_IGNORE",
    idempotencyScope: "GLOBAL_CONTENT",
    verbalization: { entityNoun: "context mode", actionVerbPast: "set" },
  },
  clear_context_mode: {
    actionType: "clear_context_mode",
    domain: "context",
    operationKind: "UPDATE",
    requiresTargetEntity: false,
    targetEntityType: "context_mode",
    supportsContinuation: false,
    duplicatePolicy: "IDEMPOTENT_IGNORE",
    idempotencyScope: "GLOBAL_CONTENT",
    verbalization: { entityNoun: "context mode", actionVerbPast: "cleared" },
  },
};

export type ConversationalModificationKind =
  | "EXPLICIT_RETRACTION"    // "Undo that", "Cancel what you just did", "Don't create that after all"
  | "EXPLICIT_CORRECTION"    // "No, I meant the report", "I meant the other task"
  | "AMBIGUOUS_CORRECTION";  // "Actually, the report", "No, that one", "Wait"

export interface ModificationEvaluationResult {
  action: "COMPENSATE_PREVIOUS" | "CORRECT_AND_REEXECUTE" | "CANCEL_PENDING" | "CLARIFY_INTENT";
  targetOperationId?: string;
  targetEntityId?: string;
  compensationPermitted: boolean;
  clarificationQuestion?: string;
}

export interface ActionPreconditions {
  expectedEntityStatus?: string;
  expectedVersion?: number;
  mustExist?: boolean;
}

export interface ActionProposal<TPayload = any> {
  id: string;
  operationId?: string;
  domain: "productivity" | "health" | "wellness" | "context";
  actionType: DomainActionType;
  targetEntityId?: string;
  payload: TPayload;
  preconditions?: ActionPreconditions;
  rationale: string;
  reversibility: "atomic_single_doc" | "reversible_with_compensation" | "irreversible_external";
  idempotencyKey: string;
}

export interface KernelActionDecision {
  decisionId: string;
  proposalId: string;
  action: ActionProposal;
  approved: boolean;
  rejectionReason?: string;
  executionOrder: number;
}

export type ActionExecutionStatus =
  | "PENDING"
  | "EXECUTING"
  | "SUCCEEDED"
  | "FAILED"
  | "PARTIALLY_SUCCEEDED"
  | "REJECTED"
  | "NEEDS_CLARIFICATION"
  | "RECONCILING"
  | "COMPENSATING"
  | "COMPENSATED"
  | "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED";

export interface ICanonicalExecutionEntity {
  entityId: string;
  displayName: string;
  entityType: "task" | "goal" | "meal" | "workout" | "schedule_block" | "activity" | "weight" | "context_mode";
  domain: "productivity" | "health" | "wellness" | "context";
  status?: string;
  metadata?: Record<string, any>;
}

export interface KernelExecutionResult<TData = any> {
  actionId: string;
  operationId?: string;
  idempotencyKey: string;
  actionType: DomainActionType;
  status: ActionExecutionStatus;
  success: boolean;
  idempotent?: boolean;
  targetEntity?: ICanonicalExecutionEntity;
  data?: TData;
  error?: string;
  targetEntityId?: string;
  timestamp: number;
  compensated?: boolean;
}
