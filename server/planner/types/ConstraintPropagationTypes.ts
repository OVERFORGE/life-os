// ─── Constraint Propagation Types ─────────────────────────────────────────────
// These types define the forward-looking risk assessment capabilities of Phase 3B.

export type PressureSignalType = 
  | "deadline_pressure" 
  | "dependency_backlog" 
  | "focus_overload" 
  | "recovery_deficit" 
  | "fragmentation_spike";

export interface TemporalPressureSignal {
  signalId: string;
  type: PressureSignalType;
  
  // Explicit Scope Classification
  // local: affects <= 1 dependency hop
  // regional: affects multiple chunks within one dependency chain
  // global: affects multiple task groups or destabilizes overall schedule metrics
  scope: "local" | "regional" | "global";
  
  // Topology details
  sourceChunkId: string; // The origin of the instability
  affectedChunkIds: string[]; // Downstream chunks feeling the pressure
  
  // Deterministic metrics
  pressureScore: number; // 0.0 to 1.0 (1.0 = highly likely to fail)
  propagationDepth: number; // How far down the dependency graph this traveled
  confidence: number; // 0.0 to 1.0 (How certain we are about this risk)
  
  // Explainability
  reasoning: string[];
}

export interface ConstraintPropagationResult {
  evaluationId: string;
  // logicalTick represents deterministic planner evaluation progression,
  // NOT elapsed real-world time. Ensures deterministic replay across executions.
  logicalTick: number;
  
  // Accumulated signals
  propagatedSignals: TemporalPressureSignal[];
  
  // Risk aggregation
  atRiskTasks: string[]; // Unique task IDs at risk of failure/degradation
  
  // This is a deterministic heuristic aggregate score,
  // NOT a statistical probability estimate.
  // 0.0 = no meaningful instability pressure
  // 1.0 = critical topology instability / likely repair necessity
  stabilityRiskScore: number; // Global metric (0.0 to 1.0)
  
  // Proactive recommendations
  recommendedRepairPriority: string[]; // Chunk IDs that should be repaired/optimized first
  
  // Explainability
  reasoning: string[];
}

