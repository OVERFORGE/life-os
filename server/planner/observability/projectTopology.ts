// ─────────────────────────────────────────────────────────────────────────────
// projectTopology
//
// Canonical Topology Projection Layer
//
// PURPOSE:
//   Extracts a deterministic, structurally comparable view of the planner state.
//   This eliminates duplicate projection logic across diffing, replay, and
//   convergence subsystems.
//
// DESIGN:
//   - topologyHash: Canonical fingerprint (stableJSON over sorted array of [id, start, end]).
//   - placements: Map of chunkId -> { startMinute, endMinute, repairGeneration }.
//
// DEPENDENT SUBSYSTEMS:
//   - diffTopologies
//   - replayTrace
//   - verifyRepairConvergence
//   - explainRepair / explainDisplacement
//
// DETERMINISM:
//   Given identical PlannerSimulationState, ALWAYS produces byte-identical hash.
// ─────────────────────────────────────────────────────────────────────────────

import { PlannerSimulationState } from "../types/SimulationTypes";

export interface CanonicalTopologyProjection {
  /**
   * Byte-identical fingerprint of the current schedule structure.
   * If hashA === hashB, the topologies are structurally identical.
   */
  topologyHash: string;

  /**
   * Structural placement data keyed by chunkId.
   */
  placements: Map<string, {
    startMinute: number;
    endMinute: number;
    repairGeneration: number;
  }>;
}

/**
 * Derives the canonical topology projection from a given simulation state.
 */
export function projectTopology(state: PlannerSimulationState): CanonicalTopologyProjection {
  const placements = new Map<string, { startMinute: number; endMinute: number; repairGeneration: number }>();
  const projectionArray: Array<{ id: string; start: number; end: number }> = [];

  for (const sp of state.schedule.scheduledPlacements) {
    const id = sp.task.id;
    const start = sp.placement.temporalWindow.startMinute;
    const end = sp.placement.temporalWindow.endMinute;

    placements.set(id, {
      startMinute: start,
      endMinute: end,
      repairGeneration: state.repairGeneration
    });

    projectionArray.push({ id, start, end });
  }

  // Lexicographical sort to guarantee determinism
  projectionArray.sort((a, b) => (a.id < b.id ? -1 : 1));

  const topologyHash = JSON.stringify(projectionArray);

  return {
    topologyHash,
    placements
  };
}
