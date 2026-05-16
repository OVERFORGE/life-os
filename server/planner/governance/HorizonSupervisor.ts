import { CandidateSchedule } from "../types/ScheduleGraphTypes";
import { SchedulableUnit, PlacementAnalysisContext } from "../types/SchedulingTypes";
import { PlannerEvent } from "../types/PlannerEventTypes";
import { SimulationOptions } from "../types/SimulationTypes";
import { DayBoundary, DeferredCarryForward } from "../types/HorizonTypes";
import { RuntimeFailureReason, GovernanceMetrics, StabilizationGuards } from "../types/GovernanceTypes";
import { simulateExecutionHorizon, HorizonExecutionTrace } from "../simulation/simulateExecutionHorizon";
import { calculateGovernanceMetrics } from "./calculateGovernanceMetrics";
import { detectRepairStorm } from "./detectRepairStorm";

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
  
  // 2. Evaluate Governance Rolling Window
  const stabilizationHistory: GovernanceMetrics[] = [];
  let sustainedViolations = 0;
  const windowConfig = guards.stabilizationWindow || { evaluationWindowTicks: 1, sustainedViolationThreshold: 1 };
  
  // Note: For simplicity in the hardening pass, we mock the carryLog here.
  // In full implementation, it is derived from trace events/states.
  const carryMetadataLog: DeferredCarryForward[] = []; 

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

    if (isViolating) {
      sustainedViolations++;
      if (sustainedViolations >= windowConfig.sustainedViolationThreshold) {
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
    } else {
      // Natural recovery within window
      sustainedViolations = 0;
    }
  }

  // 3. Repair Storm Containment (Lineage Aware)
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
