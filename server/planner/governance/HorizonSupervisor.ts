import { CandidateSchedule } from "../types/ScheduleGraphTypes";
import { SchedulableUnit, PlacementAnalysisContext } from "../types/SchedulingTypes";
import { PlannerEvent } from "../types/PlannerEventTypes";
import { SimulationOptions } from "../types/SimulationTypes";
import { DayBoundary, DeferredCarryForward } from "../types/HorizonTypes";
import { RuntimeFailureReason, GovernanceMetrics, StabilizationGuards } from "../types/GovernanceTypes";
import { simulateExecutionHorizon, HorizonExecutionTrace } from "../simulation/simulateExecutionHorizon";
import { calculateGovernanceMetrics } from "./calculateGovernanceMetrics";
import { detectRepairStorm } from "./detectRepairStorm";
import { replayTrace } from "../observability/replayTrace";

export interface SupervisedHorizonTrace {
  /** The aggregated trace across all executed days */
  trace: HorizonExecutionTrace;
  
  /** Calculated metrics at the point of termination */
  metrics: GovernanceMetrics;
  
  /** If the supervisor halted execution early, the reason why */
  failureReason?: RuntimeFailureReason;
  
  /** True if the supervisor successfully simulated all days without breaching limits */
  isStable: boolean;
  
  /** Externally observable rolling history of governance evaluation */
  stabilizationHistory: GovernanceMetrics[];
}

/**
 * The Horizon Supervisor Layer.
 * Evaluates the full deterministic trace post-execution (or incrementally)
 * against rolling stabilization windows. Differentiates between transient 
 * spikes and sustained instability using trajectory metrics.
 */
export function superviseExecutionHorizon(
  initialSchedule: CandidateSchedule,
  units: SchedulableUnit[],
  context: PlacementAnalysisContext,
  events: PlannerEvent[],
  boundaries: DayBoundary[],
  options: SimulationOptions,
  guards: StabilizationGuards
): SupervisedHorizonTrace {
  
  // 1. Run the pure deterministic kernel
  const fullTrace = simulateExecutionHorizon(initialSchedule, units, context, events, boundaries, options);
  
  // 2. Un-Stub Carry-Forward Lineage via Explicit Transition Causality
  const carryMetadataLog: DeferredCarryForward[] = [];
  
  // Replay the trace to observe exact causal transitions
  for (const step of replayTrace(fullTrace)) {
    if (step.event.type === "repair_triggered") {
      const beforePlacements = new Set(step.stateBefore.schedule.scheduledPlacements.map(p => p.task.id));
      const afterPlacements = new Set(step.stateAfter.schedule.scheduledPlacements.map(p => p.task.id));
      
      // If a chunk was in schedule before repair, but missing after, it was displaced.
      for (const chunkId of beforePlacements) {
        if (!afterPlacements.has(chunkId)) {
          carryMetadataLog.push({
            chunkId,
            carryReason: "repair_displacement",
            sourceTick: step.event.tick,
            deferredDayIndex: -1 // Phase 6B.5 temporary approximation boundary: precise target day requires full timeline mapping
          });
        }
      }
    }
  }

  // 3. Evaluate Governance Rolling Window
  const stabilizationHistory: GovernanceMetrics[] = [];
  
  const windowConfig = guards.stabilizationWindow || { evaluationWindowTicks: 1, sustainedViolationThreshold: 1 };
  const violationWindow: boolean[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const partialBoundaries = boundaries.slice(0, i + 1);
    const dailyMetrics = calculateGovernanceMetrics(fullTrace, {} as any, partialBoundaries);
    stabilizationHistory.push(dailyMetrics);
    
    let isViolating = false;
    
    // Check queue threshold
    const finalState = fullTrace.terminalDayStates.get(partialBoundaries[i].dayIndex) || fullTrace.initialDayState;
    const queueSize = finalState.deferredChunkIds.size + finalState.schedule.unscheduledTaskIds.length;
    
    if (queueSize > guards.maxDeferredQueueSize) {
      isViolating = true;
    }
    
    // Check explosive trajectory
    if (dailyMetrics.trajectory === "explosive" || dailyMetrics.trajectory === "accelerating_oscillation") {
      isViolating = true;
    }

    // Maintain explicit rolling window
    violationWindow.push(isViolating);
    if (violationWindow.length > windowConfig.evaluationWindowTicks) {
      violationWindow.shift(); // Expire historical violations
    }

    const currentViolations = violationWindow.filter(v => v).length;

    if (currentViolations >= windowConfig.sustainedViolationThreshold) {
      // Sustained Instability Detected
      let reason: RuntimeFailureReason = "sustained_instability";
      if (queueSize > guards.maxDeferredQueueSize) {
        reason = "deferred_queue_explosion";
      }
      
      return {
        trace: fullTrace,
        metrics: dailyMetrics,
        failureReason: reason,
        isStable: false,
        stabilizationHistory
      };
    }
  }

  // 4. Repair Storm Containment (Lineage Aware)
  const stormReport = detectRepairStorm(carryMetadataLog, units, guards.maxCarryForwardChains);
  if (stormReport.isStorm) {
    return {
      trace: fullTrace,
      metrics: stabilizationHistory[stabilizationHistory.length - 1] || calculateGovernanceMetrics(fullTrace, {} as any, boundaries),
      failureReason: "repair_storm",
      isStable: false,
      stabilizationHistory
    };
  }

  // Stable Horizon Execution
  return {
    trace: fullTrace,
    metrics: stabilizationHistory[stabilizationHistory.length - 1] || calculateGovernanceMetrics(fullTrace, {} as any, boundaries),
    isStable: true,
    stabilizationHistory
  };
}
