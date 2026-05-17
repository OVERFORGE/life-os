import { PlannerSimulationState } from "../types/SimulationTypes";
import { DayBoundary } from "../types/HorizonTypes";
import { carryForwardDeferredChunks } from "./carryForwardDeferredChunks";

/**
 * Pure deterministic transition: (dayState, boundary) -> nextDayState
 * 
 * Responsibilities:
 * - Archive completed chunks
 * - Migrate deferred chunks
 * - Reset active execution sets
 * - Preserve replay continuity (eventLog)
 * - Preserve repairGeneration
 */
export function applyDayBoundaryTransition(
  currentState: PlannerSimulationState,
  nextBoundary: DayBoundary,
  logicalTick: number
): PlannerSimulationState {
  
  // 1. Carry forward deferred chunks
  const carryResult = carryForwardDeferredChunks(
    currentState, 
    currentState.context.dayOfWeek || 0, // fromDayIndex (Assuming context.dayOfWeek maps to this)
    nextBoundary.dayIndex // toDayIndex
  );

  if (carryResult.failureReason) {
    // In a real implementation we might throw or return a failed state.
    // For now we just log it conceptually or pass it to observability.
  }

  // 2. Initialize new context
  const nextContext = {
    ...currentState.context,
    dayOfWeek: nextBoundary.dayIndex,
    // Reset temporal metrics that are day-scoped
    sleepWindow: nextBoundary.sleepWindow
  };

  // 3. Create fresh CandidateSchedule for the new day
  // Placements are empty. The simulation wrapper will need to call 
  // generateCandidateSchedules using nextState.units if it wants to replan.
  // We provide a blank slate.
  const nextSchedule = {
    scheduleId: `day-${nextBoundary.dayIndex}-initial`,
    scheduledPlacements: [],
    unscheduledTaskIds: carryResult.carriedUnits.map(u => u.id),
    conflicts: [],
    scheduleScore: 0,
    stabilityScore: 0,
    focusScore: 0,
    fragmentationScore: 0,
    recoverySafetyScore: 0,
    completionRatio: 0
  };

  // 4. Return new state
  return {
    schedule: nextSchedule,
    units: carryResult.carriedUnits,
    context: nextContext,
    
    // Active chunks are hard-reset across day boundaries
    activeChunkIds: new Set<string>(),
    
    // Completed chunks are archived, so this day starts fresh
    completedChunkIds: new Set<string>(),
    
    // Deferred chunks are reset, as they are now just "units" to be scheduled
    deferredChunkIds: new Set<string>(),
    
    // Lineage preserved
    repairGeneration: currentState.repairGeneration,
    
    // Transition tick
    logicalTick,
    
    // Replay continuity preserved
    eventLog: currentState.eventLog,

    // Phase 7A: Preserve adaptive heuristics across day boundary
    heuristicState: currentState.heuristicState,

    // Phase 7B: Preserve constraint memory across day boundary
    constraintMemory: currentState.constraintMemory
  };
}
