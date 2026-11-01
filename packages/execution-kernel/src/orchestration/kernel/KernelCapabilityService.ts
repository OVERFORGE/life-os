import crypto from "crypto";
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
import { ActionAuditRecordModel } from "../../../../../apps/web/server/db/models/ActionAuditRecordModel";
import { MutationReceiptModel } from "../../../../../apps/web/server/db/models/MutationReceiptModel";

export type { ActionProposal } from "../contracts/ActionProposalContracts";

export class IdempotencyPayloadMismatchError extends Error {
  public readonly statusCode = 400;
  constructor(message: string = "Idempotency key reuse with mismatched request payload.") {
    super(message);
    this.name = "IdempotencyPayloadMismatchError";
  }
}

export class ConcurrentExecutionError extends Error {
  public readonly statusCode = 409;
  constructor(message: string = "Action is currently executing under active lease.") {
    super(message);
    this.name = "ConcurrentExecutionError";
  }
}

export class IdempotencyUncertainQuarantinedError extends Error {
  public readonly statusCode = 500;
  constructor(message: string = "Action outcome uncertain with advanced aggregate version; quarantined for safety.") {
    super(message);
    this.name = "IdempotencyUncertainQuarantinedError";
  }
}

/**
 * Deterministic JSON stringifier sorting all object keys recursively.
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJsonStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + canonicalJsonStringify(obj[k]));
  return "{" + pairs.join(",") + "}";
}

/**
 * Computes canonical SHA-256 request fingerprint:
 * FP = SHA256(userId + ":" + actionType + ":" + canonicalJSON(payload))
 */
export function computeRequestFingerprint(userId: string, actionType: string, payload: any): string {
  const canonicalPayload = canonicalJsonStringify(payload);
  return crypto
    .createHash("sha256")
    .update(`${userId}:${actionType}:${canonicalPayload}`)
    .digest("hex");
}

export interface StoredActionAudit {
  idempotencyKey: string;
  actionId: string;
  userId?: string;
  actionType?: string;
  requestFingerprint?: string;
  status: ActionExecutionStatus;
  workerId?: string;
  leaseExpiresAt?: Date;
  fencingEpoch?: number;
  result?: any;
  error?: string;
  timestamp: number;
}

export interface KernelCapabilityServiceDependencies {
  registry?: ActionAdapterRegistry;
  auditModel?: any;
  receiptModel?: any;
  workerId?: string;
  aggregateModelResolver?: (type: string) => any;
}

/**
 * KernelCapabilityService
 * 
 * Sovereign Kernel Execution Boundary.
 * Invariant 1: Agents never own authoritative truth.
 * Invariant 2: Agents never directly mutate authoritative MongoDB domain models.
 * Invariant 11: Crash-Consistent Effectively-Once Execution (Durable Idempotency & Result Reconstruction).
 * Invariant 13: Compensating Sagas for multi-action batches.
 */
export class KernelCapabilityService implements IKernelCapabilityService {
  private static instance: KernelCapabilityService;
  private registry: ActionAdapterRegistry;
  private auditModel: any;
  private receiptModel: any;
  private workerId: string;
  private aggregateModelResolver?: (type: string) => any;
  
  // In-Memory idempotency cache (mirrors durable ActionAuditRecord collection)
  private auditStore: Map<string, StoredActionAudit> = new Map();
  // In-flight concurrency lock to deduplicate concurrent requests sharing the same idempotencyKey
  private inFlightExecutions: Map<string, Promise<KernelExecutionResult>> = new Map();

  constructor(
    registry: ActionAdapterRegistry = ActionAdapterRegistry.getInstance(),
    deps?: KernelCapabilityServiceDependencies
  ) {
    this.registry = registry;
    this.auditModel = deps?.auditModel || ActionAuditRecordModel;
    this.receiptModel = deps?.receiptModel || MutationReceiptModel;
    this.workerId = deps?.workerId || `worker_${process.pid}_${Math.random().toString(36).slice(2, 7)}`;
    this.aggregateModelResolver = deps?.aggregateModelResolver;
  }

  static getInstance(deps?: KernelCapabilityServiceDependencies): KernelCapabilityService {
    if (!KernelCapabilityService.instance) {
      const registry = deps?.registry || ActionAdapterRegistry.getInstance();
      registerDefaultActionAdapters(registry);
      KernelCapabilityService.instance = new KernelCapabilityService(registry, deps);
    }
    return KernelCapabilityService.instance;
  }

  // Testing helpers
  setAuditModel(model: any): void {
    this.auditModel = model;
  }

  setReceiptModel(model: any): void {
    this.receiptModel = model;
  }

  setWorkerId(workerId: string): void {
    this.workerId = workerId;
  }

  setAggregateModelResolver(resolver: (type: string) => any): void {
    this.aggregateModelResolver = resolver;
  }

  getAuditRecord(userIdOrKey: string, idempotencyKey?: string): StoredActionAudit | undefined {
    if (idempotencyKey) {
      return this.auditStore.get(`${userIdOrKey}:${idempotencyKey}`);
    }
    return this.auditStore.get(userIdOrKey);
  }

  clearAuditStore(): void {
    this.auditStore.clear();
    this.inFlightExecutions.clear();
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
      const idempotencyKey = action.idempotencyKey || action.id || (action as any).proposalId || `idemp_${action.domain}_${action.actionType}_${action.targetEntityId || "no_entity"}`;
      action.idempotencyKey = idempotencyKey;
      const cacheKey = `${userId}:${idempotencyKey}`;

      // Calculate fingerprint
      const payload = action.parameters || action.payload || {};
      const requestFingerprint = computeRequestFingerprint(userId, action.actionType, payload);

      // 1. Idempotency Gate (L1 Cache)
      const existingAudit = this.auditStore.get(cacheKey);
      if (existingAudit && existingAudit.status === "SUCCEEDED") {
        if (existingAudit.requestFingerprint && existingAudit.requestFingerprint !== requestFingerprint) {
          throw new IdempotencyPayloadMismatchError("Idempotency key reuse with mismatched request payload");
        }
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

      // Record state as EXECUTING in L1
      this.auditStore.set(cacheKey, {
        idempotencyKey,
        actionId: action.id,
        userId,
        actionType: action.actionType,
        requestFingerprint,
        status: "EXECUTING",
        workerId: this.workerId,
        leaseExpiresAt: new Date(Date.now() + 15000),
        fencingEpoch: 1,
        timestamp: Date.now(),
      });

      const adapter = this.registry.get(action.actionType);
      if (!adapter) {
        this.auditStore.set(cacheKey, {
          idempotencyKey,
          actionId: action.id,
          userId,
          actionType: action.actionType,
          requestFingerprint,
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
        const executionData = await adapter.execute(action, userId, (action as any).execOptions);

        if (executionData && executionData.success === false) {
          const errMsg = executionData.error?.message || executionData.error || "Action execution failed";
          const failStatus = executionData.status || "FAILED";

          this.auditStore.set(cacheKey, {
            idempotencyKey,
            actionId: action.id,
            userId,
            actionType: action.actionType,
            requestFingerprint,
            status: failStatus,
            error: errMsg,
            timestamp: Date.now(),
          });

          results.push({
            actionId: action.id,
            idempotencyKey,
            actionType: action.actionType,
            status: failStatus,
            success: false,
            error: errMsg,
            data: executionData,
            targetEntityId: action.targetEntityId,
            timestamp: Date.now(),
          });

          // Trigger Reverse Compensation Saga if prior actions succeeded
          await this.runCompensatingSaga(executedStack, userId, results);
          break; // Stop batch execution
        }

        this.auditStore.set(cacheKey, {
          idempotencyKey,
          actionId: action.id,
          userId,
          actionType: action.actionType,
          requestFingerprint,
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
          timestamp: executionData?.timestamp || Date.now(),
          capabilityURN: executionData?.capabilityURN,
          providerId: executionData?.providerId,
          provenance: executionData?.provenance || (action.actionType === "external_capability_action" ? "LIVE_VERIFIED" : undefined),
          freshness: executionData?.freshness,
        };

        results.push(execResult);
        executedStack.push({ decision, result: executionData });
      } catch (executionError: any) {
        // Mutation Failed: Initiate Compensating Saga
        this.auditStore.set(cacheKey, {
          idempotencyKey,
          actionId: action.id,
          userId,
          actionType: action.actionType,
          requestFingerprint,
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
    const propId = proposal.id || (proposal as any).proposalId || `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    proposal.id = propId;
    const idempotencyKey = proposal.idempotencyKey || `idemp_${propId}`;
    proposal.idempotencyKey = idempotencyKey;
    const cacheKey = `${userId}:${idempotencyKey}`;

    const payload = proposal.parameters || proposal.payload || {};
    const requestFingerprint = computeRequestFingerprint(userId, proposal.actionType, payload);

    // 1. Fast-Path (L1 In-Memory Cache)
    const existingAudit = this.auditStore.get(cacheKey);
    if (existingAudit) {
      if (existingAudit.requestFingerprint && existingAudit.requestFingerprint !== requestFingerprint) {
        throw new IdempotencyPayloadMismatchError("Idempotency key reuse with mismatched request payload");
      }
      if (existingAudit.status === "SUCCEEDED") {
        return {
          actionId: proposal.id,
          idempotencyKey,
          actionType: proposal.actionType,
          status: "SUCCEEDED",
          success: true,
          idempotent: true,
          data: existingAudit.result,
          targetEntityId: proposal.targetEntityId || existingAudit.result?.targetEntityId || existingAudit.result?.taskId || existingAudit.result?.goalId,
          timestamp: existingAudit.timestamp,
        };
      }
      if (existingAudit.status === "QUARANTINED") {
        throw new IdempotencyUncertainQuarantinedError("Action outcome uncertain with advanced aggregate version; quarantined for safety");
      }
    }

    // 2. Concurrency Lock: Is there an identical execution currently in-flight?
    const inFlight = this.inFlightExecutions.get(cacheKey);
    if (inFlight) {
      const inFlightResult = await inFlight;
      return {
        ...inFlightResult,
        idempotent: true,
      };
    }

    const executionPromise = (async (): Promise<KernelExecutionResult> => {
      // 3. Durable Store Check (L2 ActionAuditRecordModel)
      let dbRecord: any = null;
      if (this.auditModel) {
        try {
          dbRecord = await this.auditModel.findOne({ userId, idempotencyKey });
        } catch (dbErr) {
          // Fall back to memory if DB query fails
        }
      }

      if (dbRecord) {
        if (dbRecord.requestFingerprint && dbRecord.requestFingerprint !== requestFingerprint) {
          throw new IdempotencyPayloadMismatchError("Idempotency key reuse with mismatched request payload");
        }
        if (dbRecord.status === "SUCCEEDED") {
          this.auditStore.set(cacheKey, {
            idempotencyKey,
            actionId: dbRecord.actionId,
            userId,
            actionType: dbRecord.actionType,
            requestFingerprint,
            status: "SUCCEEDED",
            result: dbRecord.result,
            timestamp: dbRecord.timestamp || Date.now(),
          });
          return {
            actionId: dbRecord.actionId,
            idempotencyKey,
            actionType: dbRecord.actionType || proposal.actionType,
            status: "SUCCEEDED",
            success: true,
            idempotent: true,
            data: dbRecord.result,
            targetEntityId: proposal.targetEntityId || dbRecord.result?.targetEntityId || dbRecord.result?.taskId || dbRecord.result?.goalId,
            timestamp: dbRecord.timestamp || Date.now(),
          };
        }
        if (dbRecord.status === "QUARANTINED") {
          throw new IdempotencyUncertainQuarantinedError("Action outcome uncertain with advanced aggregate version; quarantined for safety");
        }
        if (dbRecord.status === "EXECUTING") {
          const now = Date.now();
          const leaseExpired = !dbRecord.leaseExpiresAt || new Date(dbRecord.leaseExpiresAt).getTime() <= now;
          if (!leaseExpired) {
            throw new ConcurrentExecutionError("Action is currently executing under active lease");
          }
          // Lease expired: execute crash reconciliation protocol!
          const reconciled = await this.reconcileCrashedExecution(userId, proposal, dbRecord);
          if (reconciled) {
            return reconciled;
          }
        }
      } else if (this.auditModel) {
        // Claim new execution lease in DB
        try {
          await this.auditModel.create({
            userId,
            idempotencyKey,
            actionId: proposal.id,
            actionType: proposal.actionType,
            domain: proposal.domain || "general",
            requestFingerprint,
            status: "EXECUTING",
            workerId: this.workerId,
            leaseExpiresAt: new Date(Date.now() + 15000),
            fencingEpoch: 1,
            payload,
            timestamp: Date.now(),
          });
        } catch (insertErr: any) {
          // E11000 duplicate key race: another process inserted just now
          if (insertErr.code === 11000 || insertErr.message?.includes("E11000")) {
            // Re-fetch and recurse
            return this.executeAction(userId, proposal);
          }
        }
      }

      // Set L1 EXECUTING lease
      this.auditStore.set(cacheKey, {
        idempotencyKey,
        actionId: proposal.id,
        userId,
        actionType: proposal.actionType,
        requestFingerprint,
        status: "EXECUTING",
        workerId: this.workerId,
        leaseExpiresAt: new Date(Date.now() + 15000),
        fencingEpoch: 1,
        timestamp: Date.now(),
      });

      const validation = await this.validateActionProposals(userId, [proposal]);
      if (!validation.valid || validation.validDecisions.length === 0) {
        const failReason = validation.rejectedProposals[0]?.reason || "Validation rejected";
        if (this.auditModel) {
          try {
            await this.auditModel.updateOne(
              { userId, idempotencyKey },
              { $set: { status: "FAILED", error: failReason, completedAt: new Date() } }
            );
          } catch {}
        }
        return {
          actionId: proposal.id,
          idempotencyKey: proposal.idempotencyKey,
          actionType: proposal.actionType,
          status: "FAILED",
          success: false,
          error: failReason,
          timestamp: Date.now(),
        };
      }

      const results = await this.executeActionBatch(userId, validation.validDecisions);
      const mainResult = results[0];

      // Update durable store with terminal state
      if (this.auditModel && mainResult) {
        try {
          if (mainResult.success) {
            await this.auditModel.updateOne(
              { userId, idempotencyKey },
              {
                $set: {
                  status: "SUCCEEDED",
                  result: mainResult.data,
                  completedAt: new Date(),
                },
              }
            );
          } else {
            await this.auditModel.updateOne(
              { userId, idempotencyKey },
              {
                $set: {
                  status: mainResult.status || "FAILED",
                  error: mainResult.error,
                  completedAt: new Date(),
                },
              }
            );
          }
        } catch {}
      }

      return mainResult;
    })();

    this.inFlightExecutions.set(cacheKey, executionPromise);

    try {
      const result = await executionPromise;
      return result;
    } finally {
      this.inFlightExecutions.delete(cacheKey);
    }
  }

  /**
   * Crash Reconciliation Protocol (AC-01 & Invariant 1.4)
   * Evaluates MutationReceiptModel and aggregate version to distinguish:
   * 1. Mutation applied: reconstruct original result envelope, transition to SUCCEEDED.
   * 2. Mutation unapplied: safe to reclaim lease and retry.
   * 3. Ghost version / uncertainty: transition to QUARANTINED.
   */
  private async reconcileCrashedExecution(
    userId: string,
    proposal: ActionProposal,
    auditRecord: any
  ): Promise<KernelExecutionResult | null> {
    const actionId = proposal.id;
    const cacheKey = `${userId}:${proposal.idempotencyKey}`;

    // 1. Check L2 MutationReceiptModel
    let receipt: any = null;
    if (this.receiptModel) {
      try {
        receipt = await this.receiptModel.findOne({ userId, clientMutationId: actionId });
      } catch {}
    }

    if (receipt && receipt.status === "COMMITTED") {
      // Domain mutation succeeded before crash! Reconstruct result envelope!
      const reconstructed = await this.reconstructResultEnvelope(userId, proposal, receipt);
      if (this.auditModel) {
        try {
          await this.auditModel.updateOne(
            { userId, idempotencyKey: proposal.idempotencyKey },
            {
              $set: {
                status: "SUCCEEDED",
                result: reconstructed,
                completedAt: new Date(),
              },
            }
          );
        } catch {}
      }

      this.auditStore.set(cacheKey, {
        idempotencyKey: proposal.idempotencyKey,
        actionId,
        userId,
        actionType: proposal.actionType,
        requestFingerprint: auditRecord.requestFingerprint,
        status: "SUCCEEDED",
        result: reconstructed,
        timestamp: Date.now(),
      });

      return {
        actionId,
        idempotencyKey: proposal.idempotencyKey,
        actionType: proposal.actionType,
        status: "SUCCEEDED",
        success: true,
        idempotent: true,
        data: reconstructed,
        targetEntityId: receipt.aggregateId || proposal.targetEntityId,
        timestamp: receipt.appliedAt ? new Date(receipt.appliedAt).getTime() : Date.now(),
      };
    }

    // 2. Receipt missing: check action category
    if (proposal.reversibility === "irreversible_external" || proposal.actionType === "external_capability_action") {
      if (this.auditModel) {
        try {
          await this.auditModel.updateOne(
            { userId, idempotencyKey: proposal.idempotencyKey },
            {
              $set: {
                status: "QUARANTINED",
                error: "External side-effect outcome uncertain past lease expiry",
              },
            }
          );
        } catch {}
      }
      this.auditStore.set(cacheKey, {
        idempotencyKey: proposal.idempotencyKey,
        actionId,
        userId,
        actionType: proposal.actionType,
        status: "QUARANTINED",
        error: "External side-effect outcome uncertain past lease expiry",
        timestamp: Date.now(),
      });
      throw new IdempotencyUncertainQuarantinedError(
        "External side-effect outcome uncertain past lease expiry; quarantined for safety."
      );
    }

    // 3. Aggregate mutation: ghost version check
    const expectedVer = (proposal as any).expectedVersion;
    if (expectedVer !== undefined && this.aggregateModelResolver) {
      try {
        const currentVer = await this.getAggregateCurrentVersion(proposal.actionType, proposal.targetEntityId || "");
        if (currentVer !== null && currentVer > expectedVer) {
          // Ghost version advancement! Quarantine!
          if (this.auditModel) {
            await this.auditModel.updateOne(
              { userId, idempotencyKey: proposal.idempotencyKey },
              {
                $set: {
                  status: "QUARANTINED",
                  error: `Ghost version advancement: version ${currentVer} > expected ${expectedVer} without receipt`,
                },
              }
            );
          }
          this.auditStore.set(cacheKey, {
            idempotencyKey: proposal.idempotencyKey,
            actionId,
            userId,
            actionType: proposal.actionType,
            status: "QUARANTINED",
            error: `Ghost version advancement: version ${currentVer} > expected ${expectedVer} without receipt`,
            timestamp: Date.now(),
          });
          throw new IdempotencyUncertainQuarantinedError(
            `Ghost version advancement: aggregate version ${currentVer} > expected ${expectedVer} without receipt`
          );
        }
      } catch (err: any) {
        if (err instanceof IdempotencyUncertainQuarantinedError) throw err;
      }
    }

    // 4. Safe to reclaim lease and retry!
    if (this.auditModel) {
      try {
        await this.auditModel.updateOne(
          { userId, idempotencyKey: proposal.idempotencyKey },
          {
            $set: {
              workerId: this.workerId,
              leaseExpiresAt: new Date(Date.now() + 15000),
            },
            $inc: { fencingEpoch: 1 },
          }
        );
      } catch {}
    }

    return null; // Signals caller to proceed with re-execution
  }

  private async reconstructResultEnvelope(
    userId: string,
    proposal: ActionProposal,
    receipt: any
  ): Promise<any> {
    const payload = proposal.parameters || proposal.payload || {};
    return {
      success: true,
      actionId: proposal.id,
      actionType: proposal.actionType,
      targetEntityId: receipt.aggregateId || proposal.targetEntityId,
      version: receipt.version,
      reconstructed: true,
      appliedAt: receipt.appliedAt,
      ...payload,
    };
  }

  private async getAggregateCurrentVersion(actionType: string, aggregateId: string): Promise<number | null> {
    if (!this.aggregateModelResolver || !aggregateId) return null;
    try {
      const model = this.aggregateModelResolver(actionType);
      if (!model) return null;
      const doc = await model.findById(aggregateId);
      if (doc && typeof doc.version === "number") {
        return doc.version;
      }
    } catch {}
    return null;
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
        this.auditStore.set(action.idempotencyKey, {
          idempotencyKey: action.idempotencyKey,
          actionId: action.id,
          userId,
          actionType: action.actionType,
          status: "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED",
          error: "Irreversible side effect could not be automatically rolled back",
          timestamp: Date.now(),
        });
        continue;
      }

      if (adapter && adapter.compensate) {
        try {
          const compResult = await adapter.compensate(action, result, userId);
          if (compResult.compensated) {
            this.auditStore.set(action.idempotencyKey, {
              idempotencyKey: action.idempotencyKey,
              actionId: action.id,
              userId,
              actionType: action.actionType,
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
              userId,
              actionType: action.actionType,
              status: "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED",
              error: compResult.error || "Compensation reported incomplete",
              timestamp: Date.now(),
            });
          }
        } catch (compErr: any) {
          this.auditStore.set(action.idempotencyKey, {
            idempotencyKey: action.idempotencyKey,
            actionId: action.id,
            userId,
            actionType: action.actionType,
            status: "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED",
            error: `Compensation throw exception: ${compErr.message}`,
            timestamp: Date.now(),
          });
        }
      }
    }
  }

  async readAuthoritativeState(userId: string): Promise<AuthoritativeKernelState> {
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
      idempotencyKey: `comp_${operation.operationId}_${operation.targetEntity?.entityId || "retract"}`,
    };

    const previousResult = {
      taskId: operation.targetEntity?.entityId || operation.payloadSnapshot?.taskId,
      goalId: operation.targetEntity?.entityId || operation.payloadSnapshot?.goalId,
      ...(operation.payloadSnapshot || {}),
    };

    if (adapter && adapter.compensate) {
      const result = await adapter.compensate(proposal, previousResult, userId);
      return Boolean(result.compensated);
    }
    return false;
  }
}
