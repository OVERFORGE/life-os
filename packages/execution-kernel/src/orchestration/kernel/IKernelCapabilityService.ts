/**
 * Kernel Capability Boundary Interface
 * 
 * Invariant 2: Agents never directly mutate authoritative MongoDB domain models.
 * Invariant 3: Kernel/domain execution owns authoritative state transitions.
 * Invariant 11: Every mutation is retry-safe and crash-safe.
 */

import { ActionProposal, KernelActionDecision, KernelExecutionResult } from "../contracts/ActionProposalContracts";
import { KernelSnapshot } from "../../worldv2/KernelSnapshot";
import { ExecutionGraphSnapshot } from "../../kernel/ExecutionGraph";

export interface ActionValidationResult {
  valid: boolean;
  validDecisions: KernelActionDecision[];
  rejectedProposals: Array<{ proposalId: string; reason: string }>;
}

export interface AuthoritativeKernelState {
  userId: string;
  timestamp: number;
  graphSnapshot: ExecutionGraphSnapshot;
  worldSnapshot: KernelSnapshot;
}

export interface VerificationOutcome {
  allHardInvariantsPassed: boolean;
  failedInvariants: string[];
  diagnosticObservations: string[];
  stabilityScoreImpact?: number; // Pre vs Post stability difference (soft metric)
}

export interface IKernelCapabilityService {
  /**
   * Validates proposed actions against business rules, preconditions, and allowlists.
   */
  validateActionProposals(
    userId: string,
    proposals: ActionProposal[]
  ): Promise<ActionValidationResult>;

  /**
   * Atomically and sequentially executes an approved batch of decisions with saga compensation on failure.
   */
  executeActionBatch(
    userId: string,
    decisions: KernelActionDecision[]
  ): Promise<KernelExecutionResult[]>;

  /**
   * Validates and executes a single action proposal.
   */
  executeAction(
    userId: string,
    proposal: ActionProposal
  ): Promise<KernelExecutionResult>;

  /**
   * Fetches an authoritative read-only snapshot of current reality.
   */
  readAuthoritativeState(userId: string): Promise<AuthoritativeKernelState>;

  /**
   * Deterministically verifies that hard invariants are satisfied post-execution.
   */
  verifyOutcome(
    userId: string,
    constraints: string[],
    preSnapshot: AuthoritativeKernelState,
    postSnapshot: AuthoritativeKernelState
  ): Promise<VerificationOutcome>;

  /**
   * Compensates a previously executed operation (e.g. on user cancellation or correction).
   */
  compensateAction(operation: any, userId: string): Promise<boolean>;
}
