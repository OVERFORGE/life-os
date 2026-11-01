import { generateId } from "../../shared/ids";
import { ExecutionEventLedger, MaterializedProjection } from "./ExecutionEventLedger";
import { WorkspaceStateMachine, WorkspaceStatus, TerminationReason } from "./WorkspaceStateMachine";
import { AgentTask } from "../contracts/AgentContracts";
import { ActionProposal, KernelActionDecision, KernelExecutionResult } from "../contracts/ActionProposalContracts";
import {
  IWorkflowExecutionRecord,
  WORKSPACE_STORAGE_BUDGETS,
  CheckpointLedgerConsistencyError,
  WorkspaceSizeLimitExceededError,
} from "../contracts/WorkflowExecutionContracts";

export interface WorkspaceContext {
  executionId: string;
  userId: string;
  conversationId?: string;
  userRequest: string;
  goal: string;
  objective?: string;
  constraints?: string[];
}

import { StaleWorkspaceMutationError } from "../contracts/WorkflowExecutionContracts";
export { StaleWorkspaceMutationError };

/**
 * ExecutionWorkspace (Dual-Plane Architecture)
 * 
 * Invariant 5: Workspace event appends are non-blocking and concurrent;
 *             materialized state is owned exclusively by the Supervisor.
 * Invariant 6: Workspace owns orchestration context, not domain truth.
 */
export class ExecutionWorkspace {
  public readonly executionId: string;
  public readonly userId: string;
  public readonly conversationId?: string;
  public readonly userRequest: string;
  public readonly goal: string;
  public readonly objective?: string;
  public readonly constraints: string[];

  // Plane 1: Append-Only Event Ledger
  public readonly ledger: ExecutionEventLedger;

  // Plane 2: Supervisor-Owned Control Plane
  public status: WorkspaceStatus = "INITIALIZED";
  public iteration: number = 1;
  public stateVersion: number = 1;
  public activeDelegations: Map<string, AgentTask> = new Map();
  public terminationReason?: TerminationReason;
  public readonly createdAt: number = Date.now();
  public updatedAt: number = Date.now();

  // Multi-Step Workflow Scratchpad (Transient in-memory store for intermediate step outputs)
  public readonly scratchpad: Map<string, any> = new Map();

  setScratchpad(stepId: string, record: any): void {
    this.scratchpad.set(stepId, record);
    this.ledger.append("StepOutputRecorded", "Supervisor", {
      stepId,
      actionType: record.actionType,
      capabilityURN: record.capabilityURN,
      timestamp: record.timestamp || Date.now(),
    });
  }

  getScratchpad(stepId: string): any {
    return this.scratchpad.get(stepId);
  }

  getState(): { status: WorkspaceStatus; iteration: number; stateVersion: number; terminationReason?: TerminationReason } {
    return {
      status: this.status,
      iteration: this.iteration,
      stateVersion: this.stateVersion,
      terminationReason: this.terminationReason,
    };
  }

  constructor(context: WorkspaceContext, initialLedger?: ExecutionEventLedger) {
    this.executionId = context.executionId;
    this.userId = context.userId;
    this.conversationId = context.conversationId;
    this.userRequest = context.userRequest;
    this.goal = context.goal;
    this.objective = context.objective;
    this.constraints = context.constraints ? [...context.constraints] : [];

    this.ledger = initialLedger || new ExecutionEventLedger(this.executionId);

    if (!initialLedger || initialLedger.getEventCount() === 0) {
      this.ledger.append("WorkspaceInitialized", "Supervisor", {
        executionId: this.executionId,
        userId: this.userId,
        goal: this.goal,
        constraints: this.constraints,
      });
    }
  }

  /**
   * Supervisor transitions the workspace state with optimistic version control.
   */
  transitionTo(nextStatus: WorkspaceStatus, expectedVersion?: number): void {
    if (expectedVersion !== undefined && this.stateVersion !== expectedVersion) {
      throw new StaleWorkspaceMutationError(expectedVersion, this.stateVersion);
    }

    WorkspaceStateMachine.assertTransition(this.status, nextStatus);
    this.status = nextStatus;
    this.stateVersion += 1;
    this.updatedAt = Date.now();
  }

  setDelegations(delegations: AgentTask[]): void {
    this.activeDelegations.clear();
    for (const d of delegations) {
      this.activeDelegations.set(d.domain, d);
      this.ledger.append("DelegationCreated", "Supervisor", d);
    }
  }

  advanceIteration(): number {
    this.iteration += 1;
    this.stateVersion += 1;
    this.updatedAt = Date.now();
    this.ledger.append("IterationStarted", "Supervisor", { iteration: this.iteration });
    return this.iteration;
  }

  terminate(reason: TerminationReason): void {
    const targetStatus = reason === "GOAL_SATISFIED" || reason === "SUBJECTIVE_GOAL_ADDRESSED"
      ? "COMPLETED"
      : reason === "USER_INPUT_REQUIRED"
      ? "ESCALATED"
      : reason === "USER_CANCELLED"
      ? "CANCELLED_BY_USER"
      : "TERMINATED_FAILED";

    if (this.status === "INITIALIZED" && targetStatus !== "TERMINATED_FAILED" && targetStatus !== "CANCELLED_BY_USER") {
      this.status = "SYNTHESIZING";
    }

    this.transitionTo(targetStatus);
    this.terminationReason = reason;
    this.ledger.append(
      targetStatus === "COMPLETED"
        ? "ExecutionCompleted"
        : targetStatus === "ESCALATED"
        ? "ExecutionEscalated"
        : targetStatus === "CANCELLED_BY_USER"
        ? "ExecutionCancelled"
        : "ExecutionFailed",
      "Supervisor",
      { reason, iteration: this.iteration }
    );
  }

  /**
   * Pure Projection over the Event Ledger
   */
  getProjection(): MaterializedProjection {
    return this.ledger.project();
  }

  /**
   * Reconstructs an ExecutionWorkspace from a durable event stream.
   * Invariant 28: Replay means replaying recorded operational events.
   */
  static reconstructFromLedger(ledger: ExecutionEventLedger, context: WorkspaceContext): ExecutionWorkspace {
    const ws = new ExecutionWorkspace(context, ledger);
    const events = ledger.getEvents();

    for (const ev of events) {
      if (ev.type === "ExecutionCompleted") ws.status = "COMPLETED";
      if (ev.type === "ExecutionEscalated") ws.status = "ESCALATED";
      if (ev.type === "ExecutionFailed") ws.status = "TERMINATED_FAILED";
      if (ev.type === "ExecutionCancelled") ws.status = "CANCELLED_BY_USER";
      if (ev.type === "IterationStarted") ws.iteration = ev.payload.iteration;
    }

    ws.stateVersion = events.length;
    return ws;
  }

  /**
   * Reconstructs an ExecutionWorkspace from an authoritative persistence record.
   * Enforces 2 MB size limits and strict ledger validation.
   */
  static reconstructFromRecord(
    record: IWorkflowExecutionRecord,
    events?: any[]
  ): ExecutionWorkspace {
    const serialized = JSON.stringify(record);
    const bytes = Buffer.byteLength(serialized, "utf8");
    if (bytes > WORKSPACE_STORAGE_BUDGETS.maxDocumentBytes) {
      throw new WorkspaceSizeLimitExceededError(
        `Workspace document size ${bytes}B exceeds maximum allowed budget ${WORKSPACE_STORAGE_BUDGETS.maxDocumentBytes}B`
      );
    }

    const ws = new ExecutionWorkspace({
      executionId: record.executionId,
      userId: record.userId,
      conversationId: record.conversationId,
      userRequest: record.userRequest,
      goal: record.goal,
    });

    ws.status = record.status;
    ws.iteration = record.iteration;
    ws.stateVersion = record.stateVersion;
    ws.terminationReason = record.terminationReason;

    if (record.scratchpad) {
      for (const [key, val] of Object.entries(record.scratchpad)) {
        ws.scratchpad.set(key, val);
      }
    }

    if (events && events.length > 0) {
      for (let i = 0; i < events.length; i++) {
        if (events[i].seq !== i + 1) {
          throw new CheckpointLedgerConsistencyError(
            `Sequence gap detected in event ledger: expected seq ${i + 1}, found ${events[i].seq}.`
          );
        }
        if (!events[i].checkpointId || events[i].checkpointId.trim() === "") {
          throw new CheckpointLedgerConsistencyError(
            `Persisted event ${events[i].eventId} has missing checkpointId.`
          );
        }
      }

      if (events[events.length - 1].seq !== record.lastPersistedSeq) {
        throw new CheckpointLedgerConsistencyError(
          `Terminal event sequence (${events[events.length - 1].seq}) does not match workspace lastPersistedSeq (${record.lastPersistedSeq}).`
        );
      }

      if (
        record.lastCommittedCheckpointId &&
        events[events.length - 1].checkpointId !== record.lastCommittedCheckpointId
      ) {
        throw new CheckpointLedgerConsistencyError(
          `Terminal event checkpointId does not match workspace lastCommittedCheckpointId.`
        );
      }
    }

    return ws;
  }
}
