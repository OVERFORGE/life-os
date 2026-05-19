// ─────────────────────────────────────────────────────────────────────────────
// replayTrace
//
// Deterministic generator-based step-through replay of an ExecutionTrace.
//
// PURPOSE:
//   Enables event-by-event inspection of topology evolution without
//   materializing all intermediate states simultaneously.
//   Operates purely from (initialState + events) — no external state needed.
//
// REPLAY INTEGRITY (Kernel Invariant 7):
//   The terminal state produced by replayTrace MUST have a topology hash
//   byte-identical to the original simulation's terminal state.
//   If this invariant fails, the simulation is not deterministic.
//
// SAME-TICK ORDERING (Kernel Invariant 6):
//   Before replaying any events, this function MUST normalize same-tick ordering
//   via sortPlannerEvents(). The events stored in ExecutionTrace are already
//   sorted (simulateExecutionDay normalizes on entry), but this is re-applied
//   defensively to prevent divergence if traces are reconstructed externally.
//
// GENERATOR SEMANTICS:
//   Yields one ReplayStep per event. Memory usage = O(1) intermediate states
//   at any given time (generator holds only current + next state).
//   This is intentional: materializing all steps into an array would produce
//   O(events) state objects, defeating the purpose for long traces.
//
// COMPACT TRACE SUPPORT:
//   CompactExecutionTrace stores only repair-boundary snapshots.
//   For events between repair boundaries, intermediate states are reconstructed
//   on-demand via applyPlannerEvent. This respects the memory model.
// ─────────────────────────────────────────────────────────────────────────────

import { ExecutionTrace, CompactExecutionTrace, PlannerSimulationState } from "../types/SimulationTypes";
import { PlannerEvent, sortPlannerEvents } from "../types/PlannerEventTypes";
import { applyPlannerEvent } from "../simulation/applyPlannerEvent";
import { projectTopology } from "./projectTopology";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReplayStep {
  /** Zero-indexed position of this event in the normalized event sequence */
  stepIndex: number;
  /** The event that was applied to produce stateAfter */
  event: PlannerEvent;
  /** State before this event was applied */
  stateBefore: PlannerSimulationState;
  /** State after this event was applied */
  stateAfter: PlannerSimulationState;
  /**
   * True iff the schedule topology changed as a result of this event.
   * Computed by comparing projectTopology(before).topologyHash vs projectTopology(after).topologyHash.
   * Only true when repair triggers a schedule mutation — not for state-only updates.
   */
  topologyChanged: boolean;
  /** True iff this event triggered a repair cycle (repairGeneration incremented) */
  repairTriggered: boolean;
  /**
   * True iff the constraintMemory state changed as a result of this event.
   * Detected by checking evolutionTick difference (cheaper than deep equality).
   */
  memoryChanged: boolean;
}

// ─── Full Trace Replay ────────────────────────────────────────────────────────

/**
 * Generator that yields one ReplayStep per event in the trace.
 *
 * Enforces same-tick ordering normalization before replay begins (Invariant 6).
 * The terminal stateAfter topology hash must equal the original simulation's
 * terminal hash (Invariant 7) — this is testable by the caller.
 *
 * @param trace - A full ExecutionTrace from simulateExecutionDay
 */
export function* replayTrace(trace: { events: readonly PlannerEvent[], initialState?: PlannerSimulationState, initialDayState?: PlannerSimulationState }): Generator<ReplayStep> {
  // Normalize ordering — defensive re-sort even if trace already sorted
  const events = sortPlannerEvents([...trace.events]);

  let currentState = trace.initialState || trace.initialDayState;
  if (!currentState) {
    throw new Error("Replay trace must provide either initialState or initialDayState");
  }

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const stateBefore = currentState;
    const hashBefore = projectTopology(stateBefore).topologyHash;

    const stateAfter = applyPlannerEvent(currentState, event);
    const hashAfter = projectTopology(stateAfter).topologyHash;

    yield {
      stepIndex: i,
      event,
      stateBefore,
      stateAfter,
      topologyChanged: hashBefore !== hashAfter,
      repairTriggered: stateAfter.repairGeneration > stateBefore.repairGeneration,
      memoryChanged: (stateAfter.constraintMemory?.evolutionTick ?? 0) !== (stateBefore.constraintMemory?.evolutionTick ?? 0),
    };

    currentState = stateAfter;
  }
}

// ─── Compact Trace Replay ─────────────────────────────────────────────────────

/**
 * Generator that yields one ReplayStep per event from a CompactExecutionTrace.
 *
 * Intermediate states between repair boundaries are reconstructed on-demand
 * via applyPlannerEvent — they are never stored simultaneously.
 *
 * Memory: O(1) intermediate states at any time (generator pattern).
 *
 * @param trace - A CompactExecutionTrace
 */
export function* replayCompactTrace(trace: CompactExecutionTrace): Generator<ReplayStep> {
  const events = sortPlannerEvents([...trace.events]);
  let currentState = trace.initialState;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const stateBefore = currentState;
    const hashBefore = projectTopology(stateBefore).topologyHash;

    const stateAfter = applyPlannerEvent(currentState, event);
    const hashAfter = projectTopology(stateAfter).topologyHash;

    yield {
      stepIndex: i,
      event,
      stateBefore,
      stateAfter,
      topologyChanged: hashBefore !== hashAfter,
      repairTriggered: stateAfter.repairGeneration > stateBefore.repairGeneration,
      memoryChanged: (stateAfter.constraintMemory?.evolutionTick ?? 0) !== (stateBefore.constraintMemory?.evolutionTick ?? 0),
    };

    currentState = stateAfter;
  }
}

// ─── Convenience: Collect All Steps ──────────────────────────────────────────

/**
 * Materializes all replay steps into an array.
 * Use only for short traces or debugging — O(events) memory usage.
 * For long traces, consume the generator directly.
 */
export function collectReplaySteps(trace: ExecutionTrace): ReplayStep[] {
  return [...replayTrace(trace)];
}
