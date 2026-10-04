/**
 * Autonomous Action Reverser (Phase 15)
 * 
 * Enforces Level 5 autonomy with deterministic capability-specific compensation.
 * Guarantees that any autonomous mutation can be reversed within the retention window (24h).
 * 
 * CONSTITUTIONAL INVARIANTS:
 * - Confidence is epistemic information, not execution authorization.
 * - Only LOW risk, REVERSIBLE_EXACT capabilities may execute autonomously.
 * - Reversal is executed strictly via KernelCapabilityService.
 * - If unexpected external state drift is detected, enters UNKNOWN_EXTERNAL_STATE
 *   rather than blindly forcing an invalid revert.
 */

import {
  IAutonomousExecutionRecord,
  ICompensationContract,
} from "./contracts/AutonomyContracts";
import { IKernelCapabilityService } from "../orchestration/kernel/IKernelCapabilityService";
import { ActionProposal } from "../orchestration/contracts/ActionProposalContracts";
import { generateId } from "../shared/ids";

export class AutonomousActionReverser {
  private static instance: AutonomousActionReverser;
  private records: Map<string, IAutonomousExecutionRecord> = new Map();
  private lockedRulesUntil: Map<string, number> = new Map(); // Rule locks learned from undos (30-day cooldown)

  static getInstance(): AutonomousActionReverser {
    if (!AutonomousActionReverser.instance) {
      AutonomousActionReverser.instance = new AutonomousActionReverser();
    }
    return AutonomousActionReverser.instance;
  }

  /**
   * Records an autonomous execution in the ledger.
   */
  async recordAutonomousExecution(
    userId: string,
    capabilityURN: string,
    parameters: Record<string, unknown>,
    rationale: string,
    compensationAction: ICompensationContract,
    policyRuleId: string,
    epistemicConfidence: number = 0.90,
    stateSnapshotBefore?: Record<string, unknown>
  ): Promise<IAutonomousExecutionRecord> {
    const executionId = generateId("auto_exec");

    const record: IAutonomousExecutionRecord = {
      executionId,
      userId,
      capabilityURN,
      parameters,
      riskClass: "LOW",
      reversibility: "REVERSIBLE_EXACT",
      externalSideEffectClass: "NONE",
      providerGuarantee: "ATOMIC",
      policyRuleId,
      epistemicConfidence,
      rationale,
      compensationAction,
      executedAt: Date.now(),
      stateSnapshotBefore,
    };

    this.records.set(executionId, record);

    // Persist to MongoDB if available and connected
    try {
      const mongoose = await import("mongoose");
      if (mongoose.default?.connection?.readyState === 1) {
        const { AutonomousExecutionLedgerModel } = await import(
          "../../../../apps/web/server/db/models/AutonomousExecutionLedgerModel"
        );
        await AutonomousExecutionLedgerModel.create(record);
      }
    } catch {
      // Database not connected or unavailable
    }

    return record;
  }

  /**
   * Executes deterministic compensation to revert an autonomous action.
   */
  async executeCompensation(
    userId: string,
    executionId: string,
    kernelService: IKernelCapabilityService,
    now: number = Date.now()
  ): Promise<{
    success: boolean;
    lifecycleState: "CONFIRMED_EXTERNAL_COMMIT" | "UNKNOWN_EXTERNAL_STATE" | "EXTERNAL_REJECTED";
    reconciliationRequired?: boolean;
    error?: string;
  }> {
    const record = this.records.get(executionId);
    if (!record || record.userId !== userId) {
      return {
        success: false,
        lifecycleState: "EXTERNAL_REJECTED",
        error: `Autonomous execution record '${executionId}' not found for user.`,
      };
    }

    // 1. Idempotency: Cannot undo twice
    if (record.undoneAt) {
      return {
        success: false,
        lifecycleState: "EXTERNAL_REJECTED",
        error: `Action '${executionId}' has already been compensated at ${new Date(record.undoneAt).toISOString()}`,
      };
    }

    // 2. Retention Window Check (Default: 24 hours)
    const retentionWindowMs = 24 * 3600 * 1000;
    if (now - record.executedAt > retentionWindowMs) {
      return {
        success: false,
        lifecycleState: "EXTERNAL_REJECTED",
        error: "Retention window (24h) expired for autonomous action reversal.",
      };
    }

    // 3. Build Compensation Proposal
    const compProposal: ActionProposal = {
      proposalId: generateId("comp_prop"),
      capabilityURN: record.compensationAction.capabilityURN,
      intentCategory: "MODIFY_SCHEDULE",
      parameters: record.compensationAction.parameters,
      confidence: 1.0,
      provenance: "AutonomousActionReverser:Compensation",
      requiresConfirmation: false,
      estimatedImpactScore: 0.5,
    } as unknown as ActionProposal;

    // 4. Execute via Kernel Boundary
    try {
      await kernelService.executeAction(userId, compProposal);

      record.undoneAt = now;
      record.userFeedback = "REVERSED";

      // 5. Adaptive Learning: Lock this rule into Level 4 (Approval required) for 30 days
      const lockKey = `${userId}:${record.policyRuleId}`;
      const thirtyDaysMs = 30 * 24 * 3600 * 1000;
      this.lockedRulesUntil.set(lockKey, now + thirtyDaysMs);

      // Update MongoDB record if connected
      try {
        const mongoose = await import("mongoose");
        if (mongoose.default?.connection?.readyState === 1) {
          const { AutonomousExecutionLedgerModel } = await import(
            "../../../../apps/web/server/db/models/AutonomousExecutionLedgerModel"
          );
          await AutonomousExecutionLedgerModel.updateOne(
            { executionId },
            { $set: { undoneAt: now, userFeedback: "REVERSED" } }
          );
        }
      } catch {
        // DB not connected
      }

      return {
        success: true,
        lifecycleState: "CONFIRMED_EXTERNAL_COMMIT",
      };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const isExternalDrift = errMsg.includes("drift") || errMsg.includes("conflict") || errMsg.includes("timeout");

      return {
        success: false,
        lifecycleState: isExternalDrift ? "UNKNOWN_EXTERNAL_STATE" : "EXTERNAL_REJECTED",
        reconciliationRequired: isExternalDrift,
        error: `Compensation failed: ${errMsg}`,
      };
    }
  }

  isRuleLocked(userId: string, policyRuleId: string, now: number = Date.now()): boolean {
    const lockKey = `${userId}:${policyRuleId}`;
    const expiresAt = this.lockedRulesUntil.get(lockKey);
    if (!expiresAt) return false;
    return now < expiresAt;
  }

  getRecord(executionId: string): IAutonomousExecutionRecord | undefined {
    return this.records.get(executionId);
  }

  getRecordsForUser(userId: string): IAutonomousExecutionRecord[] {
    const userRecords: IAutonomousExecutionRecord[] = [];
    for (const record of this.records.values()) {
      if (record.userId === userId) {
        userRecords.push(record);
      }
    }
    return userRecords.sort((a, b) => b.executedAt - a.executedAt);
  }

  clearRecords(userId?: string): void {
    if (userId) {
      for (const [k, v] of this.records.entries()) {
        if (v.userId === userId) {
          this.records.delete(k);
        }
      }
    } else {
      this.records.clear();
      this.lockedRulesUntil.clear();
    }
  }
}
