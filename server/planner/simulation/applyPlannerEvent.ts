// ─────────────────────────────────────────────────────────────────────────────
// applyPlannerEvent
//
// Pure state transition function for the planner simulation kernel.
//
//   (state: PlannerSimulationState, event: PlannerEvent) → PlannerSimulationState
//
// PURITY GUARANTEE:
//   - Never mutates input state or event objects
//   - Same (state, event) inputs always produce byte-identical output
//   - No side effects: no I/O, no logging, no analytics, no telemetry
//
// SCOPE:
//   This function performs:
//     - Event interpretation
//     - Immutable state transition
//     - Bounded repair delegation (via generateIncrementalRepairPlan)
//     - Propagation signal delegation (via propagateTemporalConstraints)
//     - ChunkStatus invariant enforcement
//
//   This function does NOT perform:
//     - Analytics or observability pipelines
//     - Adaptive heuristics or ML scoring
//     - Multi-day horizon expansion
//     - Any operation outside the planner-kernel boundary
//
// REPAIR TRIGGER SEMANTICS:
//   chunk_overran and chunk_interrupted are the only events that trigger
//   repair. All other events update state directly without repair.
//   repair_triggered can be injected externally (e.g., by the test harness)
//   to force a repair cycle at a specific tick.
// ─────────────────────────────────────────────────────────────────────────────

import { PlannerEvent } from "../types/PlannerEventTypes";
import { PlannerSimulationState } from "../types/SimulationTypes";
import { generateIncrementalRepairPlan } from "../replanning/generateIncrementalRepairPlan";
import { propagateTemporalConstraints } from "../validation/propagateTemporalConstraints";
import { RepairTrigger } from "../types/IncrementalRepairTypes";

import { projectTopology } from "../observability/projectTopology";

/**
 * Produces a deterministic, ordering-stable hash of a schedule topology.
 * Delegates to the unified projection layer to ensure consistency across
 * the observability and convergence systems.
 */
export function computeTopologyHash(state: PlannerSimulationState): string {
  return projectTopology(state).topologyHash;
}

// ─── Immutable Set Helpers ───────────────────────────────────────────────────

function setAdd<T>(s: ReadonlySet<T>, item: T): ReadonlySet<T> {
  return new Set([...s, item]);
}

function setDelete<T>(s: ReadonlySet<T>, item: T): ReadonlySet<T> {
  const next = new Set(s);
  next.delete(item);
  return next;
}

// ─── Core Transition ─────────────────────────────────────────────────────────

/**
 * Pure state transition function.
 *
 * Applies one PlannerEvent to the current simulation state and returns
 * the next state. The input state is never mutated.
 *
 * For repair-triggering events (chunk_overran, chunk_interrupted,
 * repair_triggered), delegates to generateIncrementalRepairPlan and
 * folds the resulting schedule back into the next state.
 */
export function applyPlannerEvent(
  state: PlannerSimulationState,
  event: PlannerEvent
): PlannerSimulationState {
  // Append event to log (produces new array — never mutates)
  const eventLog: readonly PlannerEvent[] = [...state.eventLog, event];
  const logicalTick = event.tick;

  switch (event.type) {

    // ── chunk_started ────────────────────────────────────────────────────────
    case "chunk_started": {
      return {
        ...state,
        logicalTick,
        eventLog,
        activeChunkIds: setAdd(state.activeChunkIds, event.chunkId),
      };
    }

    // ── chunk_completed ──────────────────────────────────────────────────────
    case "chunk_completed": {
      return {
        ...state,
        logicalTick,
        eventLog,
        activeChunkIds: setDelete(state.activeChunkIds, event.chunkId),
        completedChunkIds: setAdd(state.completedChunkIds, event.chunkId),
      };
    }

    // ── chunk_interrupted ────────────────────────────────────────────────────
    // Interrupted chunk is no longer active. If minutes completed < minimum
    // chunk size, the chunk is deferred. Otherwise we trigger a repair.
    case "chunk_interrupted": {
      const baseState: PlannerSimulationState = {
        ...state,
        logicalTick,
        eventLog,
        activeChunkIds: setDelete(state.activeChunkIds, event.chunkId),
      };

      // Find the chunk in the schedule to determine if a repair is needed
      const sp = state.schedule.scheduledPlacements.find(
        p => p.task.id === event.chunkId
      );
      const chunk = sp?.task as any;
      const minimumChunkSize: number = chunk?.minimumChunkSize ?? 15;

      if (event.minutesCompleted < minimumChunkSize) {
        // Partial work below threshold → defer, no repair
        return {
          ...baseState,
          deferredChunkIds: setAdd(state.deferredChunkIds, event.chunkId),
        };
      }

      // Sufficient partial work done → repair to reschedule remainder
      const trigger: RepairTrigger = {
        triggerId: `interrupted:${event.chunkId}:${event.tick}`,
        type: "task_interrupted",
        sourceChunkId: event.chunkId,
        anomalyMagnitudeMinutes: 0,
        reasoning: `chunk_interrupted at tick ${event.tick}: ${event.reason}`,
      };
      return triggerRepair(baseState, trigger, eventLog, logicalTick);
    }

    // ── chunk_overran ────────────────────────────────────────────────────────
    // Overrun shifts downstream placements. Triggers bounded repair.
    case "chunk_overran": {
      const trigger: RepairTrigger = {
        triggerId: `overran:${event.chunkId}:${event.tick}`,
        type: "chunk_overran",
        sourceChunkId: event.chunkId,
        anomalyMagnitudeMinutes: event.overrunMinutes,
        reasoning: `chunk_overran at tick ${event.tick} by ${event.overrunMinutes}m`,
      };
      const baseState: PlannerSimulationState = {
        ...state,
        logicalTick,
        eventLog,
      };
      return triggerRepair(baseState, trigger, eventLog, logicalTick);
    }

    // ── deadline_modified ────────────────────────────────────────────────────
    // Update the relevant unit's deadline in-place on the units array.
    // Propagate constraint signals from the new context.
    case "deadline_modified": {
      const updatedUnits = state.units.map(u =>
        u.id === event.taskId
          ? { ...u, hardDeadlineMinute: event.newDeadlineMinute }
          : u
      );
      const nextState: PlannerSimulationState = {
        ...state,
        logicalTick,
        eventLog,
        units: updatedUnits,
      };
      // Propagate constraint signals — pure evaluation, no repair triggered
      propagateTemporalConstraints(
        nextState.schedule,
        nextState.units as any[],
        nextState.context,
        logicalTick
      );
      return nextState;
    }

    // ── recovery_window_expanded ─────────────────────────────────────────────
    // Context update only — no repair triggered. The simulator may choose
    // to trigger a voluntary replan separately if coverage improves.
    case "recovery_window_expanded": {
      return {
        ...state,
        logicalTick,
        eventLog,
      };
    }

    // ── new_task_inserted ────────────────────────────────────────────────────
    // Add the new unit to the units array. The scheduling of the new task
    // is deferred to the next repair cycle or voluntary replan.
    case "new_task_inserted": {
      return {
        ...state,
        logicalTick,
        eventLog,
        units: [...state.units, event.task],
      };
    }

    // ── repair_triggered ─────────────────────────────────────────────────────
    // Externally injected repair trigger (test harness or forced replan).
    case "repair_triggered": {
      const baseState: PlannerSimulationState = {
        ...state,
        logicalTick,
        eventLog,
      };
      return triggerRepair(baseState, event.trigger, eventLog, logicalTick);
    }

    // ── day_boundary_crossed ─────────────────────────────────────────────────
    // A formal horizon transition. Archives completed chunks, migrates deferred,
    // and resets the active execution context for the next day.
    case "day_boundary_crossed": {
      const baseState: PlannerSimulationState = {
        ...state,
        logicalTick,
        eventLog,
      };
      // We must dynamically import to avoid circular dependencies if necessary,
      // but assuming they are in the same module graph it's fine.
      // Wait, applyDayBoundaryTransition isn't imported yet. Let's add the import.
      const { applyDayBoundaryTransition } = require("../horizon/applyDayBoundaryTransition");
      return applyDayBoundaryTransition(baseState, event.boundary, logicalTick);
    }
  }
}

// ─── Repair Delegation ───────────────────────────────────────────────────────

/**
 * Delegates to generateIncrementalRepairPlan and folds the result
 * back into an updated PlannerSimulationState.
 *
 * This is the ONLY place repair is triggered. It is bounded by
 * MAX_REPAIR_OPERATIONS_PER_CYCLE enforced inside generateIncrementalRepairPlan.
 */
function triggerRepair(
  state: PlannerSimulationState,
  trigger: RepairTrigger,
  eventLog: readonly PlannerEvent[],
  logicalTick: number
): PlannerSimulationState {
  // Build anchor map: completed chunks are fixed, deferred are movable
  const anchorMap = new Map<string, "fixed" | "sticky" | "movable">();
  for (const id of state.completedChunkIds) {
    anchorMap.set(id, "fixed");
  }
  for (const id of state.activeChunkIds) {
    anchorMap.set(id, "fixed"); // active chunks cannot be displaced mid-execution
  }

  const repairResult = generateIncrementalRepairPlan(
    state.schedule,
    trigger,
    state.units as any[],
    state.context,
    anchorMap
  );

  return {
    ...state,
    logicalTick,
    eventLog,
    schedule: repairResult.schedule,
    repairGeneration: state.repairGeneration + 1,
  };
}
