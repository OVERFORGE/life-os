import { CandidateSchedule } from "../types/ScheduleGraphTypes";
import { SchedulableUnit, PlacementAnalysisContext } from "../types/SchedulingTypes";
import { PlannerEvent, sortPlannerEvents } from "../types/PlannerEventTypes";
import { SimulationOptions, PlannerSimulationState } from "../types/SimulationTypes";
import { DayBoundary } from "../types/HorizonTypes";
import { applyPlannerEvent } from "./applyPlannerEvent";

export interface HorizonExecutionTrace {
  initialDayState: PlannerSimulationState;
  
  /** The state exactly at the boundary crossing, keyed by dayIndex */
  terminalDayStates: Map<number, PlannerSimulationState>;
  
  events: readonly PlannerEvent[];
  totalRepairCycles: number;
  terminationReason: "all_chunks_complete" | "max_repairs_reached" | "event_sequence_exhausted" | "unresolvable_conflict" | "horizon_exhausted";
  maxCrossDayPropagations?: number;
}

/**
 * Deterministic multi-day simulation wrapper.
 * Coordinates day transitions and invokes the core execution loop, preserving replay continuity.
 */
export function simulateExecutionHorizon(
  initialSchedule: CandidateSchedule,
  units: SchedulableUnit[],
  context: PlacementAnalysisContext,
  events: PlannerEvent[],
  boundaries: DayBoundary[],
  options: SimulationOptions
): HorizonExecutionTrace {
  const allScheduledChunkIds = new Set(
    initialSchedule.scheduledPlacements.map(sp => sp.task.id)
  );

  const initialState: PlannerSimulationState = {
    schedule: initialSchedule,
    units,
    context: { ...context, dayOfWeek: boundaries[0]?.dayIndex ?? context.dayOfWeek },
    activeChunkIds: new Set(),
    completedChunkIds: new Set(),
    deferredChunkIds: new Set(),
    repairGeneration: 0,
    logicalTick: 0,
    eventLog: [],
  };

  const sortedEvents = sortPlannerEvents(events);
  const terminalDayStates = new Map<number, PlannerSimulationState>();
  
  let currentState = initialState;
  let terminationReason: HorizonExecutionTrace["terminationReason"] | null = null;
  let currentDayIndex = boundaries[0]?.dayIndex ?? 0;

  for (const event of sortedEvents) {
    let nextState: PlannerSimulationState;
    try {
      nextState = applyPlannerEvent(currentState, event);
    } catch {
      terminationReason = "unresolvable_conflict";
      break;
    }

    currentState = nextState;

    if (event.type === "day_boundary_crossed") {
      terminalDayStates.set(currentDayIndex, currentState);
      currentDayIndex = event.boundary.dayIndex;
      // Note: we don't increment day here directly from index, we track it by what the event says.
      // Wait, applyDayBoundaryTransition sets the context.dayOfWeek.
    }

    if (currentState.repairGeneration >= options.maxRepairCycles) {
      terminationReason = "max_repairs_reached";
      break;
    }

    // Determine completion across all chunks (active + deferred). 
    // In multi-day, all chunks complete means there are no deferred or unscheduled chunks either.
    if (
      allChunksCompleted(currentState, allScheduledChunkIds) && 
      currentState.deferredChunkIds.size === 0 &&
      currentState.schedule.unscheduledTaskIds.length === 0
    ) {
      terminationReason = "all_chunks_complete";
      break;
    }
  }

  if (terminationReason === null) {
    terminationReason = "event_sequence_exhausted";
  }

  // Ensure the final state is captured if it hasn't crossed a day boundary
  if (!terminalDayStates.has(currentDayIndex)) {
    terminalDayStates.set(currentDayIndex, currentState);
  }

  return {
    initialDayState: initialState,
    terminalDayStates,
    events: sortedEvents,
    totalRepairCycles: currentState.repairGeneration,
    terminationReason
  };
}

function allChunksCompleted(
  state: PlannerSimulationState,
  allScheduledChunkIds: ReadonlySet<string>
): boolean {
  for (const id of allScheduledChunkIds) {
    if (!state.completedChunkIds.has(id)) return false;
  }
  return allScheduledChunkIds.size > 0;
}
