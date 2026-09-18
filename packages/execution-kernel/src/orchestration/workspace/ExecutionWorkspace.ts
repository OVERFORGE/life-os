import { generateId } from "../../shared/ids";
import { ExecutionEventLedger, MaterializedProjection } from "./ExecutionEventLedger";
import { WorkspaceStateMachine, WorkspaceStatus, TerminationReason } from "./WorkspaceStateMachine";
import { AgentTask } from "../contracts/AgentContracts";
import { ActionProposal, KernelActionDecision, KernelExecutionResult } from "../contracts/ActionProposalContracts";

export interface WorkspaceContext {
  executionId: string;
  userId: string;
  conversationId?: string;
  userRequest: string;
  goal: string;
  objective?: string;
  constraints?: string[];
}

export class StaleWorkspaceMutationError extends Error {
  constructor(expectedVersion: number, currentVersion: number) {
    super(`[STALE_WORKSPACE_MUTATION]: Expected version ${expectedVersion}, but workspace is at ${currentVersion}`);
    this.name = "StaleWorkspaceMutationError";
  }
}

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
}
