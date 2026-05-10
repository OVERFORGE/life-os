import { TemporalWindow } from "../utils/TemporalWindow";

/**
 * Normalized representation of a task ready for placement analysis.
 * Decoupled from the raw DB Task schema to allow planner-specific normalization
 * (e.g., dynamic chunk sizing, inferred cognitive load).
 */
export interface RawTaskForScheduling {
  id?: string;
  _id?: { toString: () => string };
  title?: string;
  priority?: number;
  dueDate?: string | Date;
  category?: string;
  metadata?: {
    estimatedDuration?: number;
    minimumChunkSize?: number;
    requiresDeepWork?: boolean;
    cognitiveLoad?: number;
    urgency?: number;
    splittable?: boolean;
    // TODO(db-normalization-boundary): Future DB schemas should store raw minute tuple pairs
    // instead of planner TemporalWindow objects. The normalization layer should become the
    // sole creator of TemporalWindow instances — raw inputs should remain untyped at the
    // DB boundary. For now, TemporalWindow[] is accepted here as a convenience.
    hardConstraints?: TemporalWindow[];
    softConstraints?: TemporalWindow[];
  };
}

/**
 * Anchor semantics define how strictly a placement resists replanning displacement.
 */
export type PlacementAnchorType = "fixed" | "sticky" | "movable";

/**
 * The base interface for any entity that the orchestration engine can place temporally.
 * Explicitly extended by SchedulableTask and TaskChunk to prevent abstraction collapse.
 */
export interface SchedulableUnit {
  id: string; // Task ID or deterministic Chunk ID
  unitType: "task" | "chunk";
  
  // Future-proofing: Identity Lineage tracking
  // Preserves explainability when chunks merge/split/rebuild
  derivedFromChunkId?: string;
  mutationGeneration?: number;
  
  // Temporal Properties
  estimatedDurationMinutes: number;
  hardConstraints: TemporalWindow[];
  softConstraints: TemporalWindow[];
  preferredTimeWindows?: TemporalWindow[];
  hardDeadline?: Date;
  
  // Arbitrations & Scoring
  priorityScore: number;
  temporalFlexibility: number;
  urgency: number;
  
  // Cognitive Load & Recovery
  requiresDeepWork: boolean;
  cognitiveLoad: number;
  minimumChunkSize: number;
  energyRequirement?: number; // 0-1
}

export interface SchedulableTask extends SchedulableUnit {
  unitType: "task";
  title: string;
  priority: number; // Raw priority 1-5
  
  // Optional constraints
  allowedDaysOfWeek?: number[];
  splittable?: boolean;
  taskType?: string;
}

export type PlacementType = 
  | "optimal" 
  | "fallback" 
  | "focus_aligned" 
  | "recovery_safe" 
  | "low_energy";

/**
 * Represents ONE valid placement candidate for a single task.
 * Output of the generateCandidatePlacements engine.
 */
export interface CandidatePlacement {
  taskId: string;
  dayOfWeek: number;
  readonly temporalWindow: TemporalWindow;
  
  /** Weighted score ∈ [0,1] evaluating the quality of this slot */
  placementScore: number;
  /** Propagated confidence ∈ [0,1] based on context reliability */
  confidence: number;
  /** Measure of fragility/resilience ∈ [0,1] (Refinement 4) */
  stabilityScore: number;
  /** Semantics inferred from dominant signals (Refinement 5) */
  placementType: PlacementType;

  // Explainability
  penaltiesApplied: string[];
  boostsApplied: string[];
  blockingReasons: string[];
  reasoning: string[];
  
  // Raw subsystem scores
  metadata: {
    focusAlignment: number;
    recoveryConflict: number;
    fragmentationRisk: number;
    chronotypeAlignment: number;
    deepWorkScore: number;
  };

  // Phase 2C Replanning Lineage
  derivedFromPlacementId?: string;
  repairGeneration?: number;
}

export interface AvailabilityWindow {
  window: TemporalWindow;
  daysOfWeek: number[];
  score: number;
  confidence: number;
}

export interface RecurringConstraint {
  window: TemporalWindow;
  daysOfWeek: number[];
  constraintType: "hard" | "soft";
  constraintStrength: number;
  confidence: number;
  stabilityScore?: number;
  sourceSignals?: string[];
}

export interface RecoveryWindow {
  window: TemporalWindow;
  recoveryPenalty: number;
  trigger: string;
  confidence: number;
}

export interface PeakFocusWindow {
  window: TemporalWindow;
  score: number;
  confidence: number;
}

export interface SleepWindow {
  window: TemporalWindow;
  confidence: number;
}

/**
 * The planner's deterministic understanding of the user's environment.
 * Used to score and validate placements.
 */
export interface PlacementAnalysisContext {
  availabilityWindows: AvailabilityWindow[];
  recurringConstraints: RecurringConstraint[];
  recoveryWindows: RecoveryWindow[];
  peakFocusWindows: PeakFocusWindow[];
  sleepWindow: SleepWindow | null;
  chronotype: { type: string; confidence: number } | null;
  fragmentationScore: number;
  dataReliabilityScore: number;
  
  // Phase 2C: Fast-Lookup Structures for topological chunk orchestration
  dependencyGraph?: Map<string, string[]>;
  reverseDependencyGraph?: Map<string, string[]>;
}
