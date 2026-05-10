import { ScheduledTaskPlacement } from "../types/ScheduleGraphTypes";
import { PlacementAnalysisContext } from "../types/SchedulingTypes";
import { distanceBetweenTemporalWindows } from "../utils/TemporalWindow";
import { clamp } from "../utils/statistics";

// ─────────────────────────────────────────────────────────────────────────────
// computeScheduleStability
//
// Analyzes the temporal topology of a placed schedule and returns a
// stability score ∈ [0,1].
//
// STABILITY IS SEPARATE FROM PRODUCTIVITY.
// A schedule can have high placement scores but still be unstable
// (e.g., rapid context switching, tiny buffer gaps, late-night work).
//
// This function is a pure deterministic scorer — no side effects, no state.
// ─────────────────────────────────────────────────────────────────────────────

export interface StabilityAnalysis {
  /** Overall stability score ∈ [0,1] */
  stabilityScore: number;
  /** Labelled penalty contributions */
  penalties: string[];
  /** Labelled stability boosts */
  boosts: string[];
  /** Raw sub-scores for debugging */
  breakdown: {
    contextSwitchingPenalty: number;
    tinyGapPenalty: number;
    lateNightPenalty: number;
    fragmentationPenalty: number;
    sequencingScore: number;
  };
}

/**
 * Compute the stability score for a finalized set of scheduled placements.
 *
 * @param placements - Ordered list of scheduled task↔placement pairs
 * @param context    - The planning context (needed for sleep window)
 * @returns          A StabilityAnalysis object with score and breakdown
 */
export function computeScheduleStability(
  placements: ScheduledTaskPlacement[],
  context: PlacementAnalysisContext
): StabilityAnalysis {
  const penalties: string[] = [];
  const boosts: string[] = [];

  if (placements.length === 0) {
    return {
      stabilityScore: 1.0,
      penalties: [],
      boosts: ["empty_schedule_trivially_stable"],
      breakdown: {
        contextSwitchingPenalty: 0,
        tinyGapPenalty: 0,
        lateNightPenalty: 0,
        fragmentationPenalty: 0,
        sequencingScore: 1.0,
      },
    };
  }

  // Sort placements by start time for sequential analysis
  const sorted = [...placements].sort(
    (a, b) => a.placement.temporalWindow.startMinute - b.placement.temporalWindow.startMinute
  );

  // ── 1. Context Switching Penalty ─────────────────────────────────────────
  // Penalize frequent task type changes in adjacent slots.
  let contextSwitches = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prevType = sorted[i - 1].task.taskType ?? "general";
    const currType = sorted[i].task.taskType ?? "general";
    const prevDeepWork = sorted[i - 1].task.requiresDeepWork;
    const currDeepWork = sorted[i].task.requiresDeepWork;

    // Context switch = different task type AND a cognitive load change
    if (prevType !== currType && prevDeepWork !== currDeepWork) {
      contextSwitches++;
    }
  }
  const maxSwitches = Math.max(1, sorted.length - 1);
  const contextSwitchingPenalty = clamp(contextSwitches / maxSwitches);
  if (contextSwitchingPenalty > 0.4) {
    penalties.push("excessive_context_switching");
  }

  // ── 2. Tiny Gap Penalty ──────────────────────────────────────────────────
  // Penalize gaps < 15 minutes between consecutive tasks — cognitively unsafe.
  const MINIMUM_SAFE_GAP = 15;
  let tinyGapCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gapMinutes = distanceBetweenTemporalWindows(
      sorted[i - 1].placement.temporalWindow,
      sorted[i].placement.temporalWindow
    );
    if (gapMinutes > 0 && gapMinutes < MINIMUM_SAFE_GAP) {
      tinyGapCount++;
    }
  }
  const tinyGapPenalty = clamp(tinyGapCount / Math.max(1, sorted.length - 1));
  if (tinyGapPenalty > 0.3) {
    penalties.push("excessive_tiny_gaps");
  }

  // ── 3. Late-Night Work Penalty ───────────────────────────────────────────
  // Penalize tasks placed within 90 minutes of the sleep window.
  const LATE_NIGHT_THRESHOLD = 90;
  let lateNightCount = 0;
  if (context.sleepWindow) {
    for (const sp of sorted) {
      const dist = distanceBetweenTemporalWindows(
        sp.placement.temporalWindow,
        context.sleepWindow.window
      );
      if (dist < LATE_NIGHT_THRESHOLD) {
        lateNightCount++;
      }
    }
  }
  const lateNightPenalty = clamp(lateNightCount / sorted.length);
  if (lateNightPenalty > 0.25) {
    penalties.push("excessive_late_night_work");
  }

  // ── 4. Fragmentation Penalty ─────────────────────────────────────────────
  // Use the context's overall fragmentation score as a baseline penalty.
  const fragmentationPenalty = clamp(context.fragmentationScore * 0.5);
  if (fragmentationPenalty > 0.3) {
    penalties.push("high_fragmentation_context");
  }

  // ── 5. Sequencing Score ──────────────────────────────────────────────────
  // Reward placing high-cognitive-load tasks earlier in the schedule.
  // Simple heuristic: check that deep-work tasks appear before low-energy tasks.
  let sequencingScore = 1.0;
  let deepWorkAfterLowEnergy = false;
  let seenLowEnergy = false;
  for (const sp of sorted) {
    if (!sp.task.requiresDeepWork) {
      seenLowEnergy = true;
    }
    if (sp.task.requiresDeepWork && seenLowEnergy) {
      deepWorkAfterLowEnergy = true;
      break;
    }
  }
  if (deepWorkAfterLowEnergy) {
    sequencingScore = 0.6;
    penalties.push("suboptimal_cognitive_sequencing");
  } else if (sorted.length > 1) {
    boosts.push("optimal_cognitive_sequencing");
  }

  // ── 6. Chunk Continuity Penalty ──────────────────────────────────────────
  // Penalize large gaps and overnight splits between chunks of the same task.
  let chunkContinuityPenalty = 0;
  const parentTaskWindows = new Map<string, { window: any, isDeepWork: boolean }[]>();
  
  for (const sp of sorted) {
    if (sp.task.unitType === "chunk") {
      const chunk = sp.task as any; // TaskChunk
      const parentId = chunk.parentTaskId;
      if (!parentTaskWindows.has(parentId)) {
         parentTaskWindows.set(parentId, []);
      }
      parentTaskWindows.get(parentId)!.push({
        window: sp.placement.temporalWindow,
        isDeepWork: sp.task.requiresDeepWork
      });
    }
  }

  for (const [parentId, windows] of parentTaskWindows.entries()) {
    for (let i = 1; i < windows.length; i++) {
       const gap = distanceBetweenTemporalWindows(windows[i-1].window, windows[i].window);
       
       // Penalize large gaps between sequential chunks of the same task
       if (gap > 120) {
         chunkContinuityPenalty += 0.1;
       }
       
       // Penalize heavily if separated by sleep (overnight separation proxy)
       // If the gap is massive, it likely crossed the sleep boundary.
       if (gap > 480) { 
         if (windows[i].isDeepWork) {
            chunkContinuityPenalty += 0.4; // Massive penalty for splitting deep work overnight
            penalties.push("overnight_deep_work_separation");
         } else {
            chunkContinuityPenalty += 0.2;
            penalties.push("overnight_chunk_separation");
         }
       }
    }
  }
  
  chunkContinuityPenalty = clamp(chunkContinuityPenalty);
  if (chunkContinuityPenalty > 0) {
    penalties.push("poor_chunk_continuity");
  }

  // ── Composite Score ───────────────────────────────────────────────────────
  const stabilityScore = clamp(
    1.0 -
    contextSwitchingPenalty * 0.20 -
    tinyGapPenalty * 0.15 -
    lateNightPenalty * 0.20 -
    fragmentationPenalty * 0.10 -
    (1.0 - sequencingScore) * 0.15 -
    chunkContinuityPenalty * 0.20
  );

  if (stabilityScore > 0.8) {
    boosts.push("high_stability");
  }

  return {
    stabilityScore: Number(stabilityScore.toFixed(3)),
    penalties: [...new Set(penalties)],
    boosts: [...new Set(boosts)],
    breakdown: {
      contextSwitchingPenalty: Number(contextSwitchingPenalty.toFixed(3)),
      tinyGapPenalty: Number(tinyGapPenalty.toFixed(3)),
      lateNightPenalty: Number(lateNightPenalty.toFixed(3)),
      fragmentationPenalty: Number(fragmentationPenalty.toFixed(3)),
      sequencingScore: Number(sequencingScore.toFixed(3)),
      chunkContinuityPenalty: Number(chunkContinuityPenalty.toFixed(3)),
    },
  };
}
