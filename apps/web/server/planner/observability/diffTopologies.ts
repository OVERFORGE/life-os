// ─────────────────────────────────────────────────────────────────────────────
// diffTopologies
//
// Structural comparison between two PlannerSimulationState topology snapshots.
//
// DIFF ALGORITHM:
//   1. Compute topology hash of both states as a fast equality short-circuit.
//      If hashes are identical → states are structurally identical → return early.
//   2. Otherwise: build canonical placement projections from each state,
//      keyed by chunkId. Compare projections to identify added, removed, moved.
//
// WHY NOT HASH-ONLY:
//   Hash equality alone is insufficient for structural diffs because:
//   - Two different topologies may theoretically collide.
//   - A hash does not explain what changed — only that something did.
//   The hash is a fast-path optimization, not the diff substrate.
//
// PLACEMENT PROJECTION FORMAT:
//   Map<chunkId, { startMinute, endMinute, repairGeneration }>
//
//   repairGeneration is included so that the diff can distinguish:
//   - a chunk that moved within the same repair cycle, vs
//   - a chunk that moved across repair cycles (deeper causal chain)
//
// DETERMINISM:
//   Given identical (from, to) states, always produces identical TopologyDiff.
//   ChunkMovement ordering: sorted lexicographically by chunkId.
// ─────────────────────────────────────────────────────────────────────────────

import { PlannerSimulationState } from "../types/SimulationTypes";
import { projectTopology } from "./projectTopology";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChunkMovement {
  chunkId: string;
  fromStart: number;
  fromEnd: number;
  toStart: number;
  toEnd: number;
  /** Positive = shifted later; negative = shifted earlier */
  deltaMinutes: number;
  /** True iff this movement crossed a repair generation boundary */
  crossedRepairBoundary: boolean;
}

export interface TopologyDiff {
  generation: { from: number; to: number };
  /** Chunk IDs present in `to` but absent in `from` */
  addedChunkIds: string[];
  /** Chunk IDs present in `from` but absent in `to` (deferred or removed) */
  removedChunkIds: string[];
  /** Chunks present in both states but repositioned */
  movedChunks: ChunkMovement[];
  /** True iff no structural difference exists between the two states */
  isIdentical: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes the structural difference between two planner topology snapshots.
 *
 * @param from  - The earlier state (before mutation)
 * @param to    - The later state (after mutation)
 * @returns     - Deterministic structural diff
 */
export function diffTopologies(
  from: PlannerSimulationState,
  to: PlannerSimulationState
): TopologyDiff {
  const generation = {
    from: from.repairGeneration,
    to: to.repairGeneration,
  };

  // Get canonical projections
  const projFrom = projectTopology(from);
  const projTo = projectTopology(to);

  // Fast path: hash equality short-circuit
  if (projFrom.topologyHash === projTo.topologyHash) {
    return { generation, addedChunkIds: [], removedChunkIds: [], movedChunks: [], isIdentical: true };
  }

  const addedChunkIds: string[] = [];
  const removedChunkIds: string[] = [];
  const movedChunks: ChunkMovement[] = [];

  // Find added chunks (in `to` but not `from`)
  for (const [id] of projTo.placements) {
    if (!projFrom.placements.has(id)) addedChunkIds.push(id);
  }

  // Find removed + moved chunks (in `from`, check against `to`)
  for (const [id, pFrom] of projFrom.placements) {
    const pTo = projTo.placements.get(id);
    if (!pTo) {
      removedChunkIds.push(id);
      continue;
    }
    if (pFrom.startMinute !== pTo.startMinute || pFrom.endMinute !== pTo.endMinute) {
      movedChunks.push({
        chunkId: id,
        fromStart: pFrom.startMinute,
        fromEnd: pFrom.endMinute,
        toStart: pTo.startMinute,
        toEnd: pTo.endMinute,
        deltaMinutes: pTo.startMinute - pFrom.startMinute,
        crossedRepairBoundary: pTo.repairGeneration !== pFrom.repairGeneration,
      });
    }
  }

  // Sort deterministically: lexicographic by chunkId
  addedChunkIds.sort();
  removedChunkIds.sort();
  movedChunks.sort((a, b) => (a.chunkId < b.chunkId ? -1 : 1));

  return {
    generation,
    addedChunkIds,
    removedChunkIds,
    movedChunks,
    isIdentical: addedChunkIds.length === 0 && removedChunkIds.length === 0 && movedChunks.length === 0,
  };
}


