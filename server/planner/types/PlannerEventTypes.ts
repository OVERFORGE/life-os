// ─────────────────────────────────────────────────────────────────────────────
// PLANNER EVENT MODEL
//
// PlannerEvent is the canonical discriminated union representing all
// kernel-visible state transitions within the orchestration substrate.
// Events are the ONLY legal mechanism by which PlannerSimulationState may
// change. No hidden mutation. No side effects.
//
// KERNEL SCOPE:
//   Events represent kernel-relevant state transitions ONLY.
//   DO NOT add: UI events, analytics events, preference events,
//   or generic domain events. Event proliferation destroys replay semantics.
//
// SAME-TICK ORDERING INVARIANT:
//   When multiple events share the same tick value, application order is
//   strictly determined by PLANNER_EVENT_SAME_TICK_PRECEDENCE below.
//
//   Ordered rationale (must be preserved):
//     1. chunk_completed         — finalizations settle first
//     2. chunk_interrupted       — partial finalization before overrun analysis
//     3. chunk_overran           — overrun assessed after completions clear
//     4. deadline_modified       — context updates before repair evaluation
//     5. recovery_window_expanded — context updates before repair evaluation
//     6. new_task_inserted       — topology expanded before repair evaluated
//     7. repair_triggered        — applied last; sees fully settled context
//
//   Violation of this ordering causes replay divergence and oscillation
//   false-positives. It is an explicit kernel invariant.
//
// TICK SEMANTICS:
//   tick is a logical clock (planner-internal monotonic counter).
//   tick is NEVER a wall-clock timestamp, epoch millisecond, or Date.
//   replay determinism depends on tick stability.
// ─────────────────────────────────────────────────────────────────────────────

import { SchedulableUnit } from "./SchedulingTypes";
import { RepairTrigger } from "./IncrementalRepairTypes";
import { DayBoundary } from "./HorizonTypes";

// ─── Event Type Enum ─────────────────────────────────────────────────────────

export type PlannerEventType =
  | "chunk_started"
  | "chunk_completed"
  | "chunk_interrupted"
  | "chunk_overran"
  | "deadline_modified"
  | "recovery_window_expanded"
  | "new_task_inserted"
  | "day_boundary_crossed"
  | "repair_triggered";

/**
 * Canonical same-tick ordering precedence.
 * Index = priority (lower index = applied first within the same tick).
 *
 * This ordering is an INVARIANT. Changing it breaks replay determinism.
 * Any new event type must be explicitly positioned within this list.
 */
export const PLANNER_EVENT_SAME_TICK_PRECEDENCE: readonly PlannerEventType[] = [
  "chunk_completed",
  "chunk_interrupted",
  "chunk_overran",
  "deadline_modified",
  "recovery_window_expanded",
  "new_task_inserted",
  "day_boundary_crossed",
  "repair_triggered",
] as const;

/**
 * Returns the canonical ordering index for a given event type.
 * Lower index = applied first within the same tick.
 * Events not in the precedence list are given lowest priority (appended last).
 */
export function getPlannerEventPrecedence(type: PlannerEventType): number {
  const idx = PLANNER_EVENT_SAME_TICK_PRECEDENCE.indexOf(type);
  return idx === -1 ? PLANNER_EVENT_SAME_TICK_PRECEDENCE.length : idx;
}

/**
 * Sort a batch of events into canonical application order.
 * Primary key: tick (ascending). Secondary key: same-tick precedence.
 * Produces a stable, deterministic ordering — same output for same input.
 */
export function sortPlannerEvents(events: readonly PlannerEvent[]): PlannerEvent[] {
  return [...events].sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    return getPlannerEventPrecedence(a.type) - getPlannerEventPrecedence(b.type);
  });
}

// ─── Event Union ─────────────────────────────────────────────────────────────

export type PlannerEvent =
  | {
    type: "chunk_started";
    chunkId: string;
    tick: number;
  }
  | {
    type: "chunk_completed";
    chunkId: string;
    /**
     * Actual time taken.
     * Informational only in Phase 4 — future phases use this to update
     * underestimation bias in topology optimization.
     */
    actualDurationMinutes: number;
    tick: number;
  }
  | {
    type: "chunk_interrupted";
    chunkId: string;
    /** Minutes elapsed before interruption occurred */
    minutesCompleted: number;
    /**
     * Human-readable reason string.
     * Stored in trace for replay/debug; NOT used in planner logic.
     */
    reason: string;
    tick: number;
  }
  | {
    type: "chunk_overran";
    chunkId: string;
    /** Additional minutes consumed beyond the estimated chunk duration */
    overrunMinutes: number;
    tick: number;
  }
  | {
    type: "deadline_modified";
    taskId: string;
    /**
     * New planner-relative deadline.
     * Unit: minutes from day start (same semantics as hardDeadlineMinute).
     * Must NOT be a wall-clock timestamp.
     */
    newDeadlineMinute: number;
    tick: number;
  }
  | {
    type: "recovery_window_expanded";
    /** Identifier of the recovery window being expanded */
    windowId: string;
    extensionMinutes: number;
    tick: number;
  }
  | {
    type: "new_task_inserted";
    /**
     * Task to insert. Must conform to SchedulableUnit — fully normalized,
     * planner-relative. Wall-clock fields must have been resolved before
     * this event is created (normalization boundary enforced upstream).
     */
    task: SchedulableUnit;
    tick: number;
  }
  | {
    type: "repair_triggered";
    trigger: RepairTrigger;
    tick: number;
  }
  | {
    type: "day_boundary_crossed";
    boundary: DayBoundary;
    tick: number;
  };
