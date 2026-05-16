import { PlannerSimulationState } from "../types/SimulationTypes";
import { projectTopology, CanonicalTopologyProjection } from "./projectTopology";

export interface HorizonTopologyProjection {
  /** Byte-identical fingerprint of the entire multi-day schedule structure. */
  horizonHash: string;
  
  /** The isolated topology projection for each day. */
  days: Map<number, CanonicalTopologyProjection>;
  
  /**
   * Flattened structural placement data keyed by chunkId.
   */
  placements: Map<string, {
    dayIndex: number;
    startMinute: number;
    endMinute: number;
    repairGeneration: number;
  }>;
}

/**
 * Derives the canonical multi-day topology projection.
 * Composes over projectTopology to ensure projection invariants
 * are strictly preserved at the day level.
 */
export function projectHorizonTopology(
  dayStates: Map<number, PlannerSimulationState>
): HorizonTopologyProjection {
  const days = new Map<number, CanonicalTopologyProjection>();
  const placements = new Map<string, { dayIndex: number; startMinute: number; endMinute: number; repairGeneration: number }>();
  
  const projectionArray: Array<{ id: string; dayIndex: number; start: number; end: number }> = [];

  // Compose over projectTopology (Invariant: do not fork projection semantics)
  for (const [dayIndex, state] of dayStates.entries()) {
    const dayProjection = projectTopology(state);
    days.set(dayIndex, dayProjection);
    
    for (const [chunkId, placement] of dayProjection.placements.entries()) {
      placements.set(chunkId, {
        dayIndex,
        startMinute: placement.startMinute,
        endMinute: placement.endMinute,
        repairGeneration: placement.repairGeneration,
      });
      
      projectionArray.push({
        id: chunkId,
        dayIndex,
        start: placement.startMinute,
        end: placement.endMinute,
      });
    }
  }

  // Lexicographical sort by chunkId, then by dayIndex
  projectionArray.sort((a, b) => {
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return a.dayIndex - b.dayIndex;
  });

  const horizonHash = JSON.stringify(projectionArray);

  return {
    horizonHash,
    days,
    placements
  };
}
