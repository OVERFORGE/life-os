import { TaskExecutionState } from "../types/ChunkGraphTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — Schedule Drift Analysis
//
// Detects execution drift by analyzing the difference between planned duration
// and actual completed/remaining duration, plus interruption counts.
// Emits directional bias signals used by the replanner.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw state collected from the client/execution tracker before drift analysis
 * has computed the directional biases.
 */
export interface RawExecutionData {
  taskId: string;
  plannedDuration: number;
  completedDuration: number;
  remainingDuration: number;
  interruptionCount: number;
}

/**
 * Computes directional drift metrics for a set of executed tasks.
 * 
 * - underestimationBias: > 1.0 means the task took/will take longer than planned.
 * - overestimationBias: > 1.0 means the task was completed faster than planned.
 * - focusInstabilityScore: 0.0 to 1.0, measuring excessive interruptions.
 */
export function analyzeScheduleDrift(executionHistory: RawExecutionData[]): TaskExecutionState[] {
  return executionHistory.map(data => {
    // Total realistic duration based on execution reality
    const totalRealisticDuration = data.completedDuration + data.remainingDuration;
    
    let underestimationBias = 1.0;
    let overestimationBias = 1.0;
    
    if (data.plannedDuration > 0) {
      const ratio = totalRealisticDuration / data.plannedDuration;
      
      if (ratio > 1) {
        underestimationBias = ratio;
      } else if (ratio < 1 && totalRealisticDuration > 0) {
        // e.g., planned 60, realistic total is 30. ratio = 0.5.
        // overestimation bias = 2.0
        overestimationBias = 1 / ratio;
      }
    }

    // focusInstabilityScore: A 0..1 metric.
    // We expect roughly 1 interruption (or natural break) per 60 minutes of planned work.
    const expectedNaturalBreaks = Math.floor(data.plannedDuration / 60);
    const excessiveInterruptions = Math.max(0, data.interruptionCount - expectedNaturalBreaks);
    
    // Asymptotic scale: 
    // 0 excessive = 0.0
    // 1 excessive = 0.5
    // 2 excessive = 0.75
    // 3 excessive = 0.875
    const focusInstabilityScore = 1 - Math.pow(0.5, excessiveInterruptions);

    return {
      taskId: data.taskId,
      plannedDuration: data.plannedDuration,
      completedDuration: data.completedDuration,
      remainingDuration: data.remainingDuration,
      underestimationBias,
      overestimationBias,
      focusInstabilityScore
    };
  });
}
