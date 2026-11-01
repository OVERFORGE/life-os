/**
 * WorkflowExecutionContracts.ts
 * 
 * Strict contracts governing the general-purpose iterative agency engine,
 * step reasoner decisions, scratchpad observations, multi-step orchestration policies,
 * multi-class outcome verification, and persistent HMAC security boundaries.
 */

import { WorkspaceStatus, TerminationReason } from "../workspace/WorkspaceStateMachine";

export type ObjectiveOutcomeStatus =
  | "GOAL_ACHIEVED_AND_VERIFIED"
  | "OBJECTIVE_UNMET_EMPTY_SOURCE"
  | "OBJECTIVE_UNMET_INSUFFICIENT_SYNTHESIS"
  | "OBJECTIVE_UNMET"
  | "OBJECTIVE_UNREALIZABLE"
  | "OBJECTIVE_PARTIALLY_ACHIEVED"
  | "PARTIAL_COMPLETION"
  | "AMBIGUOUS_EXTERNAL_MUTATION"
  | "AMBIGUOUS_EXTERNAL_STATE"
  | "REQUIRES_USER_ACTION"
  | "BUDGET_EXHAUSTED"
  | "EXECUTION_ABORTED";

export type VerificationClass =
  | "CLASS_1_ARTIFACT_READ_BACK"
  | "CLASS_2_EPISTEMIC_QUERY"
  | "CLASS_3_SYNTHESIS_PROVENANCE"
  | "CLASS_4_DOMAIN_GRAPH_MUTATION"
  | "CLASS_5_BEST_EFFORT_DELIVERY";

export type StepOutcomeClassification =
  | "SUCCESS_EXPECTED"
  | "SUCCESS_EMPTY"
  | "SUCCESS_UNEXPECTED"
  | "RECOVERABLE_FAILURE"
  | "PERMANENT_FAILURE"
  | "CONFIRMATION_REQUIRED"
  | "AMBIGUOUS_TIMEOUT"
  | "LIMIT_REACHED";

export interface VerificationAssessment {
  verified: boolean;
  outcomeStatus: ObjectiveOutcomeStatus;
  verificationClass: VerificationClass;
  testedRequirements: string[];
  authoritativeEvidence: Record<string, any>;
  truthfulDisclosure: string;
}

export interface StepOutputRecord {
  stepId: string;
  actionType: string;
  capabilityURN?: string;
  data: any;
  timestamp: number;
}

export interface CompletedStepObservation {
  stepId: string;
  actionType: string;
  capabilityURN?: string;
  parameters: Record<string, any>;
  data: any;
  status: "SUCCESS" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "AMBIGUOUS";
  classification?: StepOutcomeClassification;
  error?: string;
  timestamp?: number;
  integrityHash?: string;
  isTruncated?: boolean;
  truncationDetails?: {
    originalBytes: number;
    persistedBytes: number;
  };
  evidenceId?: string;
  evidence?: any;
}

export interface IStepOutputSnapshot {
  stepId: string;
  actionType: string;
  capabilityURN?: string;
  parameters: Record<string, any>;
  data: any;
  status: "SUCCESS" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "AMBIGUOUS";
  classification?: StepOutcomeClassification;
  error?: string;
  timestamp: number;
  integrityHash: string; // SHA-256 over canonicalized persisted data + truncation metadata
  isTruncated: boolean;  // Explicit truncation flag
  truncationDetails?: {
    originalBytes: number;
    persistedBytes: number;
  };
  evidenceId?: string;
  evidence?: any;
}

export interface IExecutionLockContext {
  workerId: string;
  leaseOwnerToken: string;
  leaseExpiresAt: Date;
  generation: number;
  acquiredAt?: Date;
}

export interface IWorkflowExecutionRecord {
  executionId: string;
  userId: string;
  conversationId?: string;
  userRequest: string;
  goal: string;
  status: WorkspaceStatus;
  iteration: number;
  stateVersion: number;
  lastPersistedSeq: number;
  lastCommittedCheckpointId?: string;
  plan?: WorkflowExecutionPlan;
  completedSteps: IStepOutputSnapshot[];
  scratchpad: Record<string, any>;
  pendingOperationId?: string | null;
  terminationReason?: TerminationReason;
  lock?: IExecutionLockContext | null;
  retentionExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const WORKSPACE_STORAGE_BUDGETS = {
  maxDocumentBytes: 2 * 1024 * 1024,      // 2 MB safety budget (12.5% of 16 MB limit)
  maxStepPayloadBytes: 1.5 * 1024 * 1024, // 1.5 MB step budget
  maxScratchpadBytes: 200 * 1024,         // 200 KB scratchpad budget
  maxPlanBytes: 50 * 1024,                // 50 KB plan budget
  maxRetainedSteps: 20,                   // 20 steps ceiling
  compactionThreshold: 15,                // Compact earlier steps when > 15
} as const;

export interface StepReasonerInput {
  goal: string;
  userRequest: string;
  iteration: number;
  completedSteps: CompletedStepObservation[];
  activeIncidents?: string[];
  replanningCount?: number;
  currentPlan?: WorkflowExecutionPlan;
}

export type StepConditionOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "EXISTS"
  | "NOT_EXISTS"
  | "GREATER_THAN"
  | "LESS_THAN";

export interface PlanStepCondition {
  field: string;
  operator: StepConditionOperator;
  value?: any;
}

export type GraphNodeStatus =
  | "PENDING"
  | "READY"
  | "WAITING_FOR_APPROVAL"
  | "IN_PROGRESS"
  | "VERIFICATION_PENDING"
  | "COMPLETED"
  | "BLOCKED"
  | "FAILED"
  | "OUTCOME_UNKNOWN"
  | "RECONCILIATION_REQUIRED"
  | "SKIPPED"
  | "CANCELLED";

export interface NodeAttemptRecord {
  attempt: number;
  startedAt: number;
  completedAt?: number;
  status: string;
  error?: string;
  output?: any;
}

export interface ResourceReservation {
  reservationId: string;
  tenantId: string;
  resourceKey: string;
  stepId: string;
  lockType: "EXCLUSIVE" | "SHARED";
  status: "ACTIVE" | "AMBIGUOUS_RETAINED" | "RELEASED";
  acquiredAt: Date;
  releasedAt?: Date;
}

export interface PlanStepDefinition {
  stepId: string;
  actionType: string;
  capabilityURN?: string;
  providerHint?: string;
  parameters: Record<string, any>;
  dependsOn?: string[];
  successCondition?: string;
  requiresConfirmation?: boolean;
  rationale: string;
  condition?: PlanStepCondition;
  joinType?: "ALL" | "ANY";
  timeoutMs?: number;
}

export interface GraphNodeState {
  stepId: string;
  step: PlanStepDefinition;
  status: GraphNodeStatus;
  attempts: NodeAttemptRecord[];
  dependsOn: string[];
  downstreamStepIds: string[];
  condition?: PlanStepCondition;
  joinType?: "ALL" | "ANY";
  output?: any;
  error?: string;
}

export interface WorkflowGraphSnapshot {
  executionId: string;
  nodes: Record<string, GraphNodeState>;
  activeReservations: ResourceReservation[];
  approvalExpiresAt?: Date | null;
  replanCount: number;
  status: string;
}

export interface WorkflowExecutionPlan {
  goal: string;
  userRequest: string;
  steps: PlanStepDefinition[];
  overallSuccessCriteria?: string[];
  requiredEvidence?: string[];
}

export interface ProposeActionDecision {
  type: "PROPOSE_ACTION_STEP";
  actionType: string;
  capabilityURN?: string;
  providerHint?: string;
  parameters: Record<string, any>;
  dependsOn?: string[];
  rationale: string;
  requiresConfirmation?: boolean;
}

export interface ProposeSynthesisDecision {
  type: "PROPOSE_SYNTHESIS_STEP";
  sourceStepId: string;
  sourceDataPath?: string;
  targetPrompt: string;
  rationale: string;
}

export interface ProposePlanRevisionDecision {
  type: "PROPOSE_PLAN_REVISION";
  rationale: string;
  revisedSteps: PlanStepDefinition[];
  revisedGoalCriteria?: string[];
}

export interface RecommendCompletionDecision {
  type: "RECOMMEND_COMPLETION";
  claimedOutcome: string;
  targetArtifactRef?: string;
}

export interface ReportUnrealizableDecision {
  type: "REPORT_UNREALIZABLE";
  reason: string;
  code?: string;
}

export type StepReasonerDecision =
  | ProposeActionDecision
  | ProposeSynthesisDecision
  | ProposePlanRevisionDecision
  | RecommendCompletionDecision
  | ReportUnrealizableDecision;

export const MULTI_STEP_WORKFLOW_POLICY = {
  maxIterations: 5,
  totalExecutionTimeoutMs: 30000,
  kernelBatchTimeoutMs: 8000,
  maxFieldBytes: 50 * 1024,      // 50 KB
  maxSessionBytes: 200 * 1024,   // 200 KB
  minSynthesisLength: 50,
  dialogueTTLMs: 10 * 60 * 1000, // 10 minutes
  leaseDurationMs: 60 * 1000,    // 60 seconds
} as const;

export const STAGE2_ADAPTIVE_POLICY = {
  ...MULTI_STEP_WORKFLOW_POLICY,
  maxReplanningAttempts: 3,
  maxConsecutiveFailures: 2,
  maxTotalSteps: 10,
} as const;

/**
 * Validates the persistent server-side signing secret.
 * Enforces strict fail-closed behavior: fails if missing or < 32 characters.
 * Silently generating an ephemeral fallback key is strictly prohibited.
 */
export function assertValidHmacSecret(secret?: string): string {
  const key = secret || process.env.KERNEL_HMAC_SECRET;
  if (!key || key.length < 32) {
    throw new Error(
      "[SECURITY_CRITICAL]: KERNEL_HMAC_SECRET must be configured and >= 32 chars. Failing closed without ephemeral fallback."
    );
  }
  return key;
}

export class StaleWorkspaceMutationError extends Error {
  constructor(public expectedVersion: number, public actualVersion: number) {
    super(`[STALE_WORKSPACE_MUTATION]: Expected version ${expectedVersion}, but found ${actualVersion}. State was modified concurrently.`);
    this.name = "StaleWorkspaceMutationError";
  }
}

export class WorkspaceNotFoundError extends Error {
  constructor(public executionId: string, public userId?: string) {
    super(`[WORKSPACE_NOT_FOUND]: Execution workspace "${executionId}" was not found or access was denied.`);
    this.name = "WorkspaceNotFoundError";
  }
}

export class StepDataCorruptionError extends Error {
  constructor(message: string) {
    super(`[STEP_DATA_CORRUPTION]: ${message}`);
    this.name = "StepDataCorruptionError";
  }
}

export class CheckpointLedgerConsistencyError extends Error {
  constructor(message: string) {
    super(`[CHECKPOINT_LEDGER_CONSISTENCY_ERROR]: ${message}`);
    this.name = "CheckpointLedgerConsistencyError";
  }
}

export class PersistenceUnavailableError extends Error {
  constructor(message: string = "MongoDB persistence connection is unavailable. Failing closed.") {
    super(`[PERSISTENCE_UNAVAILABLE]: ${message}`);
    this.name = "PersistenceUnavailableError";
  }
}

export class StaleWorkerFencedError extends Error {
  constructor(message: string = "Worker lease expired or generation bumped. Worker has been fenced.") {
    super(`[STALE_WORKER_FENCED]: ${message}`);
    this.name = "StaleWorkerFencedError";
  }
}

export class WorkspaceSizeLimitExceededError extends Error {
  constructor(message: string) {
    super(`[WORKSPACE_SIZE_LIMIT_EXCEEDED]: ${message}`);
    this.name = "WorkspaceSizeLimitExceededError";
  }
}

export class TruncatedReferenceAccessError extends Error {
  constructor(stepId: string, path: string) {
    super(`[TRUNCATED_REFERENCE_ACCESS]: Step "${stepId}" was truncated and property "${path}" is no longer available.`);
    this.name = "TruncatedReferenceAccessError";
  }
}

// Stage 3 Verification & Recovery Contracts Exports
export * from "../verification/OutcomeVerificationContracts";
export * from "../recovery/RecoveryContracts";
