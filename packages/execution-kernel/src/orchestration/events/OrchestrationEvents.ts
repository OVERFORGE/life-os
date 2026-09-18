/**
 * Orchestration Event Definitions
 * 
 * Invariant 7: Durable event history provides causal history where required.
 * Invariant 8: Runtime event bus is distinct from durable event history.
 */

import { generateId } from "../../shared/ids";
import { ActionProposal, KernelActionDecision, KernelExecutionResult } from "../contracts/ActionProposalContracts";
import { AgentTask, SpecialistOutput } from "../contracts/AgentContracts";
import { EpistemicRecord } from "../contracts/EpistemicTypes";

export type OrchestrationEventType =
  | "WorkspaceInitialized"
  | "GoalDefined"
  | "ConstraintsEstablished"
  | "DelegationCreated"
  | "AgentStarted"
  | "AgentObservationProduced"
  | "AgentFindingProduced"
  | "ProposalCreated"
  | "ProposalRejected"
  | "ConflictDetected"
  | "SupervisorDecisionMade"
  | "KernelActionRequested"
  | "KernelActionExecuted"
  | "KernelActionCompensated"
  | "VerificationCompleted"
  | "IterationStarted"
  | "IterationCompleted"
  | "ExecutionCompleted"
  | "ExecutionEscalated"
  | "ExecutionFailed"
  | "ExecutionCancelled";

export interface OrchestrationEvent<T = any> {
  id: string;
  seq: number;
  executionId: string;
  type: OrchestrationEventType;
  source: "Supervisor" | "Productivity" | "Health" | "Wellness" | "Kernel" | "User";
  timestamp: number;
  payload: T;
  causalityRef?: string;
}

export function createOrchestrationEvent<T = any>(params: {
  executionId: string;
  seq: number;
  type: OrchestrationEventType;
  source: OrchestrationEvent["source"];
  payload: T;
  causalityRef?: string;
}): OrchestrationEvent<T> {
  return {
    id: generateId("oev"),
    seq: params.seq,
    executionId: params.executionId,
    type: params.type,
    source: params.source,
    timestamp: Date.now(),
    payload: params.payload,
    causalityRef: params.causalityRef,
  };
}
