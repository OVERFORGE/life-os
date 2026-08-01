import { ExecutionGraph, ExecutionGraphSnapshot } from "./ExecutionGraph";
import { RepairPlan, RepairDiagnostics } from "./AdaptiveRepairEngine";
import { RepairHistory } from "./RepairHistory";
import { ExecutionStateValidator } from "./ExecutionStateValidator";
import { RepairOperationExecutorRegistry } from "./RepairOperationExecutors";
import { EventBus } from "../events/EventBus";
import { createKernelEvent } from "../events/Event";
import { createGraphVersion } from "./GraphVersion";

export interface TransactionResult {
  committed: boolean;
  inputVersion: number;
  outputVersion: number;
  operationsApplied: number;
  updatedSnapshot: ExecutionGraphSnapshot;
}

/**
 * ExecutionGraphApplier
 * 
 * SOLE OWNER of graph operation application and atomic repair transactions.
 * Applies RepairPlans deterministically using 100% or 0% atomic transaction semantics.
 * 
 * HARDENING UPGRADES (Phase 9.6):
 * - TASK 3: Uses deterministic transaction timestamp (new Date(plan.timestamp)) for all node mutations.
 * - TASK 4: Validates state transitions via ExecutionStateValidator before commit.
 * - TASK 5: Uses RepairOperationExecutorRegistry (Command Pattern).
 * - TASK 7: Enforces strict event ordering (RepairStarted -> Node Events -> GraphVersionCreated -> RepairCommitted -> RepairCompleted).
 */
export class ExecutionGraphApplier {
  private static instance: ExecutionGraphApplier;

  static getInstance(): ExecutionGraphApplier {
    if (!ExecutionGraphApplier.instance) {
      ExecutionGraphApplier.instance = new ExecutionGraphApplier();
    }
    return ExecutionGraphApplier.instance;
  }

  /**
   * Applies a RepairPlan atomically to an ExecutionGraph.
   */
  applyTransaction(
    graph: ExecutionGraph,
    plan: RepairPlan,
    diagnostics: RepairDiagnostics
  ): TransactionResult {
    const eventBus = EventBus.getInstance();
    const inputVersion = graph.getGraphVersion();

    // Deterministic transaction timestamp derived exclusively from plan.timestamp (Hardening Task 3)
    const txTimestamp = new Date(plan.timestamp);

    // 1. EVENT: RepairStarted (Hardening Task 7)
    eventBus.publish(
      createKernelEvent("RepairStarted", "ExecutionGraphApplier", {
        repairId: plan.id,
        trigger: plan.trigger,
        inputVersion,
        operationsCount: plan.operations.length,
      })
    );

    // 2. State Validation via ExecutionStateValidator (Hardening Task 4)
    const validator = ExecutionStateValidator.getInstance();
    const validationError = validator.validate(graph, plan.operations);

    if (validationError) {
      console.error(`❌ [TRANSACTION_FAILED] Validation failed: ${validationError}. Rolling back.`);
      // Rollback Path: RepairStarted -> RepairRolledBack (Hardening Task 7)
      eventBus.publish(
        createKernelEvent("RepairRolledBack", "ExecutionGraphApplier", {
          repairId: plan.id,
          reason: validationError,
          inputVersion,
        })
      );
      return {
        committed: false,
        inputVersion,
        outputVersion: inputVersion,
        operationsApplied: 0,
        updatedSnapshot: graph.createSnapshot(),
      };
    }

    // 3. Isolated Apply on Cloned Sandbox Graph
    const sandboxGraph = graph.clone();
    const registry = RepairOperationExecutorRegistry.getInstance();
    let appliedCount = 0;

    try {
      for (const op of plan.operations) {
        // Command Pattern Execution (Hardening Task 5)
        registry.execute(sandboxGraph, op, txTimestamp, eventBus);
        appliedCount++;
      }
    } catch (err: any) {
      console.error(`❌ [TRANSACTION_FAILED] Exception during operation apply: ${err.message}. Rolling back.`);
      eventBus.publish(
        createKernelEvent("RepairRolledBack", "ExecutionGraphApplier", {
          repairId: plan.id,
          reason: err.message || "Execution exception",
          inputVersion,
        })
      );
      return {
        committed: false,
        inputVersion,
        outputVersion: inputVersion,
        operationsApplied: 0,
        updatedSnapshot: graph.createSnapshot(),
      };
    }

    // 4. Commit Changes Back to Main Graph (Atomic Swap)
    for (const node of sandboxGraph.getAllNodes()) {
      const mainNode = graph.getNode(node.id);
      if (mainNode) {
        mainNode.status = node.status;
        mainNode.priority = node.priority;
        mainNode.updatedAt = txTimestamp;
      }
    }

    // 5. Version Metadata Update (Hardening Task 8)
    const newVersionMeta = createGraphVersion(
      plan.outputGraphVersion,
      inputVersion,
      plan.id,
      plan.timestamp
    );
    graph.setVersionMetadata(newVersionMeta);

    // 6. Record to O(1) Indexed RepairHistory
    RepairHistory.getInstance().addRecord({
      repairId: plan.id,
      inputGraphVersion: inputVersion,
      outputGraphVersion: plan.outputGraphVersion,
      trigger: plan.trigger,
      operations: plan.operations,
      diagnostics,
      timestamp: plan.timestamp,
    });

    // 7. Strictly Ordered Event Emissions (Hardening Task 7)
    // Sequence: RepairStarted -> Node Events (emitted during registry.execute) -> GraphVersionCreated -> RepairCommitted -> RepairCompleted
    eventBus.publish(
      createKernelEvent("GraphVersionCreated", "ExecutionGraphApplier", {
        previousVersion: inputVersion,
        newVersion: plan.outputGraphVersion,
        versionMetadata: newVersionMeta,
      })
    );

    eventBus.publish(
      createKernelEvent("RepairCommitted", "ExecutionGraphApplier", {
        repairId: plan.id,
        outputVersion: plan.outputGraphVersion,
        appliedCount,
      })
    );

    eventBus.publish(
      createKernelEvent("RepairCompleted", "ExecutionGraphApplier", {
        repairId: plan.id,
        outputVersion: plan.outputGraphVersion,
      })
    );

    console.log(
      `✅ [TRANSACTION_COMMITTED] Repair ${plan.id} committed successfully. Graph version: v${inputVersion} -> v${plan.outputGraphVersion}`
    );

    return {
      committed: true,
      inputVersion,
      outputVersion: plan.outputGraphVersion,
      operationsApplied: appliedCount,
      updatedSnapshot: graph.createSnapshot(),
    };
  }
}
