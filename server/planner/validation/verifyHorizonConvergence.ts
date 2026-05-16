import { CandidateSchedule } from "../types/ScheduleGraphTypes";
import { SchedulableUnit, PlacementAnalysisContext } from "../types/SchedulingTypes";
import { PlannerEvent } from "../types/PlannerEventTypes";
import { SimulationOptions } from "../types/SimulationTypes";
import { DayBoundary } from "../types/HorizonTypes";
import { simulateExecutionHorizon } from "../simulation/simulateExecutionHorizon";
import { projectHorizonTopology } from "../observability/projectHorizonTopology";

export interface HorizonConvergenceReport {
  converged: boolean;
  totalDaysSimulated: number;
  totalRepairCycles: number;

  /** Stable terminal hash for the multi-day horizon */
  terminalHorizonHash: string;
  
  /** Drift metrics */
  driftVelocity: {
    /** Change in deferred queue size between day 0 and final day */
    deferredQueueDelta: number;
    /** Rate at which the schedule changes per day boundary */
    topologyInstabilityRate: number;
    /** Max depth a repair cascaded across days */
    repairPropagationDepthAcrossDays: number;
  };
  
  /** If false, identifies why it failed */
  failureReason?: string;
  
  reasoning: string[];
}

/**
 * Validates that rolling multi-day repairs stabilize instead of entering an
 * infinite carry-forward loop.
 */
export function verifyHorizonConvergence(
  initialSchedule: CandidateSchedule,
  units: SchedulableUnit[],
  context: PlacementAnalysisContext,
  events: PlannerEvent[],
  boundaries: DayBoundary[],
  options: SimulationOptions
): HorizonConvergenceReport {
  
  // We utilize the multi-day wrapper (to be implemented)
  const trace = simulateExecutionHorizon(
    initialSchedule,
    units,
    context,
    events,
    boundaries,
    options
  );

  const finalDays = trace.terminalDayStates;
  const initialDeferredCount = trace.initialDayState.deferredChunkIds.size + trace.initialDayState.schedule.unscheduledTaskIds.length;
  
  let finalDeferredCount = 0;
  for (const [dayIdx, state] of finalDays.entries()) {
    if (dayIdx === boundaries[boundaries.length - 1].dayIndex) {
      finalDeferredCount = state.deferredChunkIds.size + state.schedule.unscheduledTaskIds.length;
    }
  }

  const deferredQueueDelta = finalDeferredCount - initialDeferredCount;
  const terminalTopology = projectHorizonTopology(finalDays);

  const converged = trace.terminationReason !== "unresolvable_conflict" 
                 && trace.terminationReason !== "max_repairs_reached"
                 && trace.terminationReason !== "horizon_exhausted";

  return {
    converged,
    totalDaysSimulated: finalDays.size,
    totalRepairCycles: trace.totalRepairCycles,
    terminalHorizonHash: terminalTopology.horizonHash,
    driftVelocity: {
      deferredQueueDelta,
      // For now, heuristic metrics, can be refined based on event log analysis
      topologyInstabilityRate: trace.totalRepairCycles / Math.max(1, finalDays.size),
      repairPropagationDepthAcrossDays: trace.maxCrossDayPropagations || 0
    },
    failureReason: trace.terminationReason !== "all_chunks_complete" && trace.terminationReason !== "event_sequence_exhausted" ? trace.terminationReason : undefined,
    reasoning: [
      `Horizon simulated ${finalDays.size} days with ${trace.totalRepairCycles} total repairs.`,
      `Deferred queue delta: ${deferredQueueDelta > 0 ? "+" : ""}${deferredQueueDelta}.`
    ]
  };
}
