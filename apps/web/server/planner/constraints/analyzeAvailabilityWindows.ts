import { clamp } from "../utils/statistics";
import {
  createTemporalWindow, tryCreateTemporalWindow, TemporalWindow,
  calculateTemporalOverlap, temporalWindowAdjacent,
  mergeTemporalWindows, formatTemporalWindow,
  createSleepWakeWindow,
} from "../utils/TemporalWindow";
import { propagateConfidence } from "../utils/confidencePropagation";

const AVAILABILITY_CONFIDENCE_CAP = 0.85;

/**
 * Scores 168 rolling 1-hour availability windows (7 days × 24 hours).
 *
 * INTERVAL SEMANTICS: All windows use half-open [start, end).
 *   Hour h → [h*60, h*60+60)
 *   End-of-day hour 23 → [1380, 1440)
 *
 * FIX 5/Section 4: All overlap uses calculateTemporalOverlap().
 * FIX 9/Section 2: Merge uses mergeTemporalWindows() + temporalWindowAdjacent().
 * Section 6: Confidence via propagateConfidence().
 *
 * SCALABILITY TODOs (Section 16):
 *   TODO(interval-tree): Replace O(n) constraint scan per window with O(log n) query.
 *   TODO(multi-week): Extend to { weekOffset, dayOfWeek, window } tuples.
 *   TODO(realtime): Add invalidation tokens for incremental tree rebuilds.
 *   TODO(stochastic): Add confidence-width to windows for probabilistic packing.
 */
export async function analyzeAvailabilityWindows(
  recurringConstraints: any[],
  commutePatterns: any,
  behavioralProfileData: any,
  recoveryWindows: any[],
  chronotype: { type: string; confidence: number } | null,
  dataReliabilityScore: number
) {
  // Pre-index constraints by day of week for O(1) lookup per window
  // TODO(interval-tree): replace this with an interval tree per day
  const constraintsByDay: Record<number, Array<{ window: TemporalWindow; constraintStrength: number }>> = {};
  for (const c of recurringConstraints) {
    const w = tryCreateTemporalWindow(c.startMinute, c.endMinute);
    if (!w) continue;
    for (const day of (c.daysOfWeek ?? [])) {
      if (!constraintsByDay[day]) constraintsByDay[day] = [];
      constraintsByDay[day].push({ window: w, constraintStrength: c.constraintStrength ?? 0.5 });
    }
  }

  // Pre-build recovery windows
  const recoveryWindowObjects: Array<{ window: TemporalWindow; recoveryPenalty: number; trigger: string }> = [];
  for (const r of recoveryWindows) {
    const w = tryCreateTemporalWindow(r.startMinute, r.endMinute);
    if (w) recoveryWindowObjects.push({ window: w, recoveryPenalty: r.recoveryPenalty, trigger: r.trigger });
  }

  // Pre-build peak focus windows
  const peakFocusObjects: Array<{ window: TemporalWindow; score: number }> = [];
  for (const f of (behavioralProfileData?.peakFocusWindows ?? [])) {
    const w = tryCreateTemporalWindow(f.startMinute, f.endMinute);
    if (w && f.score > 0.5) peakFocusObjects.push({ window: w, score: f.score });
  }

  // Derive window-level confidence using centralized propagation
  const behavioralConf = behavioralProfileData?.wakeWindow?.confidence ?? 0;
  const constraintConf = recurringConstraints.length > 0
    ? recurringConstraints.reduce((s: number, c: any) => s + (c.confidence ?? 0), 0) / recurringConstraints.length : 0;
  const recoveryConf   = recoveryWindows.length > 0
    ? recoveryWindows.reduce((s: number, r: any) => s + (r.confidence ?? 0), 0) / recoveryWindows.length : 0;
  const chronotypeConf = chronotype?.confidence ?? 0;

  const windowConf = propagateConfidence({
    components: [
      { name: "behavioral",  value: behavioralConf,  weight: 0.35 },
      { name: "constraint",  value: constraintConf,  weight: 0.35 },
      { name: "recovery",    value: recoveryConf,    weight: 0.15 },
      { name: "chronotype",  value: chronotypeConf,  weight: 0.15 },
    ],
    cap: AVAILABILITY_CONFIDENCE_CAP,
    penaltyMultiplier: dataReliabilityScore,
    label: "availabilityWindows",
  });
  const windowConfidence = windowConf.finalConfidence;

  const isNightOwl  = chronotype?.type === "night" && (chronotype?.confidence ?? 0) >= 0.35;
  const sleepAvg    = behavioralProfileData?.sleepWindow?.averageMinutes ?? null;
  const wakeAvg     = behavioralProfileData?.wakeWindow?.averageMinutes  ?? null;
  // Section 3: use canonical helper — no inline wrap arithmetic
  const sleepWindow = (sleepAvg !== null && wakeAvg !== null)
    ? createSleepWakeWindow(sleepAvg, wakeAvg)
    : null;

  const allWindows: any[] = [];

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const dayConstraints = constraintsByDay[dayOfWeek] ?? [];

    for (let hour = 0; hour < 24; hour++) {
      const startMinute = hour * 60;
      const endMinute   = hour === 23 ? 1440 : hour * 60 + 60; // half-open; hour 23 → [1380,1440)
      const hourWindow  = createTemporalWindow(startMinute, endMinute);

      let score = 1.0;
      const penaltiesApplied: string[] = [];
      const boostsApplied:    string[] = [];
      const blockingReasons:  string[] = [];

      // 1. Recurring constraint overlap
      for (const c of dayConstraints) {
        const { overlapMinutes } = calculateTemporalOverlap(hourWindow, c.window);
        if (overlapMinutes > 0) {
          score -= c.constraintStrength * (overlapMinutes / 60);
          penaltiesApplied.push("constraint_overlap");
          if (c.constraintStrength > 0.7) blockingReasons.push("high_strength_recurring_block");
        }
      }

      // 2. Sleep window penalty
      if (sleepWindow) {
        const { overlapMinutes } = calculateTemporalOverlap(hourWindow, sleepWindow);
        if (overlapMinutes > 0) {
          if (isNightOwl && startMinute >= 22 * 60) {
            boostsApplied.push("night_owl_chronotype_protection");
          } else {
            score -= 0.85 * (overlapMinutes / 60);
            penaltiesApplied.push("sleep_window_penalty");
            blockingReasons.push("sleep_window");
          }
        }
      }

      // 3. Commute proximity
      if (commutePatterns?.averageLeaveMinute !== null && (commutePatterns?.confidence ?? 0) > 0.1) {
        const leaveWindow = tryCreateTemporalWindow(
          Math.max(0, commutePatterns.averageLeaveMinute - 60),
          commutePatterns.averageLeaveMinute
        );
        if (leaveWindow) {
          const { overlapMinutes } = calculateTemporalOverlap(hourWindow, leaveWindow);
          if (overlapMinutes > 0) {
            score -= 0.35 * (overlapMinutes / 60);
            penaltiesApplied.push("commute_proximity_penalty");
            blockingReasons.push("pre_commute_window");
          }
        }
      }

      // 4. Recovery window penalties
      for (const r of recoveryWindowObjects) {
        const { overlapMinutes } = calculateTemporalOverlap(hourWindow, r.window);
        if (overlapMinutes > 0) {
          score -= Math.min(0.5, r.recoveryPenalty * (overlapMinutes / 60));
          penaltiesApplied.push("recovery_window_penalty");
          blockingReasons.push(`post_${r.trigger}_recovery`);
        }
      }

      // 5. Peak focus boost
      for (const f of peakFocusObjects) {
        const { overlapMinutes } = calculateTemporalOverlap(hourWindow, f.window);
        if (overlapMinutes > 0) {
          score += f.score * 0.25 * (overlapMinutes / 60);
          boostsApplied.push("peak_focus_boost");
        }
      }

      score = clamp(score);
      if (score <= 0.15) continue;

      allWindows.push({
        startMinute: hourWindow.startMinute,
        endMinute:   hourWindow.endMinute,
        daysOfWeek:  [dayOfWeek],
        score:       Number(score.toFixed(3)),
        confidence:  Number(windowConfidence.toFixed(3)),
        sourceSignals: ["rolling_hour_window", `hour:${hour}`],
        penaltiesApplied: [...new Set(penaltiesApplied)],
        boostsApplied:    [...new Set(boostsApplied)],
        blockingReasons:  [...new Set(blockingReasons)],
      });
    }
  }

  // Merge adjacent same-penalty windows using TemporalWindow algebra
  const merged: any[] = [];
  for (let day = 0; day < 7; day++) {
    const dayWindows = allWindows
      .filter(w => w.daysOfWeek[0] === day)
      .sort((a, b) => a.startMinute - b.startMinute);
    if (!dayWindows.length) continue;

    let current = { ...dayWindows[0] };
    for (let i = 1; i < dayWindows.length; i++) {
      const next = dayWindows[i];

      const scoresClose    = Math.abs(current.score - next.score) < 0.10;
      const penaltiesMatch = JSON.stringify([...current.penaltiesApplied].sort()) === JSON.stringify([...next.penaltiesApplied].sort());
      const boostsMatch    = JSON.stringify([...current.boostsApplied].sort())    === JSON.stringify([...next.boostsApplied].sort());
      const blockingMatch  = JSON.stringify([...current.blockingReasons].sort())  === JSON.stringify([...next.blockingReasons].sort());

      const wa = tryCreateTemporalWindow(current.startMinute, current.endMinute);
      const wb = tryCreateTemporalWindow(next.startMinute,    next.endMinute);

      const canMerge = wa && wb &&
        temporalWindowAdjacent(wa, wb) &&
        scoresClose && penaltiesMatch && boostsMatch && blockingMatch;

      if (canMerge) {
        const merged_ = mergeTemporalWindows(wa!, wb!);
        current = {
          ...current,
          startMinute: merged_.startMinute,
          endMinute:   merged_.endMinute,
          score: Number(((current.score + next.score) / 2).toFixed(3)),
        };
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
  }

  return merged;
}
