// ─────────────────────────────────────────────────────────────────────────────
// PLANNER-WIDE CANONICAL SEMANTICS
//
// confidence ∈ [0,1] — used across placements, schedules, signals, and repairs:
//   Measures the deterministic trustworthiness of planner inputs, constraint
//   integrity, and evaluation completeness — NOT probability of success.
//   1.0 = all inputs structurally complete and internally consistent.
//   <0.5 = significant missing or conflicting input data.
//   See: server/planner/types/PlannerSemantics.ts for the authoritative definition.
// ─────────────────────────────────────────────────────────────────────────────
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
  /**
   * TODO: Future schedulable units may include:
   * - routines
   * - recovery blocks
   * - maintenance windows
   * - adaptive buffers
   * - collaborative sessions
   */
  unitType: "task" | "chunk";
  
  /** 
   * Lineage Substrate: Tracks identity preservation across mutations.
   * lineageRootId must remain immutable once established.
   */
  lineageRootId?: string;
  
  /** Represents immediate parent lineage only (e.g., prior to a split) */
  derivedFromChunkId?: string;
  
  /** Must monotonically increase deterministically upon every chunk mutation */
  mutationGeneration?: number;
  
  // Temporal Properties
  estimatedDurationMinutes: number;
  hardConstraints: TemporalWindow[];
  softConstraints: TemporalWindow[];
  preferredTimeWindows?: TemporalWindow[];
  /**
   * Planner-relative deadline for this unit, expressed as minutes from the
   * start of the ACTIVE ORCHESTRATION HORIZON (day-start minute = 0).
   *
   * This is NOT wall-clock absolute time. It is not a Unix timestamp.
   * It is not a Date. It is a minute offset within the current planning day.
   *
   * Semantics:
   *   - 0   = start of the active scheduling day
   *   - 720 = noon of the active scheduling day
   *   - 1439 = last valid minute of the active scheduling day
   *
   * Cross-day safety:
   *   hardDeadlineMinute is only meaningful within a single orchestration horizon.
   *   For deadlines spanning multiple days, use PlannerDeadlineBoundary (see
   *   PlannerSemantics.ts) which carries an explicit dayOffset anchor.
   *
   * Boundary rule:
   *   Wall-clock dueDate (Date) is resolved to hardDeadlineMinute by the
   *   normalization layer ONLY when the planning day anchor is known.
   *   The planner kernel itself never performs this conversion.
   */
  hardDeadlineMinute?: number;
  
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
  /** 
   * Propagated confidence ∈ [0,1].
   * Confidence measures deterministic trustworthiness of the underlying planner context 
   * and evaluation inputs, NOT probabilistic success likelihood.
   */
  confidence: number;
  /** Measure of fragility/resilience ∈ [0,1] (Refinement 4) */
  stabilityScore: number;
  /** Semantics inferred from dominant signals (Refinement 5) */
  placementType: PlacementType;

  // Explainability
  penaltiesApplied: string[];
  boostsApplied: string[];
  blockingReasons: string[];
  /**
   * TODO: Evolve to PlannerReasoningEvent objects for structured, queryable, and weightable metadata.
   */
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
  /**
   * Deterministic stable identity for this placement.
   * Format: `{taskId}@{startMinute}-{endMinute}:{generationSeed}`
   * where generationSeed derives from logicalTick or repairGeneration.
   *
   * Required for: replay diffs, repair lineage, displacement tracking,
   * and continuity analysis across incremental repair cycles.
   *
   * TODO: Populate in generateCandidatePlacements() once logicalTick is
   * threaded through the placement engine. Must NEVER use Date.now() or randomness.
   */
  placementId?: string;
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
