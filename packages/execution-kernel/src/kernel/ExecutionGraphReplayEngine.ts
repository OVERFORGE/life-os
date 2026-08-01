import { ExecutionGraph, ExecutionGraphSnapshot } from "./ExecutionGraph";
import { RepairPlan, RepairDiagnostics } from "./AdaptiveRepairEngine";
import { ExecutionGraphApplier, TransactionResult } from "./ExecutionGraphApplier";

/**
 * ExecutionGraphReplayEngine Subsystem
 * 
 * SOLE OWNER of deterministic graph replay.
 * Replays historical RepairPlans over a base ExecutionGraph by delegating directly to ExecutionGraphApplier.
 * 
 * HARDENING TASK 6 (Phase 9.6):
 * - NO DUPLICATED APPLICATION LOGIC: Live execution and historical replay share the exact same transaction applier.
 * - 100% deterministic and replayable years later.
 */
export class ExecutionGraphReplayEngine {
  private static instance: ExecutionGraphReplayEngine;

  static getInstance(): ExecutionGraphReplayEngine {
    if (!ExecutionGraphReplayEngine.instance) {
      ExecutionGraphReplayEngine.instance = new ExecutionGraphReplayEngine();
    }
    return ExecutionGraphReplayEngine.instance;
  }

  /**
   * Replays a sequence of RepairPlans over a baseline ExecutionGraph.
   * Returns the final replayed ExecutionGraph and snapshots.
   */
  replay(
    baseGraph: ExecutionGraph,
    plans: RepairPlan[]
  ): { finalGraph: ExecutionGraph; results: TransactionResult[] } {
    const replayedGraph = baseGraph.clone();
    const applier = ExecutionGraphApplier.getInstance();
    const results: TransactionResult[] = [];

    console.log(`🔄 [REPLAY_ENGINE] Starting deterministic replay of ${plans.length} repair plan(s).`);

    for (const plan of plans) {
      const dummyDiagnostics: RepairDiagnostics = {
        repairReason: `Replay execution for plan ${plan.id}`,
        propagationChain: [],
        repairedNodeIds: plan.affectedNodeIds,
        unchangedNodeIds: [],
        deadNodeIds: [],
        orphanNodeIds: [],
        stabilityScore: 100,
        warnings: [],
      };

      const result = applier.applyTransaction(replayedGraph, plan, dummyDiagnostics);
      results.push(result);

      if (!result.committed) {
        console.error(`❌ [REPLAY_ENGINE] Replay aborted at plan ${plan.id} due to transaction failure.`);
        break;
      }
    }

    console.log(`✅ [REPLAY_ENGINE] Replay completed. Final graph version: v${replayedGraph.getGraphVersion()}`);

    return {
      finalGraph: replayedGraph,
      results,
    };
  }
}
