import { ExecutionEventLedger } from "../workspace/ExecutionEventLedger";
import { DeterministicReplayEngine } from "../observability/DeterministicReplayEngine";
import { StoredActionAudit } from "../kernel/KernelCapabilityService";
import { ExecutionWorkspace } from "../workspace/ExecutionWorkspace";
import { archiveEvidenceRecord } from "../../../../../apps/web/server/db/models/ExecutionEvidenceRecordModel";
import { WorkflowExecutionGraph } from "../graph/WorkflowExecutionGraph";
import {
  ResourceReservation,
  WorkflowGraphSnapshot,
} from "../contracts/WorkflowExecutionContracts";

export interface RecoveryReport {
  executionId: string;
  status: "RECOVERED" | "NO_ACTION_NEEDED" | "MANUAL_REVIEW_REQUIRED";
  restoredEventsCount: number;
  reconciledActionsCount: number;
  workspaceStatus: string;
  details: string;
  archivalCompleted?: boolean;
}

/**
 * CrashRecoveryEngine
 * 
 * Invariant 11: Effectively-once idempotency and crash consistency.
 * Invariant 22: Pre-recovery remote observation in ambiguous states.
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
      const aStatus = audit.status as string;
      if (aStatus === "EXECUTING" || aStatus === "PENDING" || aStatus === "DISPATCH_INTENT_RECORDED") {
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
      } else if (
        aStatus === "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED" ||
        aStatus === "RECONCILIATION_REQUIRED" ||
        aStatus === "OUTCOME_UNKNOWN"
      ) {
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

  /**
   * Reconciles unarchived evidence records for terminal workspaces (Correction G).
   * Idempotent outbox processor surviving worker restarts.
   */
  static async reconcileEvidenceArchival(
    workspaceDoc: {
      executionId: string;
      status: string;
      evidenceArchived?: boolean;
      completedSteps?: Array<{ evidence?: any; stepId: string }>;
    },
    session?: any
  ): Promise<{ archivedCount: number; completed: boolean }> {
    if (
      workspaceDoc.evidenceArchived ||
      (workspaceDoc.status !== "COMPLETED" && workspaceDoc.status !== "TERMINATED_FAILED")
    ) {
      return { archivedCount: 0, completed: true };
    }

    let archivedCount = 0;
    const steps = workspaceDoc.completedSteps || [];

    for (const step of steps) {
      if (step.evidence) {
        const evidenceRecords = Array.isArray(step.evidence) ? step.evidence : [step.evidence];
        for (const ev of evidenceRecords) {
          if (ev.evidenceId && ev.envelopeHmac) {
            await archiveEvidenceRecord(ev, session);
            archivedCount++;
          }
        }
      }
    }

    workspaceDoc.evidenceArchived = true;
    return { archivedCount, completed: true };
  }

  /**
   * Reconciles execution graph state across the 6 crash windows (Stage 4).
   * Reconciles in-flight parallel batches, ambiguous timeouts, observation probes,
   * VERIFICATION_PENDING transitions, and durable resource reservations.
   */
  static async reconcileGraphCrashState(input: {
    workspace: {
      executionId: string;
      userId: string;
      graphSnapshot?: WorkflowGraphSnapshot;
      scratchpad?: Record<string, any>;
      activeReservations?: ResourceReservation[];
      approvalExpiresAt?: Date | null;
      status: string;
    };
    auditStore?: Map<string, StoredActionAudit>;
    observationProbeExecutor?: (capabilityURN: string, params: any) => Promise<{ observed: boolean; state?: any }>;
  }): Promise<{ graph: WorkflowExecutionGraph; reconciledNodesCount: number; requiresVerification: string[] }> {
    const { workspace, auditStore, observationProbeExecutor } = input;

    if (!workspace.graphSnapshot) {
      throw new Error(`[CRASH_RECOVERY_ERROR]: Workspace "${workspace.executionId}" has no durable graphSnapshot.`);
    }

    const graph = WorkflowExecutionGraph.restoreSnapshot(workspace.graphSnapshot);
    if (workspace.activeReservations && workspace.activeReservations.length > 0) {
      graph.activeReservations = [...workspace.activeReservations];
    }
    if (workspace.approvalExpiresAt) {
      graph.approvalExpiresAt = new Date(workspace.approvalExpiresAt);
    }

    let reconciledNodesCount = 0;
    const requiresVerification: string[] = [];

    // Inspect each node in graph for in-flight crash states
    for (const [stepId, node] of graph.nodes.entries()) {
      if (node.status === "IN_PROGRESS" || node.status === "OUTCOME_UNKNOWN") {
        // Look up corresponding action audit if present
        let matchedAudit: StoredActionAudit | undefined;
        if (auditStore) {
          for (const audit of auditStore.values()) {
            if (audit.actionId === stepId || audit.idempotencyKey.includes(stepId)) {
              matchedAudit = audit;
              break;
            }
          }
        }

        if (matchedAudit) {
          const mStatus = matchedAudit.status as string;
          if (mStatus === "SUCCEEDED") {
            // Invariant 22 & Correction B: Must transition to VERIFICATION_PENDING, NEVER directly to COMPLETED
            node.status = "VERIFICATION_PENDING";
            requiresVerification.push(stepId);
            reconciledNodesCount++;
          } else if (mStatus === "OUTCOME_UNKNOWN") {
            // Ambiguous timeout: dispatch observation probe if executor available
            if (observationProbeExecutor && node.step.capabilityURN) {
              const probeResult = await observationProbeExecutor(node.step.capabilityURN, node.step.parameters);
              if (probeResult.observed) {
                // Remote mutation confirmed! Update audit to SUCCEEDED and node to VERIFICATION_PENDING
                matchedAudit.status = "SUCCEEDED";
                node.status = "VERIFICATION_PENDING";
                node.output = probeResult.state;
                requiresVerification.push(stepId);
                reconciledNodesCount++;
              } else {
                // Confirmed non-mutation: mark FAILED_CONFIRMED and release reservation
                (matchedAudit as any).status = "FAILED_CONFIRMED";
                node.status = "FAILED";
                node.error = "[PROBE_CONFIRMED_NON_MUTATION]: Remote observation established mutation did not occur.";
                // Safe to release reservation
                for (const res of graph.activeReservations) {
                  if (res.stepId === stepId) {
                    res.status = "RELEASED";
                    res.releasedAt = new Date();
                  }
                }
                reconciledNodesCount++;
              }
            } else {
              // Retain reservation across unresolved ambiguity
              for (const res of graph.activeReservations) {
                if (res.stepId === stepId) {
                  res.status = "AMBIGUOUS_RETAINED";
                }
              }
            }
          } else if (mStatus === "FAILED" || mStatus === "FAILED_CONFIRMED") {
            node.status = "FAILED";
            node.error = matchedAudit.error || "[CRASH_RECOVERY]: Failed during execution";
            for (const res of graph.activeReservations) {
              if (res.stepId === stepId) {
                res.status = "RELEASED";
                res.releasedAt = new Date();
              }
            }
            reconciledNodesCount++;
          }
        } else {
          // No audit recorded: process crashed before dispatch intent was committed
          node.status = "FAILED";
          node.error = "[CRASH_RECOVERY]: Process terminated before action dispatch intent was committed";
          for (const res of graph.activeReservations) {
            if (res.stepId === stepId) {
              res.status = "RELEASED";
              res.releasedAt = new Date();
            }
          }
          reconciledNodesCount++;
        }
      } else if (node.status === "WAITING_FOR_APPROVAL") {
        // Correction C: Check approval expiration
        if (graph.approvalExpiresAt && Date.now() > graph.approvalExpiresAt.getTime()) {
          node.status = "CANCELLED";
          node.error = "[APPROVAL_EXPIRED]: Human approval challenge expired after 24h operational deadline.";
          reconciledNodesCount++;
        }
      }
    }

    // Clean up released reservations
    graph.activeReservations = graph.activeReservations.filter((r) => r.status !== "RELEASED");

    return {
      graph,
      reconciledNodesCount,
      requiresVerification,
    };
  }
}
