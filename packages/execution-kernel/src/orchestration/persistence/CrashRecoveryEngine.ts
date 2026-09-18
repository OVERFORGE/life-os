import { ExecutionEventLedger } from "../workspace/ExecutionEventLedger";
import { DeterministicReplayEngine } from "../observability/DeterministicReplayEngine";
import { StoredActionAudit } from "../kernel/KernelCapabilityService";
import { ExecutionWorkspace } from "../workspace/ExecutionWorkspace";

export interface RecoveryReport {
  executionId: string;
  status: "RECOVERED" | "NO_ACTION_NEEDED" | "MANUAL_REVIEW_REQUIRED";
  restoredEventsCount: number;
  reconciledActionsCount: number;
  workspaceStatus: string;
  details: string;
}

/**
 * CrashRecoveryEngine
 * 
 * Invariant 11: Effectively-once idempotency and crash consistency.
 * Recovers workspace and action audit state following an ungraceful process termination.
 */
export class CrashRecoveryEngine {
  /**
   * Reconciles workspace state and pending/in-flight actions after a simulated or real crash.
   */
  static recover(
    executionId: string,
    userId: string,
    userRequest: string,
    ledger: ExecutionEventLedger,
    auditStore: Map<string, StoredActionAudit>
  ): { workspace: ExecutionWorkspace; report: RecoveryReport } {
    const replayResult = DeterministicReplayEngine.replay(executionId, [...ledger.getEvents()]);
    let reconciledCount = 0;
    let manualReviewNeeded = false;

    // Check for any in-flight or interrupted action audits
    for (const [key, audit] of auditStore.entries()) {
      if (audit.status === "EXECUTING" || audit.status === "PENDING") {
        // Process died during execution
        // Check if a succeeding event was recorded in the ledger
        const wasRecordedInLedger = replayResult.projection.kernelResults.some(
          (r) => r.idempotencyKey === key && r.status === "SUCCEEDED"
        );

        if (wasRecordedInLedger) {
          audit.status = "SUCCEEDED";
          reconciledCount++;
        } else {
          // Action was not recorded as succeeded; mark FAILED to prevent phantom state
          audit.status = "FAILED";
          audit.error = "[CRASH_RECOVERY]: Interrupted by ungraceful process termination";
          reconciledCount++;
        }
      } else if (audit.status === "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED") {
        manualReviewNeeded = true;
      }
    }

    // Reconstruct ExecutionWorkspace from the replayed ledger
    const workspace = new ExecutionWorkspace(
      {
        executionId,
        userId,
        userRequest,
        goal: userRequest,
        constraints: [],
      },
      ledger
    );

    // Fast-forward workspace status according to ledger events
    const lastEvent = ledger.getEvents()[ledger.getEvents().length - 1];
    if (lastEvent?.type === "ExecutionCompleted") {
      workspace.status = "COMPLETED";
    } else if (lastEvent?.type === "ExecutionFailed") {
      workspace.status = "TERMINATED_FAILED";
    }

    const report: RecoveryReport = {
      executionId,
      status: manualReviewNeeded ? "MANUAL_REVIEW_REQUIRED" : "RECOVERED",
      restoredEventsCount: replayResult.totalEventsReplayed,
      reconciledActionsCount: reconciledCount,
      workspaceStatus: workspace.getState().status,
      details: `Restored ${replayResult.totalEventsReplayed} event(s) and reconciled ${reconciledCount} in-flight action(s).`,
    };

    return { workspace, report };
  }
}
