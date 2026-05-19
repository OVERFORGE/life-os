import { CandidateSchedule } from "../types/ScheduleGraphTypes";
import { SchedulableUnit, PlacementAnalysisContext } from "../types/SchedulingTypes";
import { PlannerEvent, PlannerEventType, sortPlannerEvents, getPlannerEventPrecedence } from "../types/PlannerEventTypes";
import { SimulationOptions, PlannerSimulationState } from "../types/SimulationTypes";
import { DayBoundary } from "../types/HorizonTypes";
import { applyPlannerEvent } from "./applyPlannerEvent";
import { calculateGovernanceMetrics } from "../governance/calculateGovernanceMetrics";
import { evolveHeuristicState } from "../heuristics/evolveHeuristicState";
import { INITIAL_HEURISTIC_STATE } from "../heuristics/HeuristicTypes";
import { INITIAL_CONSTRAINT_MEMORY } from "../heuristics/ConstraintMemoryTypes";
import { evolveConstraintMemory, extractMemorySignals } from "../heuristics/evolveConstraintMemory";
import { hashConstraintMemoryDelta } from "../heuristics/hashConstraintMemoryDelta";

export interface HorizonExecutionTrace {
  initialDayState: PlannerSimulationState;
  
  /** The state exactly at the boundary crossing, keyed by dayIndex */
  terminalDayStates: Map<number, PlannerSimulationState>;
  
  events: readonly PlannerEvent[];
  totalRepairCycles: number;
  terminationReason: "all_chunks_complete" | "max_repairs_reached" | "event_sequence_exhausted" | "unresolvable_conflict" | "horizon_exhausted";
  maxCrossDayPropagations?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADR-001 INV-6: Causal Cycle Guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enforces the no-causal-cycles invariant at every event injection boundary.
 *
 * No event may inject another event with lower or equal causal precedence
 * within the same logical tick. Violation would allow injected events to
 * observe state produced by their causal dependents, breaking replay ordering.
 *
 * Safe if: injected event is in a future tick, OR has strictly higher precedence.
 * Throws: if injected event violates the invariant (developer error, not user error).
 */
function assertCausallyDownstream(
  injectorType: PlannerEventType,
  injectedType: PlannerEventType,
  injectedTick: number,
  currentTick: number
): void {
  if (injectedTick > currentTick) return; // future tick — always safe
  const injectorPrec = getPlannerEventPrecedence(injectorType);
  const injectedPrec = getPlannerEventPrecedence(injectedType);
  if (injectedPrec > injectorPrec) return; // strictly higher precedence — safe
  throw new Error(
    `[INV-6 VIOLATION] Causal cycle detected: ` +
    `'${injectorType}' (prec ${injectorPrec}) at tick ${currentTick} ` +
    `attempted to inject '${injectedType}' (prec ${injectedPrec}) at tick ${injectedTick}. ` +
    `Injected events must have strictly higher same-tick precedence than their injector.`
  );
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
    heuristicState: INITIAL_HEURISTIC_STATE,
    constraintMemory: INITIAL_CONSTRAINT_MEMORY,
  };

  const eventQueue = sortPlannerEvents(events);
  const terminalDayStates = new Map<number, PlannerSimulationState>();
  
  let currentState = initialState;
  let terminationReason: HorizonExecutionTrace["terminationReason"] | null = null;
  let currentDayIndex = boundaries[0]?.dayIndex ?? 0;
  
  // Track events that were actually applied
  const appliedEvents: PlannerEvent[] = [];

  while (eventQueue.length > 0) {
    const event = eventQueue.shift()!;
    let nextState: PlannerSimulationState;
    try {
      nextState = applyPlannerEvent(currentState, event);
    } catch {
      terminationReason = "unresolvable_conflict";
      break;
    }

    currentState = nextState;
    appliedEvents.push(event);

    if (event.type === "day_boundary_crossed") {
      terminalDayStates.set(currentDayIndex, currentState);
      currentDayIndex = event.boundary.dayIndex;
      
      // Phase 7A: Evolve heuristics based on governance metrics evaluated at this day boundary
      const partialTrace: HorizonExecutionTrace = {
        initialDayState: initialState,
        terminalDayStates,
        events: appliedEvents,
        totalRepairCycles: currentState.repairGeneration,
        terminationReason: "event_sequence_exhausted"
      };
      
      const activeBoundaries = boundaries.filter(b => terminalDayStates.has(b.dayIndex) || b.dayIndex === currentDayIndex);
      const metrics = calculateGovernanceMetrics(partialTrace, {} as any, activeBoundaries);
      const nextHeuristicState = evolveHeuristicState(currentState.heuristicState, metrics);
      
      if (
        nextHeuristicState.profile !== currentState.heuristicState.profile || 
        nextHeuristicState.downstreamPressureMultiplier !== currentState.heuristicState.downstreamPressureMultiplier ||
        nextHeuristicState.repairAggressivenessMultiplier !== currentState.heuristicState.repairAggressivenessMultiplier ||
        nextHeuristicState.deferralPreferenceMultiplier !== currentState.heuristicState.deferralPreferenceMultiplier ||
        nextHeuristicState.stabilizationWeight !== currentState.heuristicState.stabilizationWeight
      ) {
        // INV-6: verify causal ordering before injection
        assertCausallyDownstream(
          "day_boundary_crossed", "heuristic_state_updated",
          currentState.logicalTick, currentState.logicalTick
        );
        eventQueue.push({
          type: "heuristic_state_updated",
          tick: currentState.logicalTick,
          previousProfile: currentState.heuristicState.profile,
          nextProfile: nextHeuristicState.profile,
          heuristicState: nextHeuristicState,
          triggeringTrajectory: metrics.trajectory || "stabilizing"
        });
      }

      // Phase 7B: Evolve constraint memory downstream of heuristic adaptation
      // Extract signals from the day's deferred/oscillating/converged chunks
      const dayRepairEvents = appliedEvents.filter(e => e.type === "repair_triggered");
      // Derive oscillating chunks from repair events that fired multiple times on same chunks
      const repairChunkCounts = new Map<string, number>();
      for (const re of dayRepairEvents) {
        if (re.type === "repair_triggered" && re.trigger?.sourceChunkId) {
          const cid = re.trigger.sourceChunkId;
          repairChunkCounts.set(cid, (repairChunkCounts.get(cid) ?? 0) + 1);
        }
      }
      const oscillatingFromRepairs = [...repairChunkCounts.entries()]
        .filter(([, count]) => count >= 2)
        .map(([id]) => id);

      const memorySignals = extractMemorySignals(
        currentState.deferredChunkIds,
        oscillatingFromRepairs,
        currentState.schedule.unscheduledTaskIds,   // displaced = unscheduled after repair
        currentState.schedule.unscheduledTaskIds,   // non-converged = still unscheduled
        currentState.schedule.scheduledPlacements.map(p => p.task.id), // converged
        currentState.units,
        new Map<string, number>(),  // propagationDepths — Phase 7C will wire this from repair plan
        currentState.logicalTick
      );

      const nextMemory = evolveConstraintMemory(
        currentState.constraintMemory,
        memorySignals,
        metrics,
        currentState.heuristicState
      );

      const delta = hashConstraintMemoryDelta(currentState.constraintMemory, nextMemory);
      if (delta.affectedChunkIds.length > 0 || delta.affectedRegionIds.length > 0) {
        // INV-6: verify causal ordering before injection
        assertCausallyDownstream(
          "day_boundary_crossed", "constraint_memory_updated",
          currentState.logicalTick, currentState.logicalTick
        );
        eventQueue.push({
          type: "constraint_memory_updated",
          tick: currentState.logicalTick,
          affectedChunkIds: delta.affectedChunkIds as string[],
          affectedRegionIds: delta.affectedRegionIds as string[],
          memoryDeltaHash: delta.memoryDeltaHash,
          nextMemoryState: nextMemory
        });
      }

      // Re-sort queue once to enforce causal same-tick ordering
      eventQueue.sort((a, b) => {
        if (a.tick !== b.tick) return a.tick - b.tick;
        return getPlannerEventPrecedence(a.type) - getPlannerEventPrecedence(b.type);
      });
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
    events: appliedEvents,
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
