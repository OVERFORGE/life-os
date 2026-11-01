/**
 * AutonomousWorkflowExecutor.ts
 * 
 * Milestone B — Phase B4: Work Package 3 / Loop 6
 * Safe Staged Workflow Execution Lifecycle with Pre-Flight Invariant Validation & DWCP Compensation
 */

import { WorkflowExecutionIntentModel, IWorkflowStepIntent } from "../../../../apps/web/server/db/models/WorkflowExecutionIntentModel";
import { OutboxStorageService, OutboxEventDraft } from "../events/persistence/OutboxStorageService";
import { FencingToken, isFencingTokenActive, validateFencingEpoch } from "./FencingToken";
import { AggregateType } from "../events/contracts/CanonicalEventContracts";

export interface WorkflowStepDefinition {
  aggregateId: string;
  aggregateType: AggregateType;
  aggregateModel: any;
  domainUpdates: Record<string, any>;
  eventDrafts: OutboxEventDraft[];
}

export interface WorkflowExecutionParams {
  workflowId?: string;
  userId: string;
  workflowType: string;
  steps: WorkflowStepDefinition[];
  fencingToken: FencingToken;
  preFlightValidator?: (steps: WorkflowStepDefinition[]) => Promise<{ valid: boolean; reason?: string }>;
}

export interface WorkflowExecutionResult {
  success: boolean;
  workflowId: string;
  status: "COMMITTED" | "FAILED" | "COMPENSATED" | "QUARANTINED";
  committedSteps: number;
  totalSteps: number;
  error?: string;
}

export interface AutonomousWorkflowExecutorDependencies {
  intentModel?: any;
  outboxService?: OutboxStorageService;
}

export class AutonomousWorkflowExecutor {
  private intentModel: any;
  private outboxService: OutboxStorageService;

  constructor(deps?: AutonomousWorkflowExecutorDependencies) {
    this.intentModel = deps?.intentModel || WorkflowExecutionIntentModel;
    this.outboxService = deps?.outboxService || OutboxStorageService.getInstance();
  }

  /**
   * Execute multi-step autonomous workflow through 11-step safe staging lifecycle.
   */
  public async executeWorkflow(params: WorkflowExecutionParams): Promise<WorkflowExecutionResult> {
    const workflowId = params.workflowId || `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { userId, workflowType, steps, fencingToken, preFlightValidator } = params;

    // Step 1: Validate active fencing token
    if (!isFencingTokenActive(fencingToken)) {
      throw new Error(`FENCING_ERROR: Fencing token is expired or inactive.`);
    }

    // Step 2 & 3: Create durable WorkflowExecutionIntent in STAGED status
    const stepIntents: IWorkflowStepIntent[] = steps.map((s, idx) => ({
      stepIndex: idx,
      stepMutationId: `step_mut_${workflowId}_${idx}`,
      aggregateId: s.aggregateId,
      aggregateType: s.aggregateType,
      expectedVersion: 0,
      domainUpdates: s.domainUpdates,
      events: s.eventDrafts,
      status: "PENDING",
    }));

    await this.intentModel.create({
      workflowId,
      userId,
      fencingEpoch: fencingToken.epoch,
      workerId: fencingToken.workerId,
      workflowType,
      status: "STAGED",
      steps: stepIntents,
      stagedAt: new Date(),
    });

    // Step 4: Execute Stage 3 deterministic invariant check (pre-flight validation)
    if (preFlightValidator) {
      const validation = await preFlightValidator(steps);
      if (!validation.valid) {
        await this.intentModel.updateOne(
          { workflowId },
          {
            $set: {
              status: "FAILED",
              errorMessage: `PRE_FLIGHT_INVARIANT_VIOLATION: ${validation.reason}`,
              completedAt: new Date(),
            },
          }
        );
        return {
          success: false,
          workflowId,
          status: "FAILED",
          committedSteps: 0,
          totalSteps: steps.length,
          error: `PRE_FLIGHT_INVARIANT_VIOLATION: ${validation.reason}`,
        };
      }
    }

    // Step 5: Transition workflow intent to EXECUTING
    await this.intentModel.updateOne(
      { workflowId },
      { $set: { status: "EXECUTING" } }
    );

    // Step 6: Sequentially execute steps with DWCP isolation
    let committedStepsCount = 0;
    const compensationStack: { stepIndex: number; aggregateModel: any; aggregateId: string; priorState: any; stepMutationId: string }[] = [];

    for (let i = 0; i < steps.length; i++) {
      const stepDef = steps[i];
      const stepIntent = stepIntents[i];

      // Re-verify lease active before each step mutation
      if (!isFencingTokenActive(fencingToken)) {
        await this.handleWorkflowFailure(workflowId, compensationStack, fencingToken.epoch, "FENCING_EXPIRED_DURING_EXECUTION");
        return {
          success: false,
          workflowId,
          status: "COMPENSATED",
          committedSteps: committedStepsCount,
          totalSteps: steps.length,
          error: "FENCING_EXPIRED_DURING_EXECUTION",
        };
      }

      try {
        // Read current aggregate state to verify version and prepare compensation snapshot
        const aggregate = await stepDef.aggregateModel.findById(stepDef.aggregateId);
        if (!aggregate) {
          throw new Error(`Aggregate ${stepDef.aggregateId} not found.`);
        }

        const currentVersion = typeof aggregate.version === "number" ? aggregate.version : 0;
        const currentEpoch = typeof aggregate.mutationEpoch === "number" ? aggregate.mutationEpoch : 0;

        // Fencing check
        const fenceCheck = validateFencingEpoch(fencingToken, currentEpoch);
        if (!fenceCheck.valid) {
          throw new Error(`FENCING_VIOLATION: ${fenceCheck.reason}`);
        }

        // Capture prior snapshot for compensation
        const priorState: Record<string, any> = {};
        for (const key of Object.keys(stepDef.domainUpdates)) {
          priorState[key] = aggregate[key];
        }

        // Commit step atomically with standalone fencing
        await this.outboxService.persistWithStandaloneFencing({
          userId,
          aggregateModel: stepDef.aggregateModel,
          aggregateId: stepDef.aggregateId,
          clientMutationId: stepIntent.stepMutationId,
          diffHash: `diff_${workflowId}_step_${i}`,
          expectedVersion: currentVersion,
          fencingEpoch: fencingToken.epoch,
          domainUpdates: stepDef.domainUpdates,
          eventDrafts: stepDef.eventDrafts,
        });

        // Record compensation diff and mark step committed
        stepIntent.expectedVersion = currentVersion;
        stepIntent.status = "COMMITTED";
        stepIntent.appliedAt = new Date();
        stepIntent.compensationDiff = priorState;

        await this.intentModel.updateOne(
          { workflowId, "steps.stepIndex": i },
          {
            $set: {
              "steps.$.status": "COMMITTED",
              "steps.$.appliedAt": stepIntent.appliedAt,
              "steps.$.compensationDiff": priorState,
              "steps.$.expectedVersion": currentVersion,
            },
          }
        );

        compensationStack.push({
          stepIndex: i,
          aggregateModel: stepDef.aggregateModel,
          aggregateId: stepDef.aggregateId,
          priorState,
          stepMutationId: stepIntent.stepMutationId,
        });

        committedStepsCount++;
      } catch (stepErr: any) {
        // Failure encountered: invoke DWCP compensation
        stepIntent.status = "FAILED";
        await this.intentModel.updateOne(
          { workflowId, "steps.stepIndex": i },
          { $set: { "steps.$.status": "FAILED" } }
        );

        const compResult = await this.handleWorkflowFailure(
          workflowId,
          compensationStack,
          fencingToken.epoch,
          stepErr.message
        );

        return {
          success: false,
          workflowId,
          status: compResult.status,
          committedSteps: committedStepsCount,
          totalSteps: steps.length,
          error: stepErr.message,
        };
      }
    }

    // Step 7: Transition workflow intent to COMMITTED
    await this.intentModel.updateOne(
      { workflowId },
      {
        $set: {
          status: "COMMITTED",
          committedAt: new Date(),
          completedAt: new Date(),
        },
      }
    );

    return {
      success: true,
      workflowId,
      status: "COMMITTED",
      committedSteps: committedStepsCount,
      totalSteps: steps.length,
    };
  }

  /**
   * Safe compensation protocol rolling back committed steps in reverse order.
   * Guarantees anti-overwrite invariant (never clobbers newer legitimate mutations).
   */
  private async handleWorkflowFailure(
    workflowId: string,
    compensationStack: { stepIndex: number; aggregateModel: any; aggregateId: string; priorState: any; stepMutationId: string }[],
    fencingEpoch: number,
    errorMessage: string
  ): Promise<{ status: "COMPENSATED" | "QUARANTINED" }> {
    await this.intentModel.updateOne(
      { workflowId },
      { $set: { status: "COMPENSATING", errorMessage } }
    );

    let quarantineTriggered = false;

    // Pop and revert in reverse order (LIFO)
    while (compensationStack.length > 0) {
      const item = compensationStack.pop()!;
      const aggregate = await item.aggregateModel.findById(item.aggregateId);

      if (!aggregate) {
        quarantineTriggered = true;
        continue;
      }

      // Check anti-overwrite condition:
      // If aggregate mutationEpoch is higher than our fencingEpoch, another worker owns it!
      if (aggregate.mutationEpoch > fencingEpoch) {
        quarantineTriggered = true;
        continue;
      }

      try {
        const revertVersion = aggregate.version;
        await this.outboxService.persistWithStandaloneFencing({
          userId: aggregate.userId,
          aggregateModel: item.aggregateModel,
          aggregateId: item.aggregateId,
          clientMutationId: `comp_${item.stepMutationId}`,
          diffHash: `diff_comp_${item.stepMutationId}`,
          expectedVersion: revertVersion,
          fencingEpoch,
          domainUpdates: item.priorState,
          eventDrafts: [
            {
              userId: aggregate.userId,
              category: "SYSTEM_EVENT",
              type: "system.workflow.step_compensated",
              aggregateId: item.aggregateId,
              aggregateType: "workflow",
              aggregateVersion: revertVersion + 1,
              source: "kernel.dwcp.compensate",
              payload: {
                workflowId,
                stepMutationId: item.stepMutationId,
                revertedFields: Object.keys(item.priorState),
              },
              occurredAt: new Date(),
            },
          ],
        });
      } catch {
        quarantineTriggered = true;
      }
    }

    const finalStatus = quarantineTriggered ? "QUARANTINED" : "COMPENSATED";
    await this.intentModel.updateOne(
      { workflowId },
      { $set: { status: finalStatus, completedAt: new Date() } }
    );

    return { status: finalStatus };
  }
}

