import { SchedulableUnit } from "./SchedulingTypes";
import { CandidatePlacement } from "./SchedulingTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2B — Schedule Graph Types
//
// These types represent the output layer of the multi-task schedule
// generation engine. A CandidateSchedule is one complete topology:
// a ranked, conflict-free assignment of tasks to temporal slots.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A finalized pairing of one task to one selected placement.
 * This is the atomic unit of a CandidateSchedule.
 */
export interface ScheduledTaskPlacement {
  task: SchedulableUnit;
  placement: CandidatePlacement;
}

/**
 * Records a temporal conflict between two competing placements.
 * The winner keeps its placement; the loser is deferred.
 * Stored for full explainability and replay.
 */
export interface ScheduleConflict {
  /** Task that kept its placement */
  winnerTaskId: string;
  /** Task that was deferred due to conflict */
  loserTaskId: string;
  /** Human-readable reason for the arbitration decision */
  reason: string;
  /** Minutes of temporal overlap between the two placements */
  overlapMinutes: number;
  /**
   * Strategy used to resolve the conflict.
   * Phase 2B only supports "defer_loser".
   * Future phases may add "fragment", "split", "reorder".
   */
  resolutionStrategy: "defer_loser";
}

/**
 * One complete candidate schedule produced by the generation engine.
 *
 * Contains:
 * - All placed tasks with their selected placements
 * - Tasks that could not be placed
 * - Schedule-level quality and stability scores
 * - Full explainability metadata
 */
export interface CandidateSchedule {
  /** Unique deterministic identifier for this schedule variant */
  scheduleId: string;

  /** All tasks successfully placed in this schedule */
  scheduledPlacements: ScheduledTaskPlacement[];

  /** IDs of tasks that could not be placed (no conflict-free slot found) */
  unscheduledTaskIds: string[];

  /** All conflicts encountered during schedule construction */
  conflicts: ScheduleConflict[];

  // ── Schedule-Level Scores ─────────────────────────────────────────────────

  /**
   * Weighted composite quality score ∈ [0,1].
   * Aggregates coverage, placement quality, focus, and recovery.
   */
  scheduleScore: number;

  /**
   * Stability score ∈ [0,1].
   * Penalizes context switching, tiny gaps, and late-night work.
   * Computed independently from raw productivity scores.
   */
  stabilityScore: number;

  /**
   * Mean focus alignment ∈ [0,1] across all placed tasks.
   */
  focusScore: number;

  /**
   * Mean fragmentation risk ∈ [0,1] across all placed tasks.
   * Lower is better.
   */
  fragmentationScore: number;

  /**
   * Mean recovery safety ∈ [0,1] across all placed tasks.
   * 1 = no recovery conflicts, 0 = maximal recovery pressure.
   */
  recoverySafetyScore: number;

  /**
   * Ratio of scheduled tasks to total tasks ∈ [0,1].
   * 1.0 = all tasks placed.
   */
  coverageRatio: number;

  /**
   * Propagated confidence ∈ [0,1] for this schedule.
   * Derived from placement confidence, coverage, and stability.
   * Confidence measures deterministic trustworthiness of the underlying planner context 
   * and evaluation inputs, NOT probabilistic success likelihood.
   */
  confidence: number;

  // ── Variant Metadata ──────────────────────────────────────────────────────

  /**
   * Sort strategy used to seed this schedule variant.
   * Allows comparing "urgency-first" vs "priority-first" etc.
   */
  seedStrategy: "urgency_first" | "priority_first" | "flexibility_first";

  // ── Explainability ────────────────────────────────────────────────────────

  /** 
   * High-level reasoning entries for this schedule 
   * TODO: Evolve to PlannerReasoningEvent objects for structured, queryable, and weightable metadata.
   */
  reasoning: string[];
  /** Score-reducing factors */
  penaltiesApplied: string[];
  /** Score-boosting factors */
  boostsApplied: string[];
}
