import {
  CompensationPolicy,
  CompensationStepOutcome,
  computeDeterministicCompensationIdempotencyKey,
  SagaRollbackReport,
} from "./RecoveryContracts";
import { ActionAdapterRegistry } from "../kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../kernel/DefaultActionAdapters";

/**
 * CompensationSagaCoordinator
 * 
 * Coordinates policy-governed backward LIFO rollbacks of reversible actions.
 * Invariant 13: Compensating sagas for multi-action workflows.
 * Invariant 23: Zero phantom rollbacks on unconfirmed or ambiguous external mutations.
 * Invariant 25: Causal LIFO compensation order.
 */
export class CompensationSagaCoordinator {
  private static instance: CompensationSagaCoordinator;
  private adapterRegistry: ActionAdapterRegistry;

  constructor(customRegistry?: ActionAdapterRegistry) {
    this.adapterRegistry = customRegistry || ActionAdapterRegistry.getInstance();
    if (
      this.adapterRegistry &&
      typeof (this.adapterRegistry as any).has === "function" &&
      !(this.adapterRegistry as any).has("create_task")
    ) {
      registerDefaultActionAdapters(this.adapterRegistry);
    }
  }

  static getInstance(customRegistry?: ActionAdapterRegistry): CompensationSagaCoordinator {
    if (!CompensationSagaCoordinator.instance) {
      CompensationSagaCoordinator.instance = new CompensationSagaCoordinator(
        customRegistry || ActionAdapterRegistry.getInstance()
      );
    }
    return CompensationSagaCoordinator.instance;
  }

  /**
   * Evaluates the appropriate compensation policy for a given workflow and step.
   */
  evaluatePolicy(step: any, workflowGoal: string, hasDependentSideEffects: boolean): CompensationPolicy {
    // 1. Irreversible external communications (sent email, external webhook, payment)
    if (
      step.reversibility === "irreversible_external" ||
      step.capabilityURN?.includes("email.send") ||
      step.capabilityURN?.includes("slack.send")
    ) {
      return "COMPENSATION_UNAVAILABLE";
    }

    // 2. Sensitive multi-party reversals (e.g. meetings with attendees) require approval
    if (step.capabilityURN?.includes("calendar.create") && step.parameters?.attendees?.length > 1) {
      return "COMPENSATION_REQUIRES_APPROVAL";
    }

    // 3. Partial output that provides independent user value (e.g. written summary on disk)
    if (
      (step.capabilityURN?.includes("storage.write") || step.actionType === "storage_write") &&
      !hasDependentSideEffects
    ) {
      // If goal only asked for drafting/saving, no compensation required
      if (workflowGoal.toLowerCase().includes("save") || workflowGoal.toLowerCase().includes("draft")) {
        return "NO_COMPENSATION_REQUIRED";
      }
    }

    // 4. Clean reversible operations with dedicated compensate handler
    if (
      step.reversibility === "reversible_with_compensation" ||
      step.capabilityURN?.includes("calendar.create") ||
      step.capabilityURN?.includes("task.create") ||
      step.actionType === "create_task"
    ) {
      return "COMPENSATION_SAFE_AND_AUTHORIZED";
    }

    return "NO_COMPENSATION_REQUIRED";
  }

  /**
   * Executes a backward LIFO compensation saga across completed steps.
   * Strictly separates ActionAudit status from CompensationStepOutcome (Correction E).
   */
  async executeSaga(
    executionId: string,
    userId: string,
    completedSteps: any[],
    workflowGoal: string = "",
    actionAuditStore?: Map<string, any>
  ): Promise<SagaRollbackReport> {
    const report: SagaRollbackReport = {
      executionId,
      totalCompensationsAttempted: 0,
      successfulCompensations: 0,
      failedCompensations: 0,
      irreversibleStepsEncountered: 0,
      compensationDetails: [],
      overallStatus: "FULLY_COMPENSATED",
    };

    // Filter successful steps and reverse for strict LIFO rollback (Invariant 25)
    const stepsToRollback = completedSteps.filter((s) => s.status === "SUCCESS").reverse();

    for (const step of stepsToRollback) {
      const policy = this.evaluatePolicy(step, workflowGoal, false);

      // Handle Policy 1: No compensation required
      if (policy === "NO_COMPENSATION_REQUIRED") {
        report.compensationDetails.push({
          stepId: step.stepId,
          actionType: step.actionType,
          outcome: "SKIPPED_POLICY_UNSAFE",
          reversalDetails: "Step retained: policy NO_COMPENSATION_REQUIRED applies to preserve valuable partial work.",
        });
        continue;
      }

      // Handle Policy 5: Irreversible external
      if (policy === "COMPENSATION_UNAVAILABLE") {
        report.irreversibleStepsEncountered++;
        report.compensationDetails.push({
          stepId: step.stepId,
          actionType: step.actionType,
          outcome: "SKIPPED_IRREVERSIBLE",
          reversalDetails: "External side effect cannot be reversed automatically (COMPENSATION_UNAVAILABLE).",
        });
        continue;
      }

      // Handle Policy 3: Requires approval
      if (policy === "COMPENSATION_REQUIRES_APPROVAL") {
        report.failedCompensations++;
        report.overallStatus = "PARTIALLY_COMPENSATED_MANUAL_REVIEW_REQUIRED";
        report.compensationDetails.push({
          stepId: step.stepId,
          actionType: step.actionType,
          outcome: "SKIPPED_POLICY_UNSAFE",
          reversalDetails: "Compensation requires explicit user authorization (COMPENSATION_REQUIRES_APPROVAL).",
        });
        continue;
      }

      // Handle Policy 2: Safe and authorized compensation
      if (policy === "COMPENSATION_SAFE_AND_AUTHORIZED") {
        report.totalCompensationsAttempted++;
        const originalActionId = step.actionId || step.stepId;
        const compensationIdempotencyKey = computeDeterministicCompensationIdempotencyKey({
          executionId,
          stepId: step.stepId,
          originalActionId,
        });

        // 6-State ActionAudit integration (Correction E & F)
        const auditRecord: any = {
          idempotencyKey: compensationIdempotencyKey,
          actionId: `comp_${originalActionId}`,
          userId,
          executionId,
          stepId: step.stepId,
          actionType: `compensation_${step.actionType}`,
          status: "DISPATCH_INTENT_RECORDED",
          payload: { originalActionId, originalStepId: step.stepId },
          timestamp: Date.now(),
        };

        if (actionAuditStore) {
          actionAuditStore.set(compensationIdempotencyKey, auditRecord);
        }

        try {
          // Attempt adapter compensation
          const isExternal =
            step.actionType === "external_capability_action" ||
            Boolean(step.capabilityURN);
          const adapter =
            this.adapterRegistry.get(step.actionType) ||
            (isExternal ? this.adapterRegistry.get("external_capability_action") : undefined);

          if (!adapter || !adapter.compensate) {
            auditRecord.status = "FAILED_CONFIRMED";
            report.failedCompensations++;
            report.overallStatus = "PARTIALLY_COMPENSATED_MANUAL_REVIEW_REQUIRED";
            report.compensationDetails.push({
              stepId: step.stepId,
              actionType: step.actionType,
              outcome: "COMPENSATION_FAILED_CONFIRMED",
              error: `No compensation adapter registered for action type "${step.actionType}"`,
            });
            continue;
          }

          const proposal = {
            id: `prop_comp_${step.stepId}`,
            domain: step.domain || "productivity",
            actionType: step.actionType,
            payload: {
              capabilityURN: step.capabilityURN,
              parameters: step.parameters,
            },
            rationale: "Automated LIFO compensation rollback",
            reversibility: "irreversible_local" as const,
            idempotencyKey: compensationIdempotencyKey,
          };

          const compResult = await adapter.compensate(proposal, step.data, userId);

          if (compResult.compensated) {
            auditRecord.status = "SUCCEEDED";
            report.successfulCompensations++;
            report.compensationDetails.push({
              stepId: step.stepId,
              actionType: step.actionType,
              outcome: "COMPENSATED_VERIFIED",
              reversalDetails: compResult.reversalDetails || `Successfully rolled back step ${step.stepId}`,
            });
          } else {
            auditRecord.status = "FAILED_CONFIRMED";
            report.failedCompensations++;
            report.overallStatus = "PARTIALLY_COMPENSATED_MANUAL_REVIEW_REQUIRED";
            report.compensationDetails.push({
              stepId: step.stepId,
              actionType: step.actionType,
              outcome: "COMPENSATION_FAILED_CONFIRMED",
              error: compResult.error || "Compensation adapter returned uncompensated",
            });
          }
        } catch (err: any) {
          // Timeout or connection break during compensation -> OUTCOME_UNKNOWN (Correction F)
          const errStr = (err?.message || String(err)).toLowerCase();
          const isTimeout =
            errStr.includes("timeout") ||
            errStr.includes("network") ||
            errStr.includes("econnreset") ||
            errStr.includes("etimedout");

          auditRecord.status = isTimeout ? "OUTCOME_UNKNOWN" : "FAILED_CONFIRMED";
          auditRecord.error = err.message;
          report.failedCompensations++;
          report.overallStatus = "PARTIALLY_COMPENSATED_MANUAL_REVIEW_REQUIRED";

          const outcome: CompensationStepOutcome = isTimeout
            ? "COMPENSATION_AMBIGUOUS_TIMEOUT"
            : "COMPENSATION_FAILED_CONFIRMED";

          report.compensationDetails.push({
            stepId: step.stepId,
            actionType: step.actionType,
            outcome,
            error: err.message,
          });
        }
      }
    }

    return report;
  }
}
