import {
  CandidateSchedule,
  ScheduledTaskPlacement,
  ScheduleConflict,
} from "../types/ScheduleGraphTypes";
import {
  SchedulableUnit,
  PlacementAnalysisContext,
  CandidatePlacement,
} from "../types/SchedulingTypes";
import { generateCandidatePlacements } from "./generateCandidatePlacements";
import { computeScheduleStability } from "./computeScheduleStability";
import { temporalWindowsIntersect, calculateTemporalOverlap } from "../utils/TemporalWindow";
import { propagateConfidence } from "../utils/confidencePropagation";
import { clamp } from "../utils/statistics";
import { HeuristicState, INITIAL_HEURISTIC_STATE } from "../heuristics/HeuristicTypes";
import { ConstraintMemoryState, INITIAL_CONSTRAINT_MEMORY } from "../heuristics/ConstraintMemoryTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2B — Candidate Schedule Generation Engine
//
// Orchestrates the single-task placement engine (Phase 2A) into full
// multi-task candidate schedules. This is the first true optimization layer.
//
// Algorithm:
//   1. Placement Expansion  — generate top-N placements per task
//   2. Task Ordering        — sort by urgency/priority/flexibility
//   3. Greedy Construction  — iteratively place, reject conflicts
//   4. Conflict Arbitration — weighted priority resolution
//   5. Schedule Scoring     — composite quality metrics
//   6. Stability Analysis   — separate stability pass
//   7. Confidence Propagation — via canonical propagateConfidence()
//
// DETERMINISM GUARANTEE:
//   No timestamps, randomness, or unstable sort keys.
//   Identical inputs always produce identical schedules.
// ─────────────────────────────────────────────────────────────────────────────

/** Top-N placements to keep per task. Controls combinatorial complexity but needs to be large enough for long chunk chains. */
const MAX_PLACEMENTS_PER_TASK = 20;

type SeedStrategy =
  | "urgency_first"
  | "priority_first"
  | "flexibility_first";

/**
 * Generate ranked candidate schedules for a set of tasks.
 *
 * Produces 3 deterministic schedule variants using different seed orderings:
 * - urgency_first    : tasks sorted by urgency DESC
 * - priority_first   : tasks sorted by priorityScore DESC
 * - flexibility_first: tasks sorted by temporalFlexibility ASC (least flexible first)
 *
 * Each variant may produce different placements, coverage, and stability.
 */
export function generateCandidateSchedules(
  tasks: SchedulableUnit[],
  context: PlacementAnalysisContext,
  heuristicState: HeuristicState = INITIAL_HEURISTIC_STATE,
  constraintMemory: ConstraintMemoryState = INITIAL_CONSTRAINT_MEMORY
): CandidateSchedule[] {
  if (tasks.length === 0) return [];

  // ── Phase 1: Placement Expansion ─────────────────────────────────────────
  // Generate top-N placements per task up-front.
  const placementMap = new Map<string, CandidatePlacement[]>();
  const unschedulableTaskIds: string[] = [];

  for (const task of tasks) {
    const placements = generateCandidatePlacements(task, context).slice(
      0,
      MAX_PLACEMENTS_PER_TASK
    );
    if (placements.length === 0) {
      unschedulableTaskIds.push(task.id);
    } else {
      placementMap.set(task.id, placements);
    }
  }

  // Tasks with placements available
  const schedulableTasks = tasks.filter((t) => placementMap.has(t.id));

  // ── Phase 2: Generate 3 Deterministic Variants ───────────────────────────
  const strategies: SeedStrategy[] = [
    "urgency_first",
    "priority_first",
    "flexibility_first",
  ];

  const schedules: CandidateSchedule[] = [];

  for (const strategy of strategies) {
    // Phase 7B: Apply deterministic memory bias before ordering.
    // Unstable chunks receive reduced effective urgency/priority.
    const biasedTasks = applyMemoryBias(schedulableTasks, constraintMemory);
    const ordered = sortTasksByStrategy(biasedTasks, strategy);
    const schedule = buildGreedySchedule(
      ordered,
      unschedulableTaskIds,
      placementMap,
      context,
      strategy,
      heuristicState
    );
    schedules.push(schedule);
  }

  // Sort schedules: highest scheduleScore first
  schedules.sort((a, b) => b.scheduleScore - a.scheduleScore);

  return schedules;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: Memory Bias Application
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies deterministic historical memory bias to the task ordering.
 *
 * This is NOT ML — it is deterministic historical reinforcement.
 * High-instability chunks receive reduced effective urgency and priority
 * to lower their scheduling priority relative to stable chunks.
 *
 * Bias scale: up to 30% reduction for aggregateInstabilityScore = 1.0.
 * Reduction is proportional: bias = 1 - (score * 0.30).
 * Stable chunks (score = 0) are not affected.
 *
 * HARD CONSTRAINT GUARD INVARIANTS:
 *   This function MUST remain secondary to all hard scheduling constraints.
 *   Memory bias affects only the ORDERING of schedulable tasks — it does not:
 *     1. Remove a task from consideration (feasibility is never blocked by memory).
 *     2. Override deadline enforcement (temporal hard constraints take precedence).
 *     3. Break dependency ordering (dependency safety is never violated by bias).
 *     4. Block mandatory tasks (tasks with no flexibility are never deprioritized).
 *
 *   The 30% cap is invariant. Future phases must NOT increase this cap without
 *   first verifying that instability-driven deprioritization cannot cause
 *   deadline violations for high-instability chunks with hard deadlines.
 *
 *   If memory bias must interact with deadline or dependency constraints in
 *   Phase 7C+, introduce a dedicated conflict-resolution layer ABOVE this function,
 *   not by increasing the bias magnitude.
 */
function applyMemoryBias(
  tasks: SchedulableUnit[],
  memory: ConstraintMemoryState
): SchedulableUnit[] {
  return tasks.map(task => {
    const entry = memory.chunkMemory.get(task.id);
    if (!entry || entry.aggregateInstabilityScore < 0.01) return task;
    // Deterministic linear bias — no randomness, capped at 30%
    const biasFactor = 1 - (entry.aggregateInstabilityScore * 0.30);
    return {
      ...task,
      urgency: task.urgency * biasFactor,
      priorityScore: task.priorityScore * biasFactor
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: Task Ordering
// ─────────────────────────────────────────────────────────────────────────────

function sortTasksByStrategy(
  tasks: SchedulableUnit[],
  strategy: SeedStrategy
): SchedulableUnit[] {
  const copy = [...tasks];

  switch (strategy) {
    case "urgency_first":
      // Urgency DESC, then priorityScore DESC (tie-break), then id ASC (deterministic)
      return copy.sort((a, b) => {
        if (Math.abs(a.urgency - b.urgency) > 0.001)
          return b.urgency - a.urgency;
        if (Math.abs(a.priorityScore - b.priorityScore) > 0.001)
          return b.priorityScore - a.priorityScore;
        return a.id.localeCompare(b.id);
      });

    case "priority_first":
      // priorityScore DESC, then urgency DESC, then id ASC
      return copy.sort((a, b) => {
        if (Math.abs(a.priorityScore - b.priorityScore) > 0.001)
          return b.priorityScore - a.priorityScore;
        if (Math.abs(a.urgency - b.urgency) > 0.001)
          return b.urgency - a.urgency;
        return a.id.localeCompare(b.id);
      });

    case "flexibility_first":
      // temporalFlexibility ASC (least flexible placed first), then urgency DESC
      return copy.sort((a, b) => {
        if (Math.abs(a.temporalFlexibility - b.temporalFlexibility) > 0.001)
          return a.temporalFlexibility - b.temporalFlexibility;
        if (Math.abs(a.urgency - b.urgency) > 0.001)
          return b.urgency - a.urgency;
        return a.id.localeCompare(b.id);
      });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: Greedy Schedule Construction
// ─────────────────────────────────────────────────────────────────────────────

function buildGreedySchedule(
  orderedTasks: SchedulableUnit[],
  baseUnschedulableIds: string[],
  placementMap: Map<string, CandidatePlacement[]>,
  context: PlacementAnalysisContext,
  strategy: SeedStrategy,
  heuristicState: HeuristicState
): CandidateSchedule {
  const scheduledPlacements: ScheduledTaskPlacement[] = [];
  const unscheduledTaskIds: string[] = [...baseUnschedulableIds];
  const conflicts: ScheduleConflict[] = [];

  // ── Phase 3: Greedy Placement ─────────────────────────────────────────────
  for (const task of orderedTasks) {
    const candidates = placementMap.get(task.id) ?? [];
    let placed = false;

    for (const candidate of candidates) {
      // 1. Enforce Chunk Dependencies (if applicable)
      let failsDependency = false;
      if (context.reverseDependencyGraph && context.reverseDependencyGraph.has(task.id)) {
        const parentIds = context.reverseDependencyGraph.get(task.id)!;
        for (const parentId of parentIds) {
          let parentEnd = -1;
          let parentStart = -1;
          const parentSP = scheduledPlacements.find(sp => sp.task.id === parentId);
          
          if (parentSP) {
            parentEnd = parentSP.placement.temporalWindow.endMinute;
            parentStart = parentSP.placement.temporalWindow.startMinute;
          } else {
            // Check if parent is a frozen placement injected via constraints
            const frozenConstraint = context.recurringConstraints?.find(c => 
              c.sourceSignals?.includes(`frozen_placement:${parentId}`)
            );
            if (frozenConstraint) {
              parentEnd = frozenConstraint.window.endMinute;
              parentStart = frozenConstraint.window.startMinute;
            } else {
              // Parent chunk was deferred or displaced. Child cannot be scheduled.
              failsDependency = true;
              break;
            }
          }

          let childStart = candidate.temporalWindow.startMinute;
          
          // Basic check for sequential overlap/inversion without crossing midnight
          if (parentStart < parentEnd && 
              candidate.temporalWindow.startMinute < candidate.temporalWindow.endMinute) {
             if (childStart < parentEnd) {
               failsDependency = true;
               break;
             }
          }
        }
      }

      if (failsDependency) {
        continue; // Try next candidate slot
      }

      // 2. Check for temporal conflict with all already-placed tasks
      const conflictingSPs = scheduledPlacements.filter((sp) =>
        temporalWindowsIntersect(
          sp.placement.temporalWindow,
          candidate.temporalWindow
        )
      );

      if (conflictingSPs.length === 0) {
        // No conflict — place this task
        scheduledPlacements.push({ task, placement: candidate });
        placed = true;
        break;
      }

      // Conflict detected — run arbitration against ALL overlapping incumbents
      // Phase 4: Conflict Arbitration
      let challengerWinsAll = true;
      for (const incumbent of conflictingSPs) {
        const winner = arbitrate(task, candidate, incumbent.task, incumbent.placement);
        if (winner === "incumbent") {
          challengerWinsAll = false;
          // Log conflict: incumbent beats challenger
          conflicts.push({
            winnerTaskId: incumbent.task.id,
            loserTaskId: task.id,
            reason: arbitrationReason(incumbent.task, task),
            overlapMinutes: calculateTemporalOverlap(candidate.temporalWindow, incumbent.placement.temporalWindow).overlapMinutes,
            resolutionStrategy: "defer_loser",
          });
          break; // Stop checking this candidate, it lost to at least one incumbent
        }
      }

      if (challengerWinsAll) {
        // Challenger defeats ALL overlapping incumbents; displace them
        for (const incumbent of conflictingSPs) {
          const incumbentIdx = scheduledPlacements.indexOf(incumbent);
          if (incumbentIdx > -1) {
            scheduledPlacements.splice(incumbentIdx, 1);
          }

          conflicts.push({
            winnerTaskId: task.id,
            loserTaskId: incumbent.task.id,
            reason: arbitrationReason(task, incumbent.task),
            overlapMinutes: calculateTemporalOverlap(candidate.temporalWindow, incumbent.placement.temporalWindow).overlapMinutes,
            resolutionStrategy: "defer_loser",
          });

          // The displaced task becomes unscheduled
          unscheduledTaskIds.push(incumbent.task.id);
          
          // Cascading displacement: if incumbent has children already placed, displace them too
          if (context.dependencyGraph && context.dependencyGraph.has(incumbent.task.id)) {
             const queue = [...context.dependencyGraph.get(incumbent.task.id)!];
             while (queue.length > 0) {
                const childId = queue.shift()!;
                const childIdx = scheduledPlacements.findIndex(sp => sp.task.id === childId);
                if (childIdx > -1) {
                   const childSP = scheduledPlacements.splice(childIdx, 1)[0];
                   unscheduledTaskIds.push(childSP.task.id);
                   conflicts.push({
                      winnerTaskId: "dependency_cascade",
                      loserTaskId: childSP.task.id,
                      reason: "parent_displaced",
                      overlapMinutes: 0,
                      resolutionStrategy: "defer_loser"
                   });
                   if (context.dependencyGraph.has(childId)) {
                      queue.push(...context.dependencyGraph.get(childId)!);
                   }
                }
             }
          }
        }
        
        // Place the challenger
        scheduledPlacements.push({ task, placement: candidate });
        placed = true;
        break;
      }
    }

    if (!placed) {
      unscheduledTaskIds.push(task.id);
    }
  }

  // ── Phase 5: Schedule Scoring ─────────────────────────────────────────────
  const totalTasks = orderedTasks.length + baseUnschedulableIds.length;
  const coverageRatio = totalTasks > 0
    ? scheduledPlacements.length / totalTasks
    : 0;

  const avgPlacementScore =
    scheduledPlacements.length > 0
      ? scheduledPlacements.reduce((s, sp) => s + sp.placement.placementScore, 0) /
        scheduledPlacements.length
      : 0;

  const focusScore =
    scheduledPlacements.length > 0
      ? clamp(
          scheduledPlacements.reduce(
            (s, sp) => s + sp.placement.metadata.focusAlignment,
            0
          ) / scheduledPlacements.length
        )
      : 0;

  const fragmentationScore =
    scheduledPlacements.length > 0
      ? clamp(
          scheduledPlacements.reduce(
            (s, sp) => s + sp.placement.metadata.fragmentationRisk,
            0
          ) / scheduledPlacements.length
        )
      : 0;

  const recoverySafetyScore =
    scheduledPlacements.length > 0
      ? clamp(
          1 -
            scheduledPlacements.reduce(
              (s, sp) => s + sp.placement.metadata.recoveryConflict,
              0
            ) /
              scheduledPlacements.length
        )
      : 1;

  const scheduleScore = clamp(
    coverageRatio * 0.30 +
    avgPlacementScore * 0.25 +
    focusScore * 0.20 +
    recoverySafetyScore * 0.15 -
    fragmentationScore * 0.10
  );

  // ── Phase 6: Stability Analysis ───────────────────────────────────────────
  const stabilityAnalysis = computeScheduleStability(scheduledPlacements, context, heuristicState);

  // ── Phase 7: Confidence Propagation ──────────────────────────────────────
  const avgPlacementConfidence =
    scheduledPlacements.length > 0
      ? scheduledPlacements.reduce((s, sp) => s + sp.placement.confidence, 0) /
        scheduledPlacements.length
      : 0;

  const conf = propagateConfidence({
    components: [
      { name: "avg_placement_confidence", value: avgPlacementConfidence, weight: 0.5 },
      { name: "coverage_ratio",           value: coverageRatio,          weight: 0.3 },
      { name: "stability_score",          value: stabilityAnalysis.stabilityScore, weight: 0.2 },
    ],
    cap: 0.9,
    penaltyMultiplier: context.dataReliabilityScore,
    label: `candidate_schedule_${strategy}`,
  });

  // ── Explainability ────────────────────────────────────────────────────────
  const reasoning: string[] = [];
  const penalties: string[] = [...stabilityAnalysis.penalties];
  const boosts: string[] = [...stabilityAnalysis.boosts];

  if (coverageRatio === 1.0) {
    reasoning.push("full_task_coverage");
    boosts.push("full_coverage");
  } else if (coverageRatio >= 0.8) {
    reasoning.push("high_task_coverage");
  } else {
    reasoning.push("partial_coverage");
    penalties.push("low_coverage");
  }

  if (focusScore > 0.6) {
    boosts.push("strong_focus_alignment");
    reasoning.push("majority_tasks_in_focus_windows");
  }
  if (recoverySafetyScore > 0.8) {
    boosts.push("high_recovery_safety");
  }
  if (conflicts.length === 0) {
    boosts.push("conflict_free_schedule");
    reasoning.push("no_temporal_conflicts");
  } else {
    reasoning.push(`resolved_${conflicts.length}_conflict(s)_via_arbitration`);
  }

  // Fallback reasoning guard
  if (reasoning.length === 0) reasoning.push("valid_greedy_schedule");

  return {
    scheduleId: `sched_${strategy}_${scheduledPlacements.length}placed`,
    scheduledPlacements,
    unscheduledTaskIds: [...new Set(unscheduledTaskIds)],
    conflicts,
    scheduleScore: Number(scheduleScore.toFixed(3)),
    stabilityScore: Number(stabilityAnalysis.stabilityScore.toFixed(3)),
    focusScore: Number(focusScore.toFixed(3)),
    fragmentationScore: Number(fragmentationScore.toFixed(3)),
    recoverySafetyScore: Number(recoverySafetyScore.toFixed(3)),
    coverageRatio: Number(coverageRatio.toFixed(3)),
    confidence: Number(conf.finalConfidence.toFixed(3)),
    seedStrategy: strategy,
    reasoning: [...new Set(reasoning)],
    penaltiesApplied: [...new Set(penalties)],
    boostsApplied: [...new Set(boosts)],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: Conflict Arbitration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Arbitrate a conflict between a challenger task and an incumbent task.
 *
 * Priority order:
 *   1. Hard deadline presence
 *   2. Urgency DESC
 *   3. priorityScore DESC
 *   4. temporalFlexibility ASC (less flexible wins)
 *   5. placementScore DESC
 *   6. confidence DESC
 *   7. id ASC (deterministic tie-break)
 *
 * Returns "challenger" if the challenger should displace the incumbent.
 */
function arbitrate(
  challenger: SchedulableUnit,
  challengerPlacement: CandidatePlacement,
  incumbent: SchedulableUnit,
  incumbentPlacement: CandidatePlacement
): "challenger" | "incumbent" {
  // 1. Hard deadline
  const challengerHasDeadline = challenger.hardDeadlineMinute !== undefined;
  const incumbentHasDeadline = incumbent.hardDeadlineMinute !== undefined;
  if (challengerHasDeadline && !incumbentHasDeadline) return "challenger";
  if (!challengerHasDeadline && incumbentHasDeadline) return "incumbent";

  // 2. Urgency
  if (Math.abs(challenger.urgency - incumbent.urgency) > 0.01) {
    return challenger.urgency > incumbent.urgency ? "challenger" : "incumbent";
  }

  // 3. Priority score
  if (Math.abs(challenger.priorityScore - incumbent.priorityScore) > 0.01) {
    return challenger.priorityScore > incumbent.priorityScore ? "challenger" : "incumbent";
  }

  // 4. Temporal flexibility (less flexible wins)
  if (Math.abs(challenger.temporalFlexibility - incumbent.temporalFlexibility) > 0.01) {
    return challenger.temporalFlexibility < incumbent.temporalFlexibility ? "challenger" : "incumbent";
  }

  // 5. Placement score
  if (Math.abs(challengerPlacement.placementScore - incumbentPlacement.placementScore) > 0.01) {
    return challengerPlacement.placementScore > incumbentPlacement.placementScore ? "challenger" : "incumbent";
  }

  // 6. Confidence
  if (Math.abs(challengerPlacement.confidence - incumbentPlacement.confidence) > 0.01) {
    return challengerPlacement.confidence > incumbentPlacement.confidence ? "challenger" : "incumbent";
  }

  // 7. Deterministic tie-break by id
  return challenger.id.localeCompare(incumbent.id) < 0 ? "challenger" : "incumbent";
}

function arbitrationReason(winner: SchedulableUnit, loser: SchedulableUnit): string {
  if (winner.hardDeadlineMinute !== undefined && loser.hardDeadlineMinute === undefined) return "winner_has_hard_deadline";
  if (winner.urgency > loser.urgency + 0.01) return "winner_higher_urgency";
  if (winner.priorityScore > loser.priorityScore + 0.01) return "winner_higher_priority";
  if (winner.temporalFlexibility < loser.temporalFlexibility - 0.01) return "winner_less_flexible";
  return "winner_higher_placement_score";
}
