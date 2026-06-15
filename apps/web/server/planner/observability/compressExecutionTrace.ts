import { ExecutionTrace, CompactExecutionTrace, RepairBoundarySnapshot } from "../types/SimulationTypes";
import { projectTopology } from "./projectTopology";

/**
 * Deterministically compresses a full ExecutionTrace into a CompactExecutionTrace.
 * 
 * Requirements:
 * - deterministic snapshot compaction
 * - repair-boundary checkpointing
 * - topology deduplication
 * - replay-safe restoration guarantees
 * 
 * Compression must NEVER alter replay output.
 */
export function compressExecutionTrace(fullTrace: ExecutionTrace): CompactExecutionTrace {
  const repairBoundarySnapshots: RepairBoundarySnapshot[] = [];
  let maxRepairGenSeen = 0;

  for (let i = 0; i < fullTrace.snapshots.length; i++) {
    const snapshot = fullTrace.snapshots[i];

    // Detect the boundary: the first snapshot of a new repair generation
    if (snapshot.repairGeneration > maxRepairGenSeen) {
      maxRepairGenSeen = snapshot.repairGeneration;
      
      const topologyHash = projectTopology(snapshot).topologyHash;
      
      repairBoundarySnapshots.push({
        repairGeneration: snapshot.repairGeneration,
        logicalTick: snapshot.logicalTick,
        topologyHash,
        state: snapshot
      });
    }
  }

  return {
    initialState: fullTrace.initialState,
    events: fullTrace.events,
    repairBoundarySnapshots,
    terminationReason: fullTrace.terminationReason,
    totalRepairCycles: fullTrace.totalRepairCycles
  };
}
