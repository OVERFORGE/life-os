/**
 * DWCPRecoveryService.ts
 * 
 * Step 4 Loop 3: Secondary Consistency Sweepers
 * Background service for discovering and reconciling stalled DWCP workflow execution intents.
 * 
 * Invariants:
 * 1. Acquires exclusive partition lease `${userId}:dwcp:sweeper`.
 * 2. Recovers workflows stalled in "EXECUTING" past stall threshold (default: 30000ms).
 * 3. Enforces two-tier receipt verification and anti-corruption quarantine traps.
 * 4. Routes saga compensation strictly through canonical OutboxStorageService.
 */

import { DWCPRecoverySweeper, WorkflowReconciliationResult } from "./DWCPRecoverySweeper";
import { WorkflowExecutionIntentModel } from "../../../../apps/web/server/db/models/WorkflowExecutionIntentModel";
import { AutonomousLeaseManager } from "./AutonomousLeaseManager";

export interface DWCPRecoveryServiceDependencies {
  sweeper?: DWCPRecoverySweeper;
  intentModel?: any;
  leaseManager?: AutonomousLeaseManager;
  modelMap?: Map<string, any>;
}

export class DWCPRecoveryService {
  private static instance: DWCPRecoveryService;
  private sweeper: DWCPRecoverySweeper;
  private intentModel: any;
  private leaseManager: AutonomousLeaseManager;
  private modelMap: Map<string, any>;

  constructor(deps?: DWCPRecoveryServiceDependencies) {
    this.sweeper = deps?.sweeper || new DWCPRecoverySweeper();
    this.intentModel = deps?.intentModel || WorkflowExecutionIntentModel;
    this.leaseManager = deps?.leaseManager || new AutonomousLeaseManager();
    this.modelMap = deps?.modelMap || new Map();
  }

  static getInstance(deps?: DWCPRecoveryServiceDependencies): DWCPRecoveryService {
    if (!DWCPRecoveryService.instance) {
      DWCPRecoveryService.instance = new DWCPRecoveryService(deps);
    }
    return DWCPRecoveryService.instance;
  }

  public registerAggregateModel(aggregateType: string, model: any): void {
    this.modelMap.set(aggregateType, model);
  }

  /**
   * Discovers and reconciles stalled workflows for a given user under an exclusive lease.
   */
  public async reconcileStalledWorkflows(
    userId: string,
    workerId: string,
    options?: { stallThresholdMs?: number; leaseDurationMs?: number }
  ): Promise<WorkflowReconciliationResult[]> {
    const stallThresholdMs = options?.stallThresholdMs || 30000;
    const leaseDurationMs = options?.leaseDurationMs || 30000;
    const partitionKey = `${userId}:dwcp:sweeper`;

    // 1. Acquire exclusive partition lease
    const lease = await this.leaseManager.acquireLease(partitionKey, workerId, leaseDurationMs);
    if (!lease) {
      return []; // Back off: another sweeper is currently reconciling this user's workflows
    }

    const results: WorkflowReconciliationResult[] = [];
    try {
      const cutoff = new Date(Date.now() - stallThresholdMs);
      // Query stalled workflows in EXECUTING state
      const query = {
        userId,
        status: "EXECUTING",
        updatedAt: { $lt: cutoff },
      };

      const stalledIntents = await this.intentModel.find(query);

      for (const intent of stalledIntents) {
        // Reconcile workflow using recovery fencing epoch
        const reconResult = await this.sweeper.reconcileWorkflow(
          intent,
          this.modelMap,
          lease.epoch || 1
        );
        results.push(reconResult);
      }
    } finally {
      // Cleanly release lease
      await this.leaseManager.releaseLease(partitionKey, workerId, lease.epoch);
    }

    return results;
  }
}
