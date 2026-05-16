import { GovernanceMetrics, SystemTrajectory } from "../types/GovernanceTypes";
import { HorizonExecutionTrace } from "../simulation/simulateExecutionHorizon";
import { CompactExecutionTrace } from "../types/SimulationTypes";
import { DayBoundary } from "../types/HorizonTypes";

export function calculateGovernanceMetrics(
  trace: HorizonExecutionTrace,
  compactTrace: CompactExecutionTrace,
  boundaries: DayBoundary[]
): GovernanceMetrics {
  const finalDays = trace.terminalDayStates;
  
  const initialDeferredCount = 
    trace.initialDayState.deferredChunkIds.size + 
    trace.initialDayState.schedule.unscheduledTaskIds.length;
    
  // Collect history of queue sizes to compute trajectory
  const queueSizes: number[] = [initialDeferredCount];
  for (const boundary of boundaries) {
    const state = finalDays.get(boundary.dayIndex);
    if (state) {
      queueSizes.push(state.deferredChunkIds.size + state.schedule.unscheduledTaskIds.length);
    }
  }

  const daysSimulated = Math.max(1, queueSizes.length - 1);
  const deferredQueueDelta = queueSizes[queueSizes.length - 1] - initialDeferredCount;

  // Trajectory classification math
  const trajectory = classifyTrajectory(queueSizes);

  // Calculate deferred Carry Forward Velocity (chunks per day)
  const deferredCarryForwardVelocity = deferredQueueDelta / daysSimulated;

  // Topology Churn Rate: average repair cycles per day
  const topologyChurnRate = trace.totalRepairCycles / daysSimulated;

  // Repair Density: repair cycles per event
  const repairDensity = trace.totalRepairCycles / Math.max(1, trace.events.length);

  // Convergence Half-Life: crude calculation based on repair distribution
  // Since we don't have per-day repair stats in trace yet, we mock half-life based on trajectory.
  // Future phases should map repair cycles per day specifically.
  const convergenceHalfLife = trajectory === "decaying_oscillation" || trajectory === "stabilizing" ? 1.0 : -1.0; 

  // Replay Amplification Factor: events vs snapshots
  const snapshotsLength = compactTrace?.repairBoundarySnapshots?.length || 1;
  const replayAmplificationFactor = trace.events.length / Math.max(1, snapshotsLength);

  return {
    topologyChurnRate,
    repairDensity,
    deferredCarryForwardVelocity,
    convergenceHalfLife,
    replayAmplificationFactor,
    trajectory
  };
}

/**
 * Pure deterministic classification of system trajectory based on queue growth.
 */
function classifyTrajectory(queueSizes: number[]): SystemTrajectory {
  if (queueSizes.length < 3) return "stabilizing"; // Not enough data to oscillate

  const deltas: number[] = [];
  for (let i = 1; i < queueSizes.length; i++) {
    deltas.push(queueSizes[i] - queueSizes[i - 1]);
  }

  let allPositive = true;
  let allNegative = true;
  let allZero = true;
  let alternates = true;

  for (let i = 0; i < deltas.length; i++) {
    if (deltas[i] !== 0) allZero = false;
    if (deltas[i] <= 0) allPositive = false;
    if (deltas[i] >= 0) allNegative = false;
    if (i > 0) {
      if (Math.sign(deltas[i]) === Math.sign(deltas[i - 1]) && deltas[i] !== 0) {
        alternates = false;
      }
    }
  }

  if (allZero || allNegative) return "stabilizing";
  if (allPositive) return "explosive";

  if (alternates) {
    let growing = true;
    let shrinking = true;
    for (let i = 1; i < deltas.length; i++) {
      const prevAmp = Math.abs(deltas[i - 1]);
      const currAmp = Math.abs(deltas[i]);
      if (currAmp <= prevAmp) growing = false;
      if (currAmp >= prevAmp) shrinking = false;
    }
    
    if (growing) return "accelerating_oscillation";
    if (shrinking) return "decaying_oscillation";
    return "bounded_oscillation";
  }

  return "unstable"; // Mixed, non-alternating behavior
}
