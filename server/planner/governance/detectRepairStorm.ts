import { DeferredCarryForward } from "../types/HorizonTypes";
import { SchedulableUnit } from "../types/SchedulingTypes";

export interface RepairStormReport {
  isStorm: boolean;
  stormingLineageRootId?: string;
  chainLength?: number;
}

/**
 * Detects if a logical lineage of chunks is stuck in an infinite 
 * `repair -> carry-forward -> repair` loop across multi-day horizons.
 * 
 * Lineage-aware: If a chunk is split or mutated, it retains its lineageRootId.
 * This prevents mutated chunks from evading storm detection.
 */
export function detectRepairStorm(
  carryMetadataLog: DeferredCarryForward[],
  units: SchedulableUnit[],
  maxCarryForwardChains: number
): RepairStormReport {
  const displacementCounts = new Map<string, number>();
  
  // Create a quick lookup for lineage
  const lineageLookup = new Map<string, string>();
  for (const unit of units) {
    // If it has a root ID, use it. Otherwise, its own ID is the root of its lineage.
    lineageLookup.set(unit.id, unit.lineageRootId || unit.id);
  }

  for (const entry of carryMetadataLog) {
    if (entry.carryReason === "repair_displacement") {
      const lineageRootId = lineageLookup.get(entry.chunkId) || entry.chunkId;
      const count = (displacementCounts.get(lineageRootId) || 0) + 1;
      displacementCounts.set(lineageRootId, count);

      if (count >= maxCarryForwardChains) {
        return {
          isStorm: true,
          stormingLineageRootId: lineageRootId,
          chainLength: count
        };
      }
    }
  }

  return { isStorm: false };
}
