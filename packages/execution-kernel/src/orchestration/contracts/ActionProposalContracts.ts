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

export interface KernelExecutionResult<TData = any> {
  actionId: string;
  operationId?: string;
  idempotencyKey: string;
  actionType: DomainActionType;
  status: ActionExecutionStatus;
  success: boolean;
  data?: TData;
  error?: string;
  targetEntityId?: string;
  timestamp: number;
  compensated?: boolean;
}
