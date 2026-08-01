import { ExecutionGraph } from "./ExecutionGraph";
import { RepairOperation } from "./AdaptiveRepairEngine";

/**
 * ExecutionStateValidator Subsystem
 * 
 * SOLE OWNER of execution state transition validation.
 * Enforces strict, deterministic state transition rules to prevent invalid graph states.
 * 
 * VALID TRANSITIONS:
 * - pending -> in_progress | completed | blocked
 * - in_progress -> completed | blocked | pending
 * - blocked -> pending | in_progress
 * 
 * INVALID TRANSITIONS (BLOCKED):
 * - completed -> pending | blocked
 * - blocked -> completed (must transition to pending/in_progress first)
 */
export class ExecutionStateValidator {
  private static instance: ExecutionStateValidator;

  static getInstance(): ExecutionStateValidator {
    if (!ExecutionStateValidator.instance) {
      ExecutionStateValidator.instance = new ExecutionStateValidator();
    }
    return ExecutionStateValidator.instance;
  }

  /**
   * Validates a list of RepairOperations against an ExecutionGraph before commit.
   * Returns null if valid, or a error message string if invalid.
   */
  validate(graph: ExecutionGraph, operations: RepairOperation[]): string | null {
    for (const op of operations) {
      if (!op.targetNodeId) {
        return `Operation ${op.id} missing targetNodeId`;
      }

      const node = graph.getNode(op.targetNodeId);
      if (!node && op.type !== "AddDependency" && op.type !== "RemoveDependency") {
        return `Operation target node "${op.targetNodeId}" not found in graph`;
      }

      if (node && op.newState) {
        const currentStatus = node.status;
        const newStatus = op.newState;

        const isValid = this.isValidTransition(currentStatus, newStatus);
        if (!isValid) {
          return `Illegal state transition for node "${node.title}" (${node.id}): "${currentStatus}" -> "${newStatus}"`;
        }
      }
    }

    return null;
  }

  /**
   * Deterministic transition matrix.
   */
  isValidTransition(currentStatus: string, newStatus: string): boolean {
    if (currentStatus === newStatus) return true;

    // Completed nodes cannot transition back to pending or blocked
    if (currentStatus === "completed" || currentStatus === "skipped") {
      return false;
    }

    // Direct transition from blocked to completed is invalid (must unlock to pending first)
    if (currentStatus === "blocked" && newStatus === "completed") {
      return false;
    }

    // Valid paths
    const allowed: Record<string, string[]> = {
      pending: ["in_progress", "completed", "blocked", "skipped", "pending"],
      in_progress: ["completed", "blocked", "pending", "skipped", "in_progress"],
      blocked: ["pending", "in_progress", "skipped", "blocked"],
    };

    const validNextStates = allowed[currentStatus] || ["pending", "completed", "blocked"];
    return validNextStates.includes(newStatus);
  }
}
