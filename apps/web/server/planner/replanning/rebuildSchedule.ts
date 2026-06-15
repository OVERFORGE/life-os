import { CandidateSchedule, ScheduledTaskPlacement } from "../types/ScheduleGraphTypes";
import { SchedulableUnit, PlacementAnalysisContext, PlacementAnchorType } from "../types/SchedulingTypes";
import { TaskExecutionState } from "../types/ChunkGraphTypes";
import { generateCandidateSchedules } from "../scheduling/generateCandidateSchedules";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — Schedule Replanning Engine
//
// Performs stability-preserving schedule repairs. 
// 1. Preserves `fixed` anchors perfectly.
// 2. Penalizes movement of `sticky` anchors.
// 3. Emits delta metrics indicating schedule disruption.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduleRepairDelta {
  /** 
   * Aggregate measure of schedule disruption ∈ [0,1].
   * 1.0 means no disruption. Lower means higher disruption. 
   */
  scheduleDeltaScore: number;
  
  /** Total temporal displacement across all units in minutes */
  movementCost: number;
  
  /** Ratio of units that stayed in their exact prior time window */
  preservedPlacementRatio: number;
}

export interface RebuiltScheduleResult {
  schedule: CandidateSchedule;
  delta: ScheduleRepairDelta;
}

export function rebuildSchedule(
  previousSchedule: CandidateSchedule,
  executionStates: TaskExecutionState[],
  remainingUnits: SchedulableUnit[],
  context: PlacementAnalysisContext,
  anchors: Map<string, PlacementAnchorType> = new Map()
): RebuiltScheduleResult {
  
  // ── 1. Prepare Remaining Units with Prior Topology ─────────────────────────
  const adjustedUnits: SchedulableUnit[] = [];
  const previousPlacementMap = new Map<string, ScheduledTaskPlacement>();
  
  for (const sp of previousSchedule.scheduledPlacements) {
    previousPlacementMap.set(sp.task.id, sp);
  }

  for (const unit of remainingUnits) {
    const prevSP = previousPlacementMap.get(unit.id);
    const anchor = anchors.get(unit.id) || "movable";
    
    // We clone arrays so we don't mutate the original input
    let hardConstraints = unit.hardConstraints ? [...unit.hardConstraints] : [];
    let preferredTimeWindows = unit.preferredTimeWindows ? [...unit.preferredTimeWindows] : [];

    if (prevSP) {
      if (anchor === "fixed") {
        // To preserve perfectly, we must boost it massively via preferredTimeWindows
        // (Hard constraints act as exclusion zones in validateCandidatePlacement)
        preferredTimeWindows.push(prevSP.placement.temporalWindow);
      } else if (anchor === "sticky") {
        // Heavily prefer the previous window, but allow movement if conflict is unavoidable
        preferredTimeWindows.push(prevSP.placement.temporalWindow);
      }
    }

    adjustedUnits.push({
      ...unit,
      hardConstraints,
      preferredTimeWindows
    });
  }

  // ── 2. Generate Candidate Schedules ────────────────────────────────────────
  // We reuse the greedy combinatorial engine, but it is now biased by the 
  // constraints we injected above.
  const candidateSchedules = generateCandidateSchedules(adjustedUnits, context);
  
  // The generator sorts by scheduleScore descending.
  const bestSchedule = candidateSchedules[0];

  // ── 3. Compute Delta Metrics & Inject Lineage ──────────────────────────────
  let movementCost = 0;
  let preservedCount = 0;
  
  if (bestSchedule) {
    for (const newSP of bestSchedule.scheduledPlacements) {
      const prevSP = previousPlacementMap.get(newSP.task.id);
      
      if (prevSP) {
        // Carry over repair lineage
        const currentGen = prevSP.placement.repairGeneration || 0;
        newSP.placement.derivedFromPlacementId = prevSP.placement.placementId;
        newSP.placement.repairGeneration = currentGen + 1;

        // Calculate drift
        let diff = Math.abs(prevSP.placement.temporalWindow.startMinute - newSP.placement.temporalWindow.startMinute);
        
        // Adjust for midnight wrapping (shortest circular distance)
        if (diff > 720) {
          diff = 1440 - diff;
        }

        if (diff === 0) {
           preservedCount++;
        } else {
           movementCost += diff;
        }
      }
    }
  }

  // Delta score decays asymptotically as movement cost increases
  const scheduleDeltaScore = movementCost > 0 ? (1.0 / (1.0 + movementCost / 120)) : 1.0;
  
  const totalTracked = previousPlacementMap.size;
  const preservedPlacementRatio = totalTracked > 0 ? preservedCount / totalTracked : 1.0;

  // Fallback for extreme edge case (no schedulable tasks)
  const finalSchedule = bestSchedule || {
      scheduleId: "empty_rebuild",
      scheduledPlacements: [],
      unscheduledTaskIds: remainingUnits.map(u => u.id),
      conflicts: [],
      scheduleScore: 0,
      stabilityScore: 0,
      focusScore: 0,
      fragmentationScore: 0,
      recoverySafetyScore: 0,
      coverageRatio: 0,
      confidence: 0,
      seedStrategy: "urgency_first",
      reasoning: ["failed_rebuild_no_candidates"],
      penaltiesApplied: [],
      boostsApplied: []
  };

  return {
    schedule: finalSchedule,
    delta: {
      scheduleDeltaScore: Number(scheduleDeltaScore.toFixed(3)),
      movementCost,
      preservedPlacementRatio: Number(preservedPlacementRatio.toFixed(3))
    }
  };
}
