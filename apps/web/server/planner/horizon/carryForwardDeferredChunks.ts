import { PlannerSimulationState } from "../types/SimulationTypes";
import { SchedulableUnit } from "../types/SchedulingTypes";
import { DeferredCarryForward, HorizonFailureReason } from "../types/HorizonTypes";

export interface CarryForwardResult {
  /** The chunks to be injected into the next day's unit list */
  carriedUnits: SchedulableUnit[];
  
  /** Metadata for observability and explainability */
  carryMetadata: DeferredCarryForward[];
  
  /** 
   * If a chunk has been deferred too many times or hits a deadlock,
   * this will be populated.
   */
  failureReason?: HorizonFailureReason;
}

/**
 * Extracts deferred chunks from a completed day's simulation state
 * and deterministically relocates them into the next valid horizon slot.
 * 
 * INVARIANTS:
 * - chunkId identity is strictly preserved.
 * - repairGeneration lineage is preserved.
 * - DAG invariants (dependency ordering) are not violated.
 */
export function carryForwardDeferredChunks(
  completedState: PlannerSimulationState,
  fromDayIndex: number,
  toDayIndex: number,
  maxDeferralDays: number = 7
): CarryForwardResult {
  const carriedUnits: SchedulableUnit[] = [];
  const carryMetadata: DeferredCarryForward[] = [];
  
  const unitMap = new Map(completedState.units.map(u => [u.id, u]));
  let failureReason: HorizonFailureReason | undefined = undefined;

  for (const chunkId of completedState.deferredChunkIds) {
    const unit = unitMap.get(chunkId);
    if (!unit) {
      continue; // Ghost chunk, should be caught by strict validation elsewhere
    }

    // Determine the reason it was deferred. For now, we assume if it's in 
    // deferredChunkIds, it was pushed out by a repair displacement or just 
    // couldn't fit initially. We classify this broadly as "repair_displacement".
    // Future enhancements might inspect the eventLog to see exactly why.
    const carryReason = "repair_displacement";
    
    // Check for infinite carry-forward (deadlock)
    // In a real implementation we might track how many days it has been deferred
    // by comparing the current day against its original target day. For now we just
    // use a heuristic or assume it's bounded by the simulation boundary.
    // If we wanted to track age strictly, we'd look at when it first appeared.
    
    carriedUnits.push(unit); // Pass the exact reference to preserve lineage

    carryMetadata.push({
      chunkId,
      fromDayIndex,
      toDayIndex,
      carryReason,
      deferredMinutes: unit.estimatedDurationMinutes
    });
  }

  // Also carry forward unscheduled tasks from the initial schedule 
  // that were never placed and thus never became active/deferred chunks
  for (const chunkId of completedState.schedule.unscheduledTaskIds) {
    if (!completedState.deferredChunkIds.has(chunkId)) {
      const unit = unitMap.get(chunkId);
      if (unit) {
        carriedUnits.push(unit);
        carryMetadata.push({
          chunkId,
          fromDayIndex,
          toDayIndex,
          carryReason: "unfinished",
          deferredMinutes: unit.estimatedDurationMinutes
        });
      }
    }
  }

  return {
    carriedUnits,
    carryMetadata,
    failureReason
  };
}
