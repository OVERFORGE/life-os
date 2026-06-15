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
  const { trajectory, metadata } = classifyTrajectory(queueSizes);

  // Calculate deferred Carry Forward Velocity (chunks per day)
  const deferredCarryForwardVelocity = deferredQueueDelta / daysSimulated;

  // Topology Churn Rate: average repair cycles per day
  const topologyChurnRate = trace.totalRepairCycles / daysSimulated;

  // Repair Density: repair cycles per event
  const repairDensity = trace.totalRepairCycles / Math.max(1, trace.events.length);

  // Phase 6B.5 temporary approximation boundary
  // How fast do repairs decrease across days? 
  // For a rigorous metric we would group repair events by day and calculate decay.
  const convergenceHalfLife = trajectory === "decaying_oscillation" || trajectory === "stabilizing" ? 1.0 : -1.0; 

  // Replay Amplification Factor: events vs snapshots
  const snapshotsLength = compactTrace?.repairBoundarySnapshots?.length || 1;
  const replayAmplificationFactor = trace.events.length / Math.max(1, snapshotsLength);

  // Phase 7A: Adaptive Convergence Metrics
  const heuristicEvents = trace.events.filter(e => e.type === "heuristic_state_updated");
  const profileSwitchCount = heuristicEvents.length;
  // Convergence: heuristic switches are bounded (≤ boundaries length means at most one per day)
  // AND the trajectory is stabilizing or decaying.
  const heuristicConvergence = profileSwitchCount <= boundaries.length && 
                              (trajectory === "stabilizing" || trajectory === "decaying_oscillation");

  return {
    topologyChurnRate,
    repairDensity,
    deferredCarryForwardVelocity,
    convergenceHalfLife,
    replayAmplificationFactor,
    trajectory,
    trajectoryMetadata: metadata,
    profileSwitchCount,
    heuristicConvergence
  };
}

/**
 * Pure deterministic classification of system trajectory based on multi-dimensional analysis.
 */
function classifyTrajectory(queueSizes: number[]): { trajectory: SystemTrajectory, metadata: GovernanceMetrics["trajectoryMetadata"] } {
  const metadata = {
    trendSlope: 0,
    volatility: 0,
    envelopeExpansionRate: 0,
    oscillationFrequency: 0
  };

  if (queueSizes.length < 2) {
    return { trajectory: "stabilizing", metadata };
  }

  const deltas: number[] = [];
  for (let i = 1; i < queueSizes.length; i++) {
    deltas.push(queueSizes[i] - queueSizes[i - 1]);
  }

  // 1. Directionality (Trend Slope)
  metadata.trendSlope = (queueSizes[queueSizes.length - 1] - queueSizes[0]) / (queueSizes.length - 1);

  // 2. Volatility (Variance around the trend)
  let varianceSum = 0;
  for (let i = 0; i < queueSizes.length; i++) {
    const expectedValue = queueSizes[0] + metadata.trendSlope * i;
    varianceSum += Math.pow(queueSizes[i] - expectedValue, 2);
  }
  metadata.volatility = varianceSum / queueSizes.length;

  // 3. Oscillation Frequency
  for (let i = 1; i < deltas.length; i++) {
    if (Math.sign(deltas[i]) !== Math.sign(deltas[i - 1]) && deltas[i] !== 0 && deltas[i-1] !== 0) {
      metadata.oscillationFrequency++;
    }
  }

  // 4. Envelope Expansion Rate
  if (deltas.length > 1) {
    const amplitudes = deltas.map(d => Math.abs(d));
    const firstHalfAvg = amplitudes.slice(0, Math.ceil(amplitudes.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(amplitudes.length / 2);
    const secondHalfAvg = amplitudes.slice(Math.floor(amplitudes.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(amplitudes.length / 2);
    metadata.envelopeExpansionRate = secondHalfAvg - firstHalfAvg;
  }

  let trajectory: SystemTrajectory = "unstable";

  // Classification Logic based on dimensions
  const isOscillating = metadata.oscillationFrequency > 0;
  
  if (isOscillating) {
    if (metadata.envelopeExpansionRate > 0) {
      trajectory = "accelerating_oscillation";
    } else if (metadata.envelopeExpansionRate < 0) {
      trajectory = "decaying_oscillation";
    } else {
      trajectory = "bounded_oscillation";
    }
  } else {
    // Non-oscillating
    if (metadata.trendSlope > 0) {
      // Monotonic growth
      if (metadata.envelopeExpansionRate > 0 || metadata.trendSlope > 1.5) {
        trajectory = "explosive"; // Growing faster or steep
      } else {
        trajectory = "unstable"; // Slow drift up
      }
    } else if (metadata.trendSlope <= 0) {
      trajectory = "stabilizing";
    }
  }

  return { trajectory, metadata };
}
