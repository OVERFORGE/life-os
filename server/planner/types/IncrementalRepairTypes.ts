import { PlacementAnchorType } from "./SchedulingTypes";
import { CandidateSchedule } from "./ScheduleGraphTypes";

// ─── Architectural Bounds ───────────────────────────────────────────────────
// These bounds prevent topology explosion and ensure deterministic tractability.

// TODO: Adaptive Repair Radius
// effectiveRepairRadius (currently MAX_REPAIR_RADIUS) may later adapt based on:
// - dependency pressure
// - deadline pressure
// - graph instability
// - repair severity
export const MAX_REPAIR_RADIUS = 3; // Maximum degrees of dependency traversal during a localized repair
/** 
 * Maximum depth for forward temporal risk propagation.
 * TODO: Explicit Failure Semantics
 * Propagation exceeding max depth is deterministically truncated 
 * and emits bounded reasoning metadata.
 */
export const MAX_PROPAGATION_DEPTH = 5;
export const MAX_CHUNK_PROLIFERATION = 12; // Absolute ceiling on chunks per task (prevents micro-fragmentation)
export const MAX_REPAIR_OPERATIONS_PER_CYCLE = 10; // Cap on atomic mutations per repair pass

// ─── Graph Traversal Invariants ─────────────────────────────────────────────
// All graph traversals must:
// - terminate deterministically
// - obey traversal caps
// - preserve stable iteration order

// ─── Repair Invariants ──────────────────────────────────────────────────────
// Explicit Repair Idempotency Guarantee:
// Applying the same repair conditions repeatedly must produce identical repair operations.
//
// No Emergency Override Guarantee:
// No repair operation may violate:
// - dependency ordering
// - acyclic guarantees
// - hard constraints
// - deterministic replay guarantees
// even under severe schedule instability.

// ─── Repair Triggers ────────────────────────────────────────────────────────

export type RepairTriggerType = 
  | "chunk_overran" 
  | "task_interrupted" 
  | "placement_invalidated" 
  | "new_task_inserted" 
  | "recovery_window_expanded" 
  | "deadline_risk_detected";

export interface RepairTrigger {
  triggerId: string;
  type: RepairTriggerType;
  sourceChunkId?: string; // The chunk that caused the anomaly
  anomalyMagnitudeMinutes?: number; // E.g., overran by 30 mins
  reasoning: string;
}

// ─── Repair Operations ──────────────────────────────────────────────────────

export type RepairOperationType = 
  | "move_chunk" 
  | "split_chunk" 
  | "defer_chunk" 
  | "compress_gap" 
  | "merge_chunks";

export interface RepairOperation {
  operationId: string;
  type: RepairOperationType;
  targetChunkId: string;
  
  // State changes
  previousPlacementId?: string;
  newPlacementId?: string;
  
  // Topology impact tracking
  affectedDependencyEdges?: string[];
  downstreamAffectedChunkIds?: string[];
  
  // Evaluation
  stabilityImpact: number; // -1.0 to 1.0 (positive means improved stability)
  confidenceImpact: number; // -1.0 to 1.0
  
  // Cost Modeling
  // Future repairCost should incorporate:
  // - displacement magnitude
  // - downstream dependency impact
  // - continuity disruption
  // - deep work fragmentation
  // - number of moved chunks
  repairCost: number; // normalized 0..1
  
  reasoning: string[];
}

// ─── Repair Plans ───────────────────────────────────────────────────────────

export interface IncrementalRepairPlan {
  planId: string;
  trigger: RepairTrigger;
  
  // Topology surface
  affectedChunkIds: string[];
  affectedTaskIds: string[];
  
  // Atomic modifications
  operations: RepairOperation[];
  
  // Detailed tracking
  topologyChanges: string[]; // Human-readable descriptions of graph changes
  preservedPlacements: string[]; // Chunk IDs that were intentionally held stable
  displacedPlacements: string[]; // Chunk IDs pushed out of the schedule
  
  // Deltas
  stabilityDelta: number; // Net change in schedule stability
  confidenceDelta: number; // Net change in prediction confidence
  
  reasoning: string[];
}
