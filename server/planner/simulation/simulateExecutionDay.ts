// ─────────────────────────────────────────────────────────────────────────────
// simulateExecutionDay
//
// The canonical deterministic execution harness for the planner kernel.
//
// THIS IS NOT A TEST UTILITY.
// This is the primary correctness driver for the planner substrate.
// All future planner correctness claims should be validated through
// simulation traces, not isolated unit tests.
//
// DETERMINISM GUARANTEE:
//   simulateExecutionDay(schedule, units, context, events, options)
//   always produces byte-identical ExecutionTrace for identical inputs.
//   No wall-clock, no randomness, no external state.
//
// EVENT ORDERING:
//   Events are sorted into canonical order (tick ASC, same-tick by
//   PLANNER_EVENT_SAME_TICK_PRECEDENCE) before application.
//   The caller does not need to pre-sort the events array.
//
// TERMINATION:
//   Simulation terminates when one of the following occurs:
//   - All scheduled chunk IDs are in completedChunkIds ("all_chunks_complete")
//   - repairGeneration reaches options.maxRepairCycles ("max_repairs_reached")
//   - generateIncrementalRepairPlan returns an unresolvable result ("unresolvable_conflict")
//   - The events array is exhausted ("event_sequence_exhausted")
// ─────────────────────────────────────────────────────────────────────────────

import { CandidateSchedule } from "../types/ScheduleGraphTypes";
import { SchedulableUnit, PlacementAnalysisContext } from "../types/SchedulingTypes";
import {
  PlannerEvent,
  sortPlannerEvents,
} from "../types/PlannerEventTypes";
import {
  PlannerSimulationState,
  ExecutionTrace,
  SimulationOptions,
} from "../types/SimulationTypes";
import { applyPlannerEvent } from "./applyPlannerEvent";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Runs a deterministic execution simulation of a single planning day.
 *
 * @param initialSchedule  - The starting CandidateSchedule before any events
 * @param units            - All schedulable units visible to the simulation
 * @param context          - The placement analysis context for this day
 * @param events           - The sequence of events to apply (order is normalized internally)
 * @param options          - Simulation bounds (maxRepairCycles)
 * @returns ExecutionTrace - Full replay-capable trace of the simulation
 */
export function simulateExecutionDay(
  initialSchedule: CandidateSchedule,
  units: SchedulableUnit[],
  context: PlacementAnalysisContext,
  events: PlannerEvent[],
  options: SimulationOptions
): ExecutionTrace {
  // Establish initial state
  const allScheduledChunkIds = new Set(
    initialSchedule.scheduledPlacements.map(sp => sp.task.id)
  );

  const initialState: PlannerSimulationState = {
    schedule: initialSchedule,
    units,
    context,
    activeChunkIds: new Set(),
    completedChunkIds: new Set(),
    deferredChunkIds: new Set(),
    repairGeneration: 0,
    logicalTick: 0,
    eventLog: [],
  };

  // Canonically sort all events before application
  // This is the single normalization point — callers need not pre-sort
  const sortedEvents = sortPlannerEvents(events);

  const snapshots: PlannerSimulationState[] = [];
  let currentState = initialState;
  let terminationReason: ExecutionTrace["terminationReason"] | null = null;

  for (const event of sortedEvents) {
    // Apply the event as a pure state transition
    let nextState: PlannerSimulationState;
    try {
      nextState = applyPlannerEvent(currentState, event);
    } catch {
      // applyPlannerEvent threw — this indicates an unresolvable conflict
      // (e.g., repair could not produce any valid schedule)
      terminationReason = "unresolvable_conflict";
      snapshots.push(currentState); // snapshot the pre-failure state
      break;
    }

    snapshots.push(nextState);
    currentState = nextState;

    // ── Termination checks ────────────────────────────────────────────────

    // 1. All chunks completed
    if (allChunksCompleted(currentState, allScheduledChunkIds)) {
      terminationReason = "all_chunks_complete";
      break;
    }

    // 2. Repair cycle limit reached
    if (currentState.repairGeneration >= options.maxRepairCycles) {
      terminationReason = "max_repairs_reached";
      break;
    }
  }

  // If we exhausted all events without hitting another termination condition
  if (terminationReason === null) {
    terminationReason = "event_sequence_exhausted";
  }

  return {
    initialState,
    events: sortedEvents,
    snapshots,
    terminationReason,
    totalRepairCycles: currentState.repairGeneration,
  };
}

// ─── Terminal State Check ─────────────────────────────────────────────────────

/**
 * Returns true iff all originally scheduled chunk IDs are in completedChunkIds.
 * Deferred chunks do NOT count as complete — they remain outstanding.
 */
function allChunksCompleted(
  state: PlannerSimulationState,
  allScheduledChunkIds: ReadonlySet<string>
): boolean {
  for (const id of allScheduledChunkIds) {
    if (!state.completedChunkIds.has(id)) return false;
  }
  return allScheduledChunkIds.size > 0;
}
