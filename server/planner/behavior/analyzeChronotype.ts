import { DailyLog } from "@/server/db/models/DailyLog";
import { getLocalDateString } from "../utils/dateHelpers";
import { User } from "@/server/db/models/User";
import { applyTemporalDecay, clamp } from "../utils/statistics";
import { dateToLocalMinutes } from "../utils/TemporalWindow";

/**
 * FIX 11: Chronotype confidence CAPPED at 0.45 until true per-day focus windows exist.
 *
 * Why 0.45: peakFocusWindows are still global aggregates. Comparing every day against
 * the same global window means we're measuring "how this day's energy aligns with the
 * average pattern" — not "what time this specific day was actually most productive."
 * That distinction requires per-day completed-task timestamps or stored daily focus data.
 *
 * FIX 11 (preferred per-day inference): Each day's peak productivity is inferred from
 * the hour with the highest density of completed HIGH-cognitive tasks.
 *
 * FIX 13: Returns rawPatternStrength + sampleSupport separately.
 * Orchestrator combines with reliability score.
 */

const CHRONOTYPE_CONFIDENCE_CAP = 0.45; // FIX 11: capped until per-day focus windows exist
const CHRONOTYPE_MIN_CONFIDENCE = 0.25;

export async function analyzeChronotype(
  userId: string,
  wakeAverageMinutes: number | null,
  sleepAverageMinutes: number | null,
  peakFocusWindows: Array<{ startMinute: number; endMinute: number; score: number }>
) {
  if (wakeAverageMinutes === null || sleepAverageMinutes === null) {
    return {
      type: "unknown", confidence: 0,
      peakProductiveMinutes: [],
      rawPatternStrength: 0, sampleSupport: 0,
      sourceSignals: ["missing_wake_sleep_windows"],
    };
  }

  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  // FIX 11: Fetch tasks with completedAt to infer per-day productive peaks
  const { Task } = await import("@/server/db/models/Task");
  const [logs, tasks] = await Promise.all([
    DailyLog.find({ userId, energy: { $ne: null } })
      .select("date energy deepWorkHours wakeTime")
      .sort({ date: -1 })
      .limit(90)
      .lean(),
    Task.find({ userId, status: "completed", completedAt: { $ne: null } })
      .select("completedAt priority metadata category")
      .sort({ completedAt: -1 })
      .limit(500)
      .lean(),
  ]);

  if (logs.length < 5) {
    return {
      type: "unknown", confidence: 0,
      peakProductiveMinutes: [],
      rawPatternStrength: 0, sampleSupport: 0,
      sourceSignals: ["insufficient_energy_log_data"],
    };
  }

  // Build per-day task density map (hour → cognitive weight)
  const today = new Date();
  const dailyTaskHours: Record<string, Record<number, number>> = {};

  for (const task of tasks) {
    const t = task as any;
    const completedAt = new Date(t.completedAt);
    if (isNaN(completedAt.getTime())) continue;

    const dateStr = getLocalDateString(completedAt, timezone);
    const localMinute = dateToLocalMinutes(completedAt, timezone);
    const hour = Math.floor(localMinute / 60);

    if (!dailyTaskHours[dateStr]) dailyTaskHours[dateStr] = {};

    // Cognitive weight: high-priority or long tasks weigh more
    let weight = 1.0;
    if (t.priority === "high" || t.priority === "urgent") weight += 1.0;
    if (t.metadata?.energyCost > 6) weight += 0.5;

    dailyTaskHours[dateStr][hour] = (dailyTaskHours[dateStr][hour] ?? 0) + weight;
  }

  const signals: string[] = [
    "per_day_evaluation_with_task_timestamps",
    "temporal_decay_applied",
    `log_days:${logs.length}`,
  ];

  let morningWeightTotal = 0;
  let nightWeightTotal = 0;
  let totalDecayWeight = 0;
  let daysWithTaskData = 0;
  let daysWithFocusWindowFallback = 0;

  for (const log of logs) {
    const l = log as any;
    const logDate = new Date(l.date);
    if (isNaN(logDate.getTime())) continue;

    const daysOld = (today.getTime() - logDate.getTime()) / 86400000;
    const decay = applyTemporalDecay(daysOld);
    const energy = l.energy ?? 5;
    const dateStr = getLocalDateString(logDate, timezone);

    // Per-day wake time
    let thisDayWakeMinute = wakeAverageMinutes;
    if (l.wakeTime && typeof l.wakeTime === "string") {
      const parts = l.wakeTime.split(":");
      if (parts.length === 2) {
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (!isNaN(h) && !isNaN(m)) thisDayWakeMinute = h * 60 + m;
      }
    }

    // FIX 11 OPTION A: Use per-day peak task hour if available
    const dayHours = dailyTaskHours[dateStr];
    let perDayPeakMinute: number | null = null;

    if (dayHours && Object.keys(dayHours).length > 0) {
      const peakHour = Object.entries(dayHours)
        .sort(([, a], [, b]) => b - a)[0];
      perDayPeakMinute = parseInt(peakHour[0], 10) * 60 + 30; // midpoint of peak hour
      daysWithTaskData++;
    }

    if (perDayPeakMinute !== null) {
      // TRUE per-day analysis: this day's peak vs this day's wake
      const hoursAfterWake = ((perDayPeakMinute - thisDayWakeMinute) + 1440) % 1440;
      const productivitySignal = clamp((energy / 10));
      const contribution = productivitySignal * decay;

      if (hoursAfterWake < 6 * 60) morningWeightTotal += contribution;
      else if (hoursAfterWake >= 12 * 60) nightWeightTotal += contribution;
      totalDecayWeight += contribution;
    } else {
      // FALLBACK: use global focus windows — heavily discounted (0.3×)
      // because this re-introduces the temporal collapse problem
      daysWithFocusWindowFallback++;
      for (const fw of peakFocusWindows) {
        if (fw.score < 0.5) continue;
        const peakMinute = (fw.startMinute + fw.endMinute) / 2;
        const hoursAfterWake = ((peakMinute - thisDayWakeMinute) + 1440) % 1440;
        const productivitySignal = clamp((energy / 10) * fw.score * 0.3); // 0.3x discount
        const contribution = productivitySignal * decay;

        if (hoursAfterWake < 6 * 60) morningWeightTotal += contribution;
        else if (hoursAfterWake >= 12 * 60) nightWeightTotal += contribution;
        totalDecayWeight += contribution;
      }
    }
  }

  if (daysWithFocusWindowFallback > 0) signals.push(`global_window_fallback_days:${daysWithFocusWindowFallback}_discounted_0.3x`);
  signals.push(`per_day_task_data_days:${daysWithTaskData}`);

  // FIX 13: separate sampleSupport from pattern strength
  const sampleSupport = Math.min(1, logs.length / 30);

  if (totalDecayWeight < 0.3) {
    return {
      type: "unknown", confidence: 0,
      peakProductiveMinutes: [],
      rawPatternStrength: 0, sampleSupport,
      sourceSignals: [...signals, "insufficient_weighted_signal"],
    };
  }

  const morningRatio = morningWeightTotal / totalDecayWeight;
  const nightRatio = nightWeightTotal / totalDecayWeight;

  let type: "morning" | "night" | "balanced" | "unknown" = "unknown";
  let rawPatternStrength = 0;

  if (morningRatio > 0.65) {
    type = "morning"; rawPatternStrength = morningRatio * 0.9;
  } else if (nightRatio > 0.65) {
    type = "night"; rawPatternStrength = nightRatio * 0.9;
  } else if (Math.abs(morningRatio - nightRatio) < 0.15) {
    type = "balanced"; rawPatternStrength = (1 - Math.abs(morningRatio - nightRatio)) * 0.5;
  } else {
    signals.push("chronotype_ambiguous");
  }

  // FIX 11: Hard cap at 0.45 until true per-day focus windows are implemented
  const confidence = Math.min(CHRONOTYPE_CONFIDENCE_CAP, rawPatternStrength);

  if (confidence < CHRONOTYPE_MIN_CONFIDENCE) {
    return {
      type: "unknown", confidence: 0,
      peakProductiveMinutes: peakFocusWindows.filter(w => w.score > 0.6).map(w => Math.round((w.startMinute + w.endMinute) / 2)),
      rawPatternStrength, sampleSupport,
      sourceSignals: [...signals, "confidence_below_classification_threshold"],
    };
  }

  return {
    type,
    confidence: Number(confidence.toFixed(3)),
    peakProductiveMinutes: peakFocusWindows.filter(w => w.score > 0.6).map(w => Math.round((w.startMinute + w.endMinute) / 2)),
    rawPatternStrength: Number(rawPatternStrength.toFixed(3)),
    sampleSupport: Number(sampleSupport.toFixed(3)),
    sourceSignals: signals,
  };
}
