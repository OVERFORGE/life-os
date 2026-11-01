import {
  computeDeterministicBackoff,
  computeDeterministicBranchId,
  RecoveryDecision,
  RecoveryEvaluationContext,
  RECOVERY_BUDGET_POLICY,
} from "./RecoveryContracts";
import { ObjectiveVerificationEngine } from "../verification/ObjectiveVerificationEngine";

/**
 * IntelligentRecoveryEngine
 * 
 * SOVEREIGN RECOVERY AUTHORITY.
 * Replaces naive looping and blind retries with policy-governed closed-loop recovery.
 * Invariant 22: Pre-recovery remote observation in ambiguous states.
 * Invariant 26: Worker lease fencing enforced on all recovery transitions.
 */
export class IntelligentRecoveryEngine {
  private static instance: IntelligentRecoveryEngine;

  static getInstance(): IntelligentRecoveryEngine {
    if (!IntelligentRecoveryEngine.instance) {
      IntelligentRecoveryEngine.instance = new IntelligentRecoveryEngine();
    }
    return IntelligentRecoveryEngine.instance;
  }

  /**
   * Evaluates the failed/inconclusive step and decides the safest recovery strategy.
   */
  async evaluateRecovery(context: RecoveryEvaluationContext): Promise<RecoveryDecision> {
    const remainingAttempts = RECOVERY_BUDGET_POLICY.maxRecoveryAttemptsPerWorkflow - context.totalRecoveryAttempts;

    // Boundary 1: Recovery Budget Exhaustion -> Escalate to User
    if (remainingAttempts <= 0 || context.consecutiveFailures > RECOVERY_BUDGET_POLICY.maxConsecutiveStepRetries) {
      return {
        strategy: "ESCALATE_TO_USER",
        rationale: `Exhausted maximum autonomous recovery budget (${RECOVERY_BUDGET_POLICY.maxRecoveryAttemptsPerWorkflow} attempts) or consecutive step failures exceeded.`,
        parameters: {
          userEscalationPrompt: `Recovery budget exhausted on step "${context.stepId}". Would you like to retry with modified parameters, abort, or inspect status?`,
          userDecisionOptions: ["RETRY_WITH_NEW_PARAMETERS", "ABORT_AND_CLEANUP", "ACCEPT_PARTIAL_COMPLETION"],
        },
        budgetRemaining: {
          recoveryAttempts: 0,
          timeBudgetMs: 0,
        },
      };
    }

    const failedStep = context.failedStep;
    const errorStr = (failedStep.error || "").toLowerCase();
    const verifier = ObjectiveVerificationEngine.getInstance();
    const errorClassification = verifier.classifyProviderError(failedStep.error);

    // Boundary 2: Ambiguous Timeout / Uncertain Mutation Outcome -> Re-Observe State
    const isAmbiguousTimeout =
      failedStep.status === "TIMED_OUT" ||
      failedStep.classification === "AMBIGUOUS_TIMEOUT" ||
      errorClassification.isUncertainMutation ||
      errorStr.includes("unknown_external_state") ||
      errorStr.includes("timeout") ||
      errorStr.includes("econnreset");

    if (isAmbiguousTimeout) {
      const probeURN = failedStep.capabilityURN?.replace("write", "read").replace("create", "read") || "productivity.storage.read_file";
      return {
        strategy: "RE_OBSERVE_STATE",
        rationale: "External mutation timed out or encountered an uncertain state. Probing remote reality before retrying to prevent duplicate side effects.",
        parameters: {
          reObserveProbeURN: probeURN,
          reObserveParameters: failedStep.parameters || {},
        },
        budgetRemaining: {
          recoveryAttempts: remainingAttempts - 1,
          timeBudgetMs: RECOVERY_BUDGET_POLICY.totalRecoveryTimeoutMs,
        },
      };
    }

    // Boundary 3: Transient Network / Rate Limit Failure on Idempotent Action -> Deterministic Backoff Retry
    const isTransientError =
      errorStr.includes("rate limit") ||
      errorStr.includes("429") ||
      errorStr.includes("too many requests") ||
      errorStr.includes("temporary");

    const isIrreversible = failedStep.reversibility === "irreversible_external";

    if (isTransientError && !isIrreversible) {
      const schedule = computeDeterministicBackoff(
        context.executionId,
        context.stepId,
        context.consecutiveFailures, // 0-based retry attempt count
        undefined,
        Date.now()
      );

      return {
        strategy: "RETRY_WITH_DETERMINISTIC_BACKOFF",
        rationale: `Transient rate limit / network error encountered. Backing off deterministically for ${schedule.backoffDelayMs}ms (capped <= ${RECOVERY_BUDGET_POLICY.maxBackoffDelayMs}ms).`,
        parameters: {
          backoffDelayMs: schedule.backoffDelayMs,
          nextEligibleRetryTimestamp: schedule.nextEligibleRetryTimestamp,
        },
        budgetRemaining: {
          recoveryAttempts: remainingAttempts - 1,
          timeBudgetMs: RECOVERY_BUDGET_POLICY.totalRecoveryTimeoutMs - schedule.backoffDelayMs,
        },
      };
    }

    // Boundary 4: Tool / Path Not Found -> Replan Remainder
    const isPathOrParamError =
      errorStr.includes("enoent") ||
      errorStr.includes("not found") ||
      errorStr.includes("path does not exist");

    if (isPathOrParamError) {
      return {
        strategy: "REPLAN_REMAINDER",
        rationale: `Step "${context.stepId}" failed with resource/parameter error. Requesting Step Reasoner to formulate a revised plan using alternative capability.`,
        parameters: {},
        budgetRemaining: {
          recoveryAttempts: remainingAttempts - 1,
          timeBudgetMs: RECOVERY_BUDGET_POLICY.totalRecoveryTimeoutMs,
        },
      };
    }

    // Boundary 5: Multi-Step Intermediate Failure with Prior Succeeded Actions -> Checkpoint-Anchored Causal Branch
    const successfulPriorSteps = context.completedSteps.filter((s) => s.status === "SUCCESS");
    if (successfulPriorSteps.length > 0) {
      const anchorCheckpointId = `chk_step_${successfulPriorSteps[0].stepId}_${context.executionId}`;
      const branchId = computeDeterministicBranchId({
        executionId: context.executionId,
        failedStepId: context.stepId,
        recoveryAttemptNumber: context.totalRecoveryAttempts + 1,
        anchorCheckpointId,
      });

      return {
        strategy: "CAUSAL_RECOVERY_BRANCH",
        rationale: `Step "${context.stepId}" failed after prior successful steps. Forking deterministic recovery branch "${branchId}" anchored to "${anchorCheckpointId}" with complete action reconciliation.`,
        parameters: {
          anchorCheckpointId,
          deterministicBranchId: branchId,
          reconciledActionIds: successfulPriorSteps.map((s) => s.actionId || s.stepId),
        },
        budgetRemaining: {
          recoveryAttempts: remainingAttempts - 1,
          timeBudgetMs: RECOVERY_BUDGET_POLICY.totalRecoveryTimeoutMs,
        },
      };
    }

    // Default Fallback: Escalate to User
    return {
      strategy: "ESCALATE_TO_USER",
      rationale: `Unrecoverable error in step "${context.stepId}". Pausing for human intervention.`,
      parameters: {
        userEscalationPrompt: `Step "${context.stepId}" failed with error: ${failedStep.error || "Execution error"}. Please choose how to proceed.`,
        userDecisionOptions: ["RETRY_WITH_NEW_PARAMETERS", "ABORT_AND_CLEANUP"],
      },
      budgetRemaining: {
        recoveryAttempts: remainingAttempts - 1,
        timeBudgetMs: 0,
      },
    };
  }

  /**
   * Multi-Checkpoint Action Reconciliation Protocol (Correction C).
   * Identifies previously dispatched external actions across the entire execution history,
   * carrying forward succeeded irreversible actions (e.g. sent emails) as immutable facts.
   */
  reconcileExternalActions(
    _executionId: string,
    _anchorCheckpointId: string,
    actionAudits: any[] = [],
    completedSteps: any[] = []
  ): { carriedForwardSteps: any[]; immutableActionIds: string[] } {
    const carriedForwardSteps: any[] = [];
    const immutableActionIds: string[] = [];

    // Scan audits across all checkpoints
    for (const audit of actionAudits) {
      if (audit.status === "SUCCEEDED") {
        const correspondingStep = completedSteps.find((s) => s.stepId === audit.stepId || s.actionId === audit.actionId);
        if (correspondingStep) {
          carriedForwardSteps.push({
            ...correspondingStep,
            isImmutableExternalFact: true,
          });
          immutableActionIds.push(audit.actionId || audit.idempotencyKey);
        }
      }
    }

    return { carriedForwardSteps, immutableActionIds };
  }

  /**
   * Executes an observation probe to discover if a timed-out mutation actually succeeded remotely (Correction D & F).
   */
  async executeObservationProbe(
    targetURN: string,
    parameters: Record<string, any>,
    kernelCapability?: any,
    userId: string = "user_default"
  ): Promise<{ observed: boolean; stateDetails?: any; isTemporaryAbsence: boolean }> {
    if (!kernelCapability?.executeAction) {
      // In simulated test environments, evaluate parameters
      return { observed: false, isTemporaryAbsence: false };
    }

    try {
      const probeKey = targetURN.replace(/[^a-zA-Z0-9]/g, "_");
      const probeResult = await kernelCapability.executeAction(userId, {
        id: `prop_probe_${probeKey}_${userId}`,
        domain: "productivity",
        actionType: "external_capability_action",
        payload: {
          capabilityURN: targetURN,
          parameters,
        },
        rationale: "Observation-driven recovery probe",
        reversibility: "irreversible_local",
        idempotencyKey: `idemp_probe_${probeKey}_${userId}`,
      });

      if (probeResult.success && probeResult.data) {
        return { observed: true, stateDetails: probeResult.data, isTemporaryAbsence: false };
      }

      return { observed: false, isTemporaryAbsence: false };
    } catch (_) {
      return { observed: false, isTemporaryAbsence: true };
    }
  }
}

