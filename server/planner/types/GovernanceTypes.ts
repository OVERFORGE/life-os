export type RuntimeFailureReason =
  | "repair_storm"
  | "deferred_queue_explosion"
  | "topology_oscillation"
  | "horizon_memory_pressure"
  | "unresolvable_conflict"
  | "dependency_deadlock"
  | "repair_instability"
  | "sustained_instability";

export type SystemTrajectory =
  | "stabilizing"
  | "unstable"
  | "bounded_oscillation"
  | "decaying_oscillation"
  | "accelerating_oscillation"
  | "explosive";

export interface StabilizationWindow {
  /** The number of sequential ticks or days to evaluate instability over */
  evaluationWindowTicks: number;
  /** The threshold of sustained violations that must occur within the window to trigger abort */
  sustainedViolationThreshold: number;
}


export interface GovernanceMetrics {
  /** Rate of placements changed per day boundary */
  topologyChurnRate: number;
  
  /** Number of repair operations per scheduled chunk */
  repairDensity: number;
  
  /** Growth rate of the deferred queue (delta / days) */
  deferredCarryForwardVelocity: number;
  
  /** The rate at which cross-day cascading repairs decay across days */
  convergenceHalfLife: number;
  
  /** Ratio of total events to snapshots/trace size */
  replayAmplificationFactor: number;
  
  /** Evaluated system trajectory based on deltas */
  trajectory?: SystemTrajectory;
}

export interface StabilizationGuards {
  /** Maximum allowed size of the deferred chunk queue before throwing an explosion error */
  maxDeferredQueueSize: number;
  
  /** Maximum number of times a specific chunk can be carried forward due to repair displacements */
  maxCarryForwardChains: number;
  
  /** Maximum allowable ratio of repair cycles to total chunk placements before aborting */
  maxRepairAmplification: number;
  
  /** Maximum memory snapshots before requiring a trace compaction */
  maxMemorySnapshots: number;
  
  /** Rolling window over which instability is evaluated before considering it a sustained failure */
  stabilizationWindow?: StabilizationWindow;
}
