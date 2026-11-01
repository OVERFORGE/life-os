import crypto from "node:crypto";
import { assertValidHmacSecret } from "../contracts/WorkflowExecutionContracts";
import { StepDataResolver } from "../workspace/StepDataResolver";
import { ExecutionEvidenceRecord } from "../verification/OutcomeVerificationContracts";

export type RecoveryStrategyType =
  | "RE_OBSERVE_STATE"
  | "RETRY_WITH_DETERMINISTIC_BACKOFF"
  | "REPLAN_REMAINDER"
  | "POLICY_GOVERNED_COMPENSATION"
  | "CAUSAL_RECOVERY_BRANCH"
  | "ESCALATE_TO_USER";

export type CompensationPolicy =
  | "NO_COMPENSATION_REQUIRED"
  | "COMPENSATION_SAFE_AND_AUTHORIZED"
  | "COMPENSATION_REQUIRES_APPROVAL"
  | "COMPENSATION_UNSAFE"
  | "COMPENSATION_UNAVAILABLE";

/**
 * Operational outcome of a single compensation action.
 * Strictly separate from ActionAuditRecordModel.status (Correction E).
 */
export type CompensationStepOutcome =
  | "COMPENSATED_VERIFIED"
  | "COMPENSATION_FAILED_CONFIRMED"
  | "COMPENSATION_AMBIGUOUS_TIMEOUT"
  | "SKIPPED_IRREVERSIBLE"
  | "SKIPPED_POLICY_UNSAFE";

export interface CanonicalBranchIdPayload {
  anchorCheckpointId: string;
  executionId: string;
  failedStepId: string;
  namespace: "lifeos.execution.recovery_branch";
  recoveryAttemptNumber: number;
  schemaVersion: "v1";
}

export interface SagaRollbackReport {
  executionId: string;
  totalCompensationsAttempted: number;
  successfulCompensations: number;
  failedCompensations: number;
  irreversibleStepsEncountered: number;
  compensationDetails: Array<{
    stepId: string;
    actionType: string;
    outcome: CompensationStepOutcome;
    reversalDetails?: string;
    error?: string;
  }>;
  overallStatus: "FULLY_COMPENSATED" | "PARTIALLY_COMPENSATED_MANUAL_REVIEW_REQUIRED";
}

export interface RecoveryEvaluationContext {
  executionId: string;
  userId: string;
  stepId: string;
  iteration: number;
  totalRecoveryAttempts: number;
  consecutiveFailures: number;
  failedStep: any;
  verificationEvidence?: ExecutionEvidenceRecord;
  completedSteps: any[];
  workspaceStateVersion: number;
  workerLeaseToken: string;
  generation: number;
}

export interface RecoveryDecision {
  strategy: RecoveryStrategyType;
  rationale: string;
  parameters: {
    backoffDelayMs?: number;
    nextEligibleRetryTimestamp?: number;
    reObserveProbeURN?: string;
    reObserveParameters?: Record<string, any>;
    anchorCheckpointId?: string;
    deterministicBranchId?: string;
    reconciledActionIds?: string[];
    compensationPolicy?: CompensationPolicy;
    userEscalationPrompt?: string;
    userDecisionOptions?: string[];
  };
  budgetRemaining: {
    recoveryAttempts: number;
    timeBudgetMs: number;
  };
}

export const RECOVERY_BUDGET_POLICY = {
  maxRecoveryAttemptsPerWorkflow: 3,
  maxConsecutiveStepRetries: 2,
  visibilityGracePeriodMs: 1500,
  reObserveTimeoutMs: 3000,
  maxBackoffDelayMs: 8000,
  totalRecoveryTimeoutMs: 15000,
} as const;

/**
 * Computes a 100% deterministic, collision-safe recovery branch identifier.
 * Uses full 64-char SHA-256 digest over structured RFC 8785 canonical JSON (Correction C & D).
 */
export function computeDeterministicBranchId(params: {
  executionId: string;
  failedStepId: string;
  recoveryAttemptNumber: number;
  anchorCheckpointId: string;
}): string {
  const payload: CanonicalBranchIdPayload = {
    anchorCheckpointId: params.anchorCheckpointId,
    executionId: params.executionId,
    failedStepId: params.failedStepId,
    namespace: "lifeos.execution.recovery_branch",
    recoveryAttemptNumber: params.recoveryAttemptNumber,
    schemaVersion: "v1",
  };

  const canonical = StepDataResolver.canonicalize(payload);
  const branchHash = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  return `rec_br_${params.failedStepId}_att${params.recoveryAttemptNumber}_${branchHash}`;
}

/**
 * Computes a stable, deterministic compensation idempotency key via canonical serialization.
 */
export function computeDeterministicCompensationIdempotencyKey(params: {
  executionId: string;
  stepId: string;
  originalActionId: string;
}): string {
  const payload = {
    executionId: params.executionId,
    namespace: "lifeos.compensation",
    originalActionId: params.originalActionId,
    stepId: params.stepId,
  };
  const canonical = StepDataResolver.canonicalize(payload);
  const hash = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  return `idemp_comp_${params.executionId}_${params.stepId}_${hash.slice(0, 16)}`;
}

/**
 * Computes bounded deterministic backoff delay.
 * Zero-based attempt numbering, exponential overflow clamped to attempt <= 6,
 * and maximum cap applied AFTER adding jitter (Correction E & G).
 */
export function computeDeterministicBackoff(
  executionId: string,
  stepId: string,
  attempt: number,
  secretOverride?: string,
  currentTime: number = Date.now()
): { backoffDelayMs: number; nextEligibleRetryTimestamp: number } {
  const secret = assertValidHmacSecret(secretOverride);
  const clampedAttempt = Math.min(Math.max(0, attempt), 6); // 2^6 = 64x multiplier ceiling
  const message = `${executionId}:${stepId}:${attempt}`;
  const hmacHex = crypto.createHmac("sha256", secret).update(message, "utf8").digest("hex");

  const seedUint32 = parseInt(hmacHex.slice(0, 8), 16);
  const rawJitterMs = seedUint32 % 1000;
  const baseDelayMs = 1000 * Math.pow(2, clampedAttempt);

  // Strict maximum capping applied AFTER adding all delay components
  const backoffDelayMs = Math.min(RECOVERY_BUDGET_POLICY.maxBackoffDelayMs, baseDelayMs + rawJitterMs);
  const nextEligibleRetryTimestamp = currentTime + backoffDelayMs;

  return { backoffDelayMs, nextEligibleRetryTimestamp };
}

