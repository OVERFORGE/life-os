import { ExecutionTrace, CompactExecutionTrace } from "../types/SimulationTypes";
import { compressExecutionTrace } from "../observability/compressExecutionTrace";
import { replayTrace, replayCompactTrace } from "../observability/replayTrace";
import { projectTopology } from "../observability/projectTopology";

export interface MemoryGovernanceReport {
  isCompressed: boolean;
  compactTrace?: CompactExecutionTrace;
  error?: "horizon_memory_pressure";
}

/**
 * Actively manages trace compaction during execution to enforce memory bounds.
 * Performs inline deterministic verification to ensure replay continuity is never lost.
 */
export function governReplayMemory(
  trace: ExecutionTrace,
  maxMemorySnapshots: number
): MemoryGovernanceReport {
  
  if (trace.snapshots.length <= maxMemorySnapshots) {
    return { isCompressed: false };
  }

  // Memory bounds exceeded, attempt compaction
  const compactTrace = compressExecutionTrace(trace);

  // Verification: ensure the terminal hash of the replay matches the original trace's terminal hash
  try {
    let originalTerminalHash = "";
    for (const step of replayTrace(trace)) {
      originalTerminalHash = projectTopology(step.stateAfter).topologyHash;
    }
    // If no events, hash is from initial state
    if (!originalTerminalHash) {
      originalTerminalHash = projectTopology(trace.initialState).topologyHash;
    }

    let compactedTerminalHash = "";
    for (const step of replayCompactTrace(compactTrace)) {
      compactedTerminalHash = projectTopology(step.stateAfter).topologyHash;
    }
    if (!compactedTerminalHash) {
      compactedTerminalHash = projectTopology(compactTrace.initialState).topologyHash;
    }

    if (originalTerminalHash !== compactedTerminalHash) {
      return {
        isCompressed: false,
        error: "horizon_memory_pressure"
      };
    }

    return {
      isCompressed: true,
      compactTrace
    };
  } catch (error) {
    // If replay fails or diverges
    return {
      isCompressed: false,
      error: "horizon_memory_pressure"
    };
  }
}
