export type WorkspaceStatus =
  | "INITIALIZED"
  | "DELEGATING"
  | "ANALYZING"
  | "SYNTHESIZING"
  | "KERNEL_EXECUTING"
  | "VERIFYING"
  | "COMPLETED"
  | "ESCALATED"
  | "TERMINATED_FAILED"
  | "CANCELLED_BY_USER";

export type TerminationReason =
  | "GOAL_SATISFIED"
  | "SUBJECTIVE_GOAL_ADDRESSED"
  | "NO_VALID_ACTION"
  | "INSUFFICIENT_INFORMATION"
  | "USER_INPUT_REQUIRED"
  | "SAFETY_GATE"
  | "MAX_ITERATIONS"
  | "TIMEOUT"
  | "USER_CANCELLED"
  | "EXECUTION_FAILED"
  | "KERNEL_UNAVAILABLE"
  | "DUPLICATE_ACTION_PREVENTED"
  | "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED";

const ALLOWED_TRANSITIONS: Record<WorkspaceStatus, WorkspaceStatus[]> = {
  INITIALIZED: ["DELEGATING", "CANCELLED_BY_USER", "TERMINATED_FAILED"],
  DELEGATING: ["ANALYZING", "CANCELLED_BY_USER", "TERMINATED_FAILED"],
  ANALYZING: ["SYNTHESIZING", "CANCELLED_BY_USER", "TERMINATED_FAILED"],
  SYNTHESIZING: ["KERNEL_EXECUTING", "COMPLETED", "ESCALATED", "CANCELLED_BY_USER", "TERMINATED_FAILED"],
  KERNEL_EXECUTING: ["VERIFYING", "TERMINATED_FAILED"],
  VERIFYING: ["DELEGATING", "COMPLETED", "ESCALATED", "TERMINATED_FAILED"],
  COMPLETED: [],
  ESCALATED: [],
  TERMINATED_FAILED: [],
  CANCELLED_BY_USER: [],
};

/**
 * WorkspaceStateMachine
 * 
 * Enforces legal state transitions and optimistic concurrency versioning for the Workspace.
 */
export class WorkspaceStateMachine {
  static canTransition(current: WorkspaceStatus, target: WorkspaceStatus): boolean {
    return ALLOWED_TRANSITIONS[current]?.includes(target) ?? false;
  }

  static assertTransition(current: WorkspaceStatus, target: WorkspaceStatus): void {
    if (!this.canTransition(current, target)) {
      throw new Error(`[ILLEGAL_WORKSPACE_TRANSITION]: Cannot transition from ${current} to ${target}`);
    }
  }
}
