// ─────────────────────────────────────────────────────────────────────────────
// explainDisplacement
//
// Causal explanation layer: WHY was chunk X displaced?
//
// ANSWERS:
//   - How many times did this chunk move across the simulation?
//   - What was the ordered history of its position changes?
//   - What was the DIRECT event that caused each movement?
//   - What INDIRECT propagation events cascaded to cause later movements?
//   - Where did the chunk end up (or was it deferred out entirely)?
//
// DIRECT vs INDIRECT CAUSALITY:
//   directTriggerEvent  — The event that directly triggered the repair
//                         cycle in which the chunk first moved.
//   indirectPropagation — Events in earlier ticks that shifted downstream
//                         context and caused later cascaded displacements.
//   This distinction is critical for debugging repair explosions where a
//   single upstream event causes a chain of downstream chunk bounces.
//
// DESIGN:
//   Reconstructed purely from ExecutionTrace replay steps + topology diffs.
//   No external state required. "Explainable temporal causality" in practice.
// ─────────────────────────────────────────────────────────────────────────────

import { ExecutionTrace } from "../types/SimulationTypes";
import { PlannerEvent } from "../types/PlannerEventTypes";
import { ChunkMovement, diffTopologies } from "./diffTopologies";
import { collectReplaySteps } from "./replayTrace";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DisplacementExplanation {
  chunkId: string;
  /** Total number of times this chunk was repositioned during the simulation */
  displacementCount: number;
  /** Ordered history of position changes, one per repair cycle in which the chunk moved */
  movements: ChunkMovement[];
  /**
   * The event that directly triggered the repair cycle where the chunk first moved.
   * undefined if the chunk was never displaced.
   */
  directTriggerEvent?: PlannerEvent;
  /**
   * Events that occurred before the direct trigger but contributed to the
   * causal context that led to displacement (e.g., earlier overruns that
   * compressed downstream slots, making repair unavoidable).
   * Empty if displacement was caused by a single direct event.
   */
  indirectPropagationEvents: PlannerEvent[];
  /**
   * Final position of the chunk in the terminal state.
   * null if the chunk was deferred out of the schedule entirely.
   */
  finalPosition: { startMinute: number; endMinute: number } | null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Explains the full displacement history of a specific chunk.
 *
 * @param trace    - Full ExecutionTrace from simulateExecutionDay
 * @param chunkId  - ID of the chunk to explain
 * @returns        - DisplacementExplanation with direct + indirect causality
 */
export function explainDisplacement(
  trace: ExecutionTrace,
  chunkId: string
): DisplacementExplanation {
  const steps = collectReplaySteps(trace);

  const movements: ChunkMovement[] = [];
  let directTriggerEvent: PlannerEvent | undefined;
  const indirectPropagationEvents: PlannerEvent[] = [];

  // Track events that modified context before the first displacement
  const preDisplacementEvents: PlannerEvent[] = [];
  let firstDisplacementFound = false;

  for (const step of steps) {
    if (!step.repairTriggered) {
      // Non-repair events may be indirect contributors if chunk hasn't moved yet
      if (!firstDisplacementFound) {
        preDisplacementEvents.push(step.event);
      }
      continue;
    }

    // This step triggered a repair — check if the target chunk moved
    const diff = diffTopologies(step.stateBefore, step.stateAfter);
    const movement = diff.movedChunks.find(m => m.chunkId === chunkId);

    if (movement) {
      movements.push(movement);

      if (!firstDisplacementFound) {
        firstDisplacementFound = true;
        directTriggerEvent = step.event;

        // All repair-triggering events before this one that touched related chunks
        // are indirect contributors
        for (const prev of preDisplacementEvents) {
          if (isContextualContributor(prev, chunkId)) {
            indirectPropagationEvents.push(prev);
          }
        }
      }
    } else if (!firstDisplacementFound) {
      // A repair happened but didn't move our chunk — still potentially indirect
      preDisplacementEvents.push(step.event);
    }
  }

  // Find final position from terminal state
  const terminalState = steps.length > 0
    ? steps[steps.length - 1].stateAfter
    : trace.initialState;

  const finalPlacement = terminalState.schedule.scheduledPlacements
    .find(sp => sp.task.id === chunkId);

  const finalPosition = finalPlacement
    ? {
        startMinute: finalPlacement.placement.temporalWindow.startMinute,
        endMinute: finalPlacement.placement.temporalWindow.endMinute,
      }
    : null;

  return {
    chunkId,
    displacementCount: movements.length,
    movements,
    directTriggerEvent,
    indirectPropagationEvents,
    finalPosition,
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Determines if an event is a contextual contributor to a future displacement.
 * A contextual contributor is any repair-triggering or deadline-modifying event
 * that is not the direct trigger — these shift the constraint space and can
 * make downstream displacement inevitable.
 */
function isContextualContributor(event: PlannerEvent, _targetChunkId: string): boolean {
  return (
    event.type === "chunk_overran" ||
    event.type === "chunk_interrupted" ||
    event.type === "deadline_modified" ||
    event.type === "repair_triggered"
  );
}
