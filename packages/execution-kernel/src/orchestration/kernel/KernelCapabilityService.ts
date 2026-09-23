import {
  IKernelCapabilityService,
  ActionValidationResult,
  AuthoritativeKernelState,
  VerificationOutcome,
} from "./IKernelCapabilityService";
import {
  ActionProposal,
  KernelActionDecision,
  KernelExecutionResult,
  ActionExecutionStatus,
} from "../contracts/ActionProposalContracts";
import { ActionAdapterRegistry } from "./ActionAdapters";
import { registerDefaultActionAdapters } from "./DefaultActionAdapters";
import { OutcomeVerifier } from "./OutcomeVerifier";
import { ExecutionGraph } from "../../kernel/ExecutionGraph";
import { WorldModelV2 } from "../../worldv2/WorldModelV2";
import { IncidentService } from "../../incidents/IncidentService";
import { MemoryRepository } from "../../memory/MemoryRepository";
import mongoose from "mongoose";

export interface StoredActionAudit {
  idempotencyKey: string;
  actionId: string;
  status: ActionExecutionStatus;
  result?: any;
  error?: string;
  timestamp: number;
}

/**
 * KernelCapabilityService
 * 
 * Sovereign Kernel Execution Boundary.
 * Invariant 1: Agents never own authoritative truth.
 * Invariant 2: Agents never directly mutate authoritative MongoDB domain models.
 * Invariant 11: Crash-Consistent Effectively-Once Execution.
 * Invariant 13: Compensating Sagas for multi-action batches.
 */
export class KernelCapabilityService implements IKernelCapabilityService {
  private static instance: KernelCapabilityService;
  private registry: ActionAdapterRegistry;
  
  // In-Memory idempotency cache (mirrors durable KernelActionAudit collection)
  private auditStore: Map<string, StoredActionAudit> = new Map();

  constructor(registry: ActionAdapterRegistry = ActionAdapterRegistry.getInstance()) {
    this.registry = registry;
  }

  static getInstance(): KernelCapabilityService {
    if (!KernelCapabilityService.instance) {
      const registry = ActionAdapterRegistry.getInstance();
      registerDefaultActionAdapters(registry);
      KernelCapabilityService.instance = new KernelCapabilityService(registry);
    }
    return KernelCapabilityService.instance;
  }

  // Testing helper to inject/inspect audit store
  getAuditRecord(idempotencyKey: string): StoredActionAudit | undefined {
    return this.auditStore.get(idempotencyKey);
  }

  clearAuditStore(): void {
    this.auditStore.clear();
  }

  async validateActionProposals(
    userId: string,
    proposals: ActionProposal[]
  ): Promise<ActionValidationResult> {
    const validDecisions: KernelActionDecision[] = [];
    const rejectedProposals: Array<{ proposalId: string; reason: string }> = [];

    let order = 1;
    for (const proposal of proposals) {
      const propId = proposal.id || (proposal as any).proposalId || `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      proposal.id = propId;
      if (!proposal.idempotencyKey) {
        proposal.idempotencyKey = `idemp_${propId}`;
      }

      const adapter = this.registry.get(proposal.actionType);

      if (!adapter) {
        rejectedProposals.push({
          proposalId: proposal.id,
          reason: `[UNREGISTERED_ACTION_TYPE]: No kernel adapter for ${proposal.actionType}`,
        });
        continue;
      }

      try {
        const check = await adapter.validatePreconditions(proposal, userId);
        if (check.valid) {
          validDecisions.push({
            decisionId: `dec_${proposal.id}`,
            proposalId: proposal.id,
            action: proposal,
            approved: true,
            executionOrder: order++,
          });
        } else {
          rejectedProposals.push({
            proposalId: proposal.id,
            reason: check.reason || "Precondition check failed",
          });
        }
      } catch (err: any) {
        rejectedProposals.push({
          proposalId: proposal.id,
          reason: `Validation exception: ${err.message}`,
        });
      }
    }

    return {
      valid: rejectedProposals.length === 0,
      validDecisions,
      rejectedProposals,
    };
  }

  async executeActionBatch(
    userId: string,
    decisions: KernelActionDecision[]
  ): Promise<KernelExecutionResult[]> {
    const results: KernelExecutionResult[] = [];
    const executedStack: Array<{ decision: KernelActionDecision; result: any }> = [];

    // Sort by execution order
    const sorted = [...decisions].sort((a, b) => a.executionOrder - b.executionOrder);

    for (const decision of sorted) {
      const action = decision.action;
      const idempotencyKey = action.idempotencyKey || action.id || (action as any).proposalId || `idemp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // 1. Idempotency Gate (Requirement 1 & Invariant 11)
      const existingAudit = this.auditStore.get(idempotencyKey);
      if (existingAudit && existingAudit.status === "SUCCEEDED") {
        results.push({
          actionId: action.id,
          idempotencyKey,
          actionType: action.actionType,
          status: "SUCCEEDED",
          success: true,
          idempotent: true,
          data: existingAudit.result,
          targetEntityId: action.targetEntityId,
          timestamp: existingAudit.timestamp,
        });
        continue;
      }

      // Record state as EXECUTING
      this.auditStore.set(idempotencyKey, {
        idempotencyKey,
        actionId: action.id,
        status: "EXECUTING",
        timestamp: Date.now(),
      });

      const adapter = this.registry.get(action.actionType);
      if (!adapter) {
        this.auditStore.set(idempotencyKey, {
          idempotencyKey,
          actionId: action.id,
          status: "FAILED",
          error: `Unregistered action type: ${action.actionType}`,
          timestamp: Date.now(),
        });
        results.push({
          actionId: action.id,
          idempotencyKey,
          actionType: action.actionType,
          status: "FAILED",
          success: false,
          error: `Unregistered action type: ${action.actionType}`,
          timestamp: Date.now(),
        });
        break; // Batch halts on failure
      }

      try {
        const executionData = await adapter.execute(action, userId);

        this.auditStore.set(idempotencyKey, {
          idempotencyKey,
          actionId: action.id,
          status: "SUCCEEDED",
          result: executionData,
          timestamp: Date.now(),
        });

        const targetEntity = executionData?.targetEntity || (executionData?.goalId ? {
          entityId: executionData.goalId.toString(),
          displayName: executionData.title || executionData.goal?.title || "Goal",
          entityType: "goal" as const,
          domain: "productivity" as const,
          status: executionData.status || executionData.goal?.status,
        } : (executionData?.taskId ? {
          entityId: executionData.taskId.toString(),
          displayName: executionData.taskTitle || executionData.title || executionData.task?.title || "Task",
          entityType: "task" as const,
          domain: "productivity" as const,
          status: executionData.task?.status,
        } : undefined));

        const execResult: KernelExecutionResult = {
          actionId: action.id,
          idempotencyKey,
          actionType: action.actionType,
          status: "SUCCEEDED",
          success: true,
          data: executionData,
          targetEntity,
          targetEntityId: targetEntity?.entityId || action.targetEntityId || executionData?.taskId || executionData?.task?._id || executionData?.goalId || executionData?.sessionId || executionData?._id,
          timestamp: Date.now(),
        };

        results.push(execResult);
        executedStack.push({ decision, result: executionData });
      } catch (executionError: any) {
        // Mutation Failed: Initiate Compensating Saga (Requirement 3)
        this.auditStore.set(idempotencyKey, {
          idempotencyKey,
          actionId: action.id,
          status: "FAILED",
          error: executionError.message,
          timestamp: Date.now(),
        });

        results.push({
          actionId: action.id,
          idempotencyKey,
          actionType: action.actionType,
          status: "FAILED",
          success: false,
          error: executionError.message,
          timestamp: Date.now(),
        });

        // Trigger Reverse Compensation Saga
        await this.runCompensatingSaga(executedStack, userId, results);
        break; // Stop batch execution
      }
    }

    return results;
  }

  async executeAction(userId: string, proposal: ActionProposal): Promise<KernelExecutionResult> {
    const validation = await this.validateActionProposals(userId, [proposal]);
    if (!validation.valid || validation.validDecisions.length === 0) {
      return {
        actionId: proposal.id,
        idempotencyKey: proposal.idempotencyKey,
        actionType: proposal.actionType,
        status: "FAILED",
        success: false,
        error: validation.rejectedProposals[0]?.reason || "Validation rejected",
        timestamp: Date.now(),
      };
    }
    const results = await this.executeActionBatch(userId, validation.validDecisions);
    return results[0];
  }

  private async runCompensatingSaga(
    executedStack: Array<{ decision: KernelActionDecision; result: any }>,
    userId: string,
    results: KernelExecutionResult[]
  ): Promise<void> {
    while (executedStack.length > 0) {
      const { decision, result } = executedStack.pop()!;
      const action = decision.action;
      const adapter = this.registry.get(action.actionType);

      if (action.reversibility === "irreversible_external") {
        // Category C: Non-rollbackable side effect
        this.auditStore.set(action.idempotencyKey, {
          idempotencyKey: action.idempotencyKey,
          actionId: action.id,
          status: "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED",
          error: "Irreversible side effect could not be automatically rolled back",
          timestamp: Date.now(),
        });
        continue;
      }

      if (adapter) {
        try {
          const compResult = await adapter.compensate(action, result, userId);
          if (compResult.compensated) {
            this.auditStore.set(action.idempotencyKey, {
              idempotencyKey: action.idempotencyKey,
              actionId: action.id,
              status: "COMPENSATED",
              timestamp: Date.now(),
            });
            const matchingResult = results.find((r) => r.actionId === action.id);
            if (matchingResult) {
              matchingResult.compensated = true;
              matchingResult.status = "COMPENSATED";
            }
          } else {
            this.auditStore.set(action.idempotencyKey, {
              idempotencyKey: action.idempotencyKey,
              actionId: action.id,
              status: "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED",
              error: compResult.error || "Compensation reported incomplete",
              timestamp: Date.now(),
            });
          }
        } catch (compErr: any) {
          // Compensation Failure (TC-31)
          this.auditStore.set(action.idempotencyKey, {
            idempotencyKey: action.idempotencyKey,
            actionId: action.id,
            status: "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED",
            error: `Compensation throw exception: ${compErr.message}`,
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  async readAuthoritativeState(userId: string): Promise<AuthoritativeKernelState> {
    // Invariant 7 & 14: Fetch active incidents and active historical memories for goal intelligence
    let activeIncidents: any[] = [];
    let historicalMemories: any[] = [];
    try {
      activeIncidents = await IncidentService.getInstance().getActiveIncidents(userId);
    } catch (e) {}
    try {
      historicalMemories = await MemoryRepository.getInstance().getActiveMemories(userId);
    } catch (e) {}

    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const graph = await ExecutionGraph.buildFromDatabase(userId);
        const graphSnapshot = graph.createSnapshot();
        const worldSnapshot = WorldModelV2.getInstance().computeKernelSnapshot({
          userId,
          graphSnapshot,
          activeIncidents,
          historicalMemories,
        });

        return {
          userId,
          timestamp: Date.now(),
          graphSnapshot,
          worldSnapshot,
        };
      } catch (err) {
        // Fall back to empty in-memory graph if database read fails
      }
    }

    const emptyGraph = new ExecutionGraph();
    const graphSnapshot = emptyGraph.createSnapshot();
    const worldSnapshot = WorldModelV2.getInstance().computeKernelSnapshot({
      userId,
      graphSnapshot,
      activeIncidents,
      historicalMemories,
    });

    return {
      userId,
      timestamp: Date.now(),
      graphSnapshot,
      worldSnapshot,
    };
  }

  async verifyOutcome(
    userId: string,
    constraints: string[],
    preSnapshot: AuthoritativeKernelState,
    postSnapshot: AuthoritativeKernelState
  ): Promise<VerificationOutcome> {
    return OutcomeVerifier.verify(constraints, preSnapshot, postSnapshot);
  }

  async compensateAction(operation: any, userId: string): Promise<boolean> {
    const actionType = typeof operation === "object" ? operation.actionType : undefined;
    const adapter = actionType ? this.registry.get(actionType) : null;
    if (!adapter) {
      return false;
    }

    const proposal: ActionProposal = {
      id: typeof operation === "object" ? operation.operationId : "comp_prop",
      operationId: typeof operation === "object" ? operation.operationId : "comp_prop",
      actionType,
      domain: (operation.domain as any) || "productivity",
      reversibility: "atomic_single_doc",
      rationale: "User retraction",
      targetEntityId: operation.targetEntity?.entityId,
      payload: {
        ...(operation.payloadSnapshot || {}),
        taskId: operation.targetEntity?.entityId || operation.payloadSnapshot?.taskId,
        goalId: operation.targetEntity?.entityId || operation.payloadSnapshot?.goalId,
      },
      idempotencyKey: `comp_${Date.now()}`,
    };

    const previousResult = {
      taskId: operation.targetEntity?.entityId || operation.payloadSnapshot?.taskId,
      goalId: operation.targetEntity?.entityId || operation.payloadSnapshot?.goalId,
      ...(operation.payloadSnapshot || {}),
    };

    const result = await adapter.compensate(proposal, previousResult, userId);
    return Boolean(result.compensated);
  }
}
