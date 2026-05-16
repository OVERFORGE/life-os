import { 
  CandidatePlacement, 
  PlacementAnalysisContext, 
  PlacementType,
  AvailabilityWindow,
  SchedulableUnit
} from "../types/SchedulingTypes";
import { 
  createTemporalWindow, 
  calculateTemporalOverlap, 
  distanceBetweenTemporalWindows,
  TemporalWindow,
  temporalWindowContains,
  formatTemporalWindow
} from "../utils/TemporalWindow";
import { propagateConfidence } from "../utils/confidencePropagation";
import { clamp } from "../utils/statistics";
import { validateCandidatePlacement } from "../validation/validateCandidatePlacement";

const MAX_PLACEMENTS_PER_TASK = 50;
const MINIMUM_PLACEMENT_SCORE = 0.2;

export function generateCandidatePlacements(
  task: SchedulableUnit,
  context: PlacementAnalysisContext
): CandidatePlacement[] {
  const candidates: CandidatePlacement[] = [];
  const duration = task.estimatedDurationMinutes;

  for (const avail of context.availabilityWindows) {
    if (avail.score < MINIMUM_PLACEMENT_SCORE) continue;
    
    const availWindow = avail.window;
    
    if (availWindow.durationMinutes < duration) continue;

    // Filter by allowed days if restricted (only applies to full tasks or chunks that carry it)
    const taskWithDays = task as any;
    if (taskWithDays.allowedDaysOfWeek && taskWithDays.allowedDaysOfWeek.length > 0) {
      // availabilityWindows have `daysOfWeek` array
      const dayMatches = avail.daysOfWeek.some((d: number) => taskWithDays.allowedDaysOfWeek.includes(d));
      if (!dayMatches) continue;
    }

    // Generate specific candidate windows within this availability slot
    // Refinement 2: Edge + Midpoint Aligned Placements
    const candidateWindows: TemporalWindow[] = [];

    // 1. Start-aligned
    candidateWindows.push(createTemporalWindow(
      availWindow.startMinute, 
      (availWindow.startMinute + duration) % 1440 || 1440
    ));

    // 2. End-aligned
    if (availWindow.durationMinutes > duration) {
      let start = availWindow.endMinute - duration;
      if (start < 0) start += 1440; // Wrap around safely backwards
      candidateWindows.push(createTemporalWindow(start, availWindow.endMinute));
    }

    // 3. Midpoint-aligned
    if (availWindow.durationMinutes > duration * 1.5) {
      const midPointOffset = Math.floor((availWindow.durationMinutes - duration) / 2);
      let start = availWindow.startMinute + midPointOffset;
      start = start >= 1440 ? start % 1440 : start;
      candidateWindows.push(createTemporalWindow(
        start, 
        (start + duration) % 1440 || 1440
      ));
    }

    // 4. Rolling Stride (every 30 mins)
    const stride = 30;
    let currentStart = availWindow.startMinute + stride;
    while (true) {
      const currentEnd = currentStart + duration;
      // Calculate linear distance from start of avail to current end to avoid wrapping logic in loop bound
      const distanceCovered = currentEnd - availWindow.startMinute; 
      
      // Stop if the next window would exceed the availability duration
      if (distanceCovered >= availWindow.durationMinutes) {
        break;
      }
      
      const realStart = currentStart >= 1440 ? currentStart % 1440 : currentStart;
      const realEnd = (realStart + duration) % 1440 || 1440;
      
      candidateWindows.push(createTemporalWindow(realStart, realEnd));
      currentStart += stride;
    }

    // 5. Inject preferredTimeWindows if they fit in this availability slot
    if (task.preferredTimeWindows && task.preferredTimeWindows.length > 0) {
      for (const pref of task.preferredTimeWindows) {
        if (temporalWindowContains(availWindow, pref)) {
          candidateWindows.push(pref);
        }
      }
    }

    // Deduplicate candidate windows based on start time
    const uniqueCandidates = new Map<number, TemporalWindow>();
    for (const w of candidateWindows) {
      uniqueCandidates.set(w.startMinute, w);
    }

    for (const dayOfWeek of avail.daysOfWeek) {
      for (const w of Array.from(uniqueCandidates.values())) {
        const placement = evaluatePlacement(task, w, dayOfWeek, avail, context);
        if (placement) {
          const validation = validateCandidatePlacement(placement, task, context);
          if (validation.valid) {
            if (validation.warnings.length > 0) {
              placement.reasoning.push(...validation.warnings.map((w: any) => w.message));
            }
            candidates.push(placement);
          }
        }
      }
    }
  }

  // Sort by score, then preference ratio, then confidence, then fragmentation risk (lower is better)
  candidates.sort((a, b) => {
    if (Math.abs(a.placementScore - b.placementScore) > 0.05) {
      return b.placementScore - a.placementScore;
    }
    if (Math.abs(a.confidence - b.confidence) > 0.05) {
      return b.confidence - a.confidence;
    }
    if (Math.abs(a.metadata.fragmentationRisk - b.metadata.fragmentationRisk) > 0.05) {
      return a.metadata.fragmentationRisk - b.metadata.fragmentationRisk;
    }
    // Chronological tie-break (critical for packing sequential chunks)
    return a.temporalWindow.startMinute - b.temporalWindow.startMinute;
  });

  // Refinement 3: Placement Density Limits
  return candidates.slice(0, MAX_PLACEMENTS_PER_TASK);
}

function evaluatePlacement(
  task: SchedulableUnit,
  window: TemporalWindow,
  dayOfWeek: number,
  avail: AvailabilityWindow,
  context: PlacementAnalysisContext
): CandidatePlacement | null {
  const penalties: string[] = [];
  const boosts: string[] = [];
  const blocking: string[] = [];
  const reasoning: string[] = [];

  // 1. Hard Constraints Validation
  for (const constraint of context.recurringConstraints) {
    if (!constraint.daysOfWeek?.includes(dayOfWeek)) continue;
    
    const overlap = calculateTemporalOverlap(window, constraint.window).overlapMinutes;
    if (overlap > 0 && constraint.constraintType === "hard") {
      blocking.push("hard_constraint_overlap");
      return null; // Invalid placement
    }
  }

  // hardConstraints is always defined post-normalization (guaranteed [] fallback)
  for (const hc of task.hardConstraints) {
    if (calculateTemporalOverlap(window, hc).overlapMinutes > 0) {
      blocking.push("task_hard_constraint_overlap");
      return null; // Invalid placement
    }
  }

  // softConstraints is always defined post-normalization (guaranteed [] fallback)
  let softConstraintPenalty = 0;
  for (const sc of task.softConstraints) {
    const overlap = calculateTemporalOverlap(window, sc).overlapMinutes;
    if (overlap > 0) {
      softConstraintPenalty += (overlap / window.durationMinutes) * 0.3;
      penalties.push("task_soft_constraint_overlap");
    }
  }
  softConstraintPenalty = clamp(softConstraintPenalty);

  // 1b. Preferred Time Windows Alignment
  let preferenceScoreBoost = 0;
  let preferenceRatio = 0;
  if (task.preferredTimeWindows && task.preferredTimeWindows.length > 0) {
    let matchesPref = false;
    for (const pref of task.preferredTimeWindows) {
      const overlap = calculateTemporalOverlap(window, pref).overlapMinutes;
      if (overlap > 0) {
        matchesPref = true;
        // The closer to exact match, the higher the boost
        preferenceRatio = overlap / window.durationMinutes;
        preferenceScoreBoost = preferenceRatio * 1.5; // Massive boost to dominate ranking
        boosts.push("preferred_time_window");
        break;
      }
    }
    if (!matchesPref) {
      penalties.push("misses_preferred_time");
    }
  }

  // 2. Focus Alignment
  let focusAlignment = 0;
  for (const f of context.peakFocusWindows) {
    const overlap = calculateTemporalOverlap(window, f.window).overlapMinutes;
    if (overlap > 0) {
      focusAlignment += (overlap / window.durationMinutes) * f.score;
    }
  }
  focusAlignment = clamp(focusAlignment);

  let deepWorkScore = 0;
  if (task.requiresDeepWork) {
    if (focusAlignment > 0.5) {
      boosts.push("deep_work_focus_alignment");
      deepWorkScore = 1.0;
    } else {
      penalties.push("deep_work_outside_focus");
      deepWorkScore = -0.5;
    }
  }

  // 3. Recovery Pressure
  let recoveryConflict = 0;
  for (const r of context.recoveryWindows) {
    const overlap = calculateTemporalOverlap(window, r.window).overlapMinutes;
    if (overlap > 0) {
      const penalty = (overlap / window.durationMinutes) * r.recoveryPenalty;
      recoveryConflict += penalty;
      penalties.push(`recovery_overlap_${r.trigger}`);
    }
  }
  recoveryConflict = clamp(recoveryConflict);
  
  if (recoveryConflict > 0.4) {
    blocking.push("excessive_recovery_conflict");
    return null;
  }

  // 4. Sleep Proximity
  let sleepProximityPenalty = 0;
  if (context.sleepWindow) {
    const dist = distanceBetweenTemporalWindows(window, context.sleepWindow.window);
    if (dist < 60) {
      // Proximity penalty (e.g. winding down)
      const penalty = (60 - dist) / 60 * 0.4;
      sleepProximityPenalty = penalty;
      penalties.push("sleep_proximity");
    }
  }

  // 5. Fragmentation
  // A higher fragmentationScore context means we should penalize short tasks scattered around
  const fragmentationRisk = context.fragmentationScore * 0.2;

  // 6. Stability Score (Refinement 4)
  // High stability = far from constraints, low recovery conflict, high avail score
  let constraintProximityScore = 1.0;
  for (const constraint of context.recurringConstraints) {
    if (!constraint.daysOfWeek?.includes(dayOfWeek)) continue;
    const dist = distanceBetweenTemporalWindows(window, constraint.window);
    if (dist < 60) {
      constraintProximityScore *= (dist / 60); // Reduces stability near constraints
    }
  }
  
  const stabilityScore = clamp(
    (constraintProximityScore * 0.4) + 
    ((1.0 - recoveryConflict) * 0.3) + 
    ((1.0 - sleepProximityPenalty) * 0.3)
  );

  // Compile final score
  const baseAvailability = avail.score;
  const placementScore = clamp(
    baseAvailability * 0.3 +
    task.priorityScore * 0.15 +
    focusAlignment * 0.25 +
    deepWorkScore * 0.2 -
    recoveryConflict * 0.3 -
    sleepProximityPenalty * 0.25 -
    softConstraintPenalty * 0.2 -
    fragmentationRisk * 0.15 +
    preferenceScoreBoost
  );

  // Reject strictly terrible placements
  if (placementScore < MINIMUM_PLACEMENT_SCORE) {
    return null;
  }

  // Determine Placement Type (Refinement 5)
  let placementType: PlacementType = "optimal";
  if (placementScore < 0.4) {
    placementType = "fallback";
  } else if (focusAlignment > 0.6) {
    placementType = "focus_aligned";
  } else if (recoveryConflict === 0 && task.energyRequirement && task.energyRequirement < 0.3) {
    placementType = "low_energy";
  } else if (recoveryConflict === 0) {
    placementType = "recovery_safe";
  }

  // Explainability
  if (placementType === "optimal") reasoning.push("high_overall_suitability");
  if (placementType === "focus_aligned") reasoning.push("strong_focus_overlap");
  if (placementType === "recovery_safe") reasoning.push("minimal_recovery_pressure");
  if (deepWorkScore > 0) reasoning.push("deep_work_window_match");
  
  // Ensure reasoning is never empty for valid placement
  if (reasoning.length === 0) reasoning.push("valid_fallback_placement");

  // Confidence Propagation
  const conf = propagateConfidence({
    components: [
      { name: "availability", value: avail.confidence, weight: 0.5 },
      { name: "task_duration", value: 0.8, weight: 0.3 }, // Assumption: duration has 80% certainty 
      { name: "stability", value: stabilityScore, weight: 0.2 },
    ],
    cap: 0.9,
    penaltyMultiplier: context.dataReliabilityScore,
    label: "candidate_placement"
  });

  return {
    taskId: task.id,
    dayOfWeek,
    temporalWindow: window,
    placementScore: Number(placementScore.toFixed(3)),
    confidence: Number(conf.finalConfidence.toFixed(3)),
    stabilityScore: Number(stabilityScore.toFixed(3)),
    placementType,
    penaltiesApplied: [...new Set(penalties)],
    boostsApplied: [...new Set(boosts)],
    blockingReasons: [...new Set(blocking)],
    reasoning: [...new Set(reasoning)],
    metadata: {
      focusAlignment: Number(focusAlignment.toFixed(3)),
      recoveryConflict: Number(recoveryConflict.toFixed(3)),
      fragmentationRisk: Number(fragmentationRisk.toFixed(3)),
      chronotypeAlignment: 0, // Placeholder
      deepWorkScore: Number(deepWorkScore.toFixed(3)),
    }
  };
}
