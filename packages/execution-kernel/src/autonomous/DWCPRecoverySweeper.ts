/**
 * DWCPRecoverySweeper.ts
 * 
 * Milestone B — Phase B4: Work Package 3 / Loop 6
 * Authoritative Dual-Write Compensation Protocol (DWCP) Recovery Sweeper
 * 
 * Implements the Two-Tier (L1 Ring Buffer + L2 Durable Store) Mutation Receipt Verification:
 * 1. Checks aggregate L1 ring buffer (recentMutationReceipts).
 * 2. If evicted, falls back to L2 durable MutationReceiptModel store.
 * 3. If missing from both:
 *    - If aggregate version > step.expectedVersion => QUARANTINED (anti-corruption safeguard).
 *    - If aggregate version === step.expectedVersion => definitively UNAPPLIED.
 * 4. Anti-overwrite conditional compensation preserves newer legitimate mutations.
 */

import { WorkflowExecutionIntentModel, IWorkflowExecutionIntentDoc } from "../../../../apps/web/server/db/models/WorkflowExecutionIntentModel";
import { MutationReceiptModel } from "../../../../apps/web/server/db/models/MutationReceiptModel";
import { OutboxStorageService } from "../events/persistence/OutboxStorageService";

export interface DWCPRecoverySweeperDependencies {
  intentModel?: any;
  receiptModel?: any;
  aggregateModelResolver?: (aggregateType: string) => any;
  outboxService?: OutboxStorageService;
}

export type StepReconciliationStatus = "COMMITTED" | "UNAPPLIED" | "QUARANTINED";

export interface StepReconciliationDetail {
  stepIndex: number;
  stepMutationId: string;
  aggregateId: string;
  status: StepReconciliationStatus;
  detectedVia: "L1_RING_BUFFER" | "L2_DURABLE_STORE" | "VERSION_EQUALITY_UNAPPLIED" | "EVICTED_UNKNOWN_ADVANCED_VERSION";
  reason?: string;
}

export type WorkflowRecoveryStatus = "COMMITTED" | "COMPENSATED" | "QUARANTINED" | "FAILED" | "FAILED_TERMINAL";

export interface WorkflowReconciliationResult {
  workflowId: string;
  finalStatus: WorkflowRecoveryStatus;
  stepDetails: StepReconciliationDetail[];
}

export class DWCPRecoverySweeper {
  private intentModel: any;
  private receiptModel: any;
  private aggregateModelResolver?: (aggregateType: string) => any;
  private outboxService: OutboxStorageService;

  constructor(deps?: DWCPRecoverySweeperDependencies) {
    this.intentModel = deps?.intentModel || WorkflowExecutionIntentModel;
    this.receiptModel = deps?.receiptModel || MutationReceiptModel;
    this.aggregateModelResolver = deps?.aggregateModelResolver;
    this.outboxService = deps?.outboxService || OutboxStorageService.getInstance();
  }

  /**
   * Determine authoritative status of a step mutation using L1 and L2 receipt verification.
   */
  public async reconcileStep(
    aggregateModel: any,
    aggregateId: string,
    stepMutationId: string,
    expectedVersion: number
  ): Promise<StepReconciliationDetail> {
    const aggregate = await aggregateModel.findById(aggregateId);
    if (!aggregate) {
      return {
        stepIndex: -1,
        stepMutationId,
        aggregateId,
        status: "QUARANTINED",
        detectedVia: "EVICTED_UNKNOWN_ADVANCED_VERSION",
        reason: `Aggregate ${aggregateId} not found in storage.`,
      };
    }

    const currentVersion = typeof aggregate.version === "number" ? aggregate.version : 0;
    const ringBuffer: any[] = aggregate.recentMutationReceipts || [];

    // 1. Check L1 in-aggregate ring buffer
    const foundInL1 = ringBuffer.some(
      (r) => r.clientMutationId === stepMutationId || r.receiptId === stepMutationId || r.stepMutationId === stepMutationId
    );

    if (foundInL1) {
      return {
        stepIndex: -1,
        stepMutationId,
        aggregateId,
        status: "COMMITTED",
        detectedVia: "L1_RING_BUFFER",
      };
    }

    // 2. Check L2 durable MutationReceiptModel store
    const foundInL2 = await this.receiptModel.findOne({
      aggregateId,
      $or: [
        { clientMutationId: stepMutationId },
        { receiptId: stepMutationId },
      ],
    });

    if (foundInL2) {
      return {
        stepIndex: -1,
        stepMutationId,
        aggregateId,
        status: "COMMITTED",
        detectedVia: "L2_DURABLE_STORE",
      };
    }

    // 3. Receipt absent from both L1 and L2. Compare version against expectedVersion.
    if (currentVersion > expectedVersion) {
      // Aggregate has advanced beyond expectedVersion, but receipt is missing from both L1 & L2.
      // Safety Invariant: NEVER assume unapplied. Must quarantine to prevent state clobbering.
      return {
        stepIndex: -1,
        stepMutationId,
        aggregateId,
        status: "QUARANTINED",
        detectedVia: "EVICTED_UNKNOWN_ADVANCED_VERSION",
        reason: `Receipt missing from L1 & L2, but aggregate version (${currentVersion}) advanced past expectedVersion (${expectedVersion}). Potential eviction anomaly.`,
      };
    }

    // currentVersion <= expectedVersion and no receipt exists => Mutation was NEVER applied.
    return {
      stepIndex: -1,
      stepMutationId,
      aggregateId,
      status: "UNAPPLIED",
      detectedVia: "VERSION_EQUALITY_UNAPPLIED",
      reason: `Aggregate version (${currentVersion}) equals expectedVersion (${expectedVersion}) and receipt absent. Mutation was never committed.`,
    };
  }

  /**
   * Reconcile an interrupted or stalled workflow.
   */
  public async reconcileWorkflow(
    workflowIntent: IWorkflowExecutionIntentDoc,
    modelMap: Map<string, any>,
    recoveryFencingEpoch: number
  ): Promise<WorkflowReconciliationResult> {
    const workflowId = workflowIntent.workflowId;
    const stepDetails: StepReconciliationDetail[] = [];

    // 1. Reconcile each step authoritatively
    for (const step of workflowIntent.steps) {
      const aggModel = modelMap.get(step.aggregateType) || (this.aggregateModelResolver ? this.aggregateModelResolver(step.aggregateType) : null);
      if (!aggModel) {
        stepDetails.push({
          stepIndex: step.stepIndex,
          stepMutationId: step.stepMutationId,
          aggregateId: step.aggregateId,
          status: "QUARANTINED",
          detectedVia: "EVICTED_UNKNOWN_ADVANCED_VERSION",
          reason: `No aggregate model registered for type ${step.aggregateType}`,
        });
        continue;
      }

      const detail = await this.reconcileStep(
        aggModel,
        step.aggregateId,
        step.stepMutationId,
        step.expectedVersion
      );
      detail.stepIndex = step.stepIndex;
      stepDetails.push(detail);
    }

    // 2. Determine workflow outcome
    const anyQuarantined = stepDetails.some((d) => d.status === "QUARANTINED");
    if (anyQuarantined) {
      await this.intentModel.updateOne(
        { workflowId },
        { $set: { status: "QUARANTINED", errorMessage: "Step reconciliation encountered quarantine anomaly." } }
      );
      return { workflowId, finalStatus: "QUARANTINED", stepDetails };
    }

    const allCommitted = stepDetails.every((d) => d.status === "COMMITTED");
    if (allCommitted) {
      await this.intentModel.updateOne(
        { workflowId },
        { $set: { status: "COMMITTED", completedAt: new Date() } }
      );
      return { workflowId, finalStatus: "COMMITTED", stepDetails };
    }

    const allUnapplied = stepDetails.every((d) => d.status === "UNAPPLIED");
    if (allUnapplied) {
      await this.intentModel.updateOne(
        { workflowId },
        { $set: { status: "FAILED", completedAt: new Date() } }
      );
      return { workflowId, finalStatus: "FAILED", stepDetails };
    }

    // Partial commit: some steps COMMITTED, some UNAPPLIED.
    // Must execute DWCP compensation for all COMMITTED steps.
    await this.intentModel.updateOne(
      { workflowId },
      { $set: { status: "COMPENSATING" } }
    );

    const committedSteps = stepDetails.filter((d) => d.status === "COMMITTED");
    let compensationFailed = false;

    for (const stepDetail of committedSteps.reverse()) {
      const stepDef = workflowIntent.steps.find((s) => s.stepIndex === stepDetail.stepIndex);
      const aggModel = modelMap.get(stepDef!.aggregateType);
      const aggregate = await aggModel.findById(stepDetail.aggregateId);

      if (!aggregate || aggregate.mutationEpoch > recoveryFencingEpoch) {
        // Anti-overwrite violation: another worker took over aggregate
        compensationFailed = true;
        break;
      }

      try {
        const revertVersion = aggregate.version;
        await this.outboxService.persistWithStandaloneFencing({
          userId: aggregate.userId,
          aggregateModel: aggModel,
          aggregateId: stepDetail.aggregateId,
          clientMutationId: `comp_sweeper_${stepDetail.stepMutationId}`,
          diffHash: `diff_comp_sweeper_${stepDetail.stepMutationId}`,
          expectedVersion: revertVersion,
          fencingEpoch: recoveryFencingEpoch,
          domainUpdates: stepDef?.compensationDiff || {},
          eventDrafts: [
            {
              userId: aggregate.userId,
              category: "SYSTEM_EVENT",
              type: "system.workflow.step_compensated",
              aggregateId: stepDetail.aggregateId,
              aggregateType: "workflow",
              aggregateVersion: revertVersion + 1,
              source: "kernel.dwcp.sweeper",
              payload: {
                workflowId,
                stepMutationId: stepDetail.stepMutationId,
              },
              occurredAt: new Date(),
            },
          ],
        });
      } catch {
        compensationFailed = true;
        break;
      }
    }

    const finalStatus = compensationFailed ? "QUARANTINED" : "COMPENSATED";
    await this.intentModel.updateOne(
      { workflowId },
      { $set: { status: finalStatus, completedAt: new Date() } }
    );

    return { workflowId, finalStatus, stepDetails };
  }
}

