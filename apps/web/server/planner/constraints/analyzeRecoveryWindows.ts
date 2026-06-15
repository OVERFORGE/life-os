import { DailyLog } from "@/server/db/models/DailyLog";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { getLocalDateString } from "../utils/dateHelpers";
import { User } from "@/server/db/models/User";
import { applyTemporalDecay } from "../utils/statistics";
import {
  createTemporalWindow, tryCreateTemporalWindow,
  formatTemporalWindow, dateToLocalMinutes,
} from "../utils/TemporalWindow";
import { propagateConfidence } from "../utils/confidencePropagation";

/**
 * Analyzes forward causal recovery patterns from actual strain timestamps.
 *
 * INTERVAL SEMANTICS: All windows are half-open [start, end).
 *
 * FIX 1: No synthetic strainEndProxy. Windows anchor only to actual timestamps.
 * FIX 3: Only same_day / next_day lag — no fake intra-day lag claims.
 * FIX 6: Returns rawPatternStrength + sampleSupport. Orchestrator applies reliability.
 * FIX 13: Uses propagateConfidence() — no custom formula.
 */
export async function analyzeRecoveryWindows(userId: string): Promise<{
  recoveryWindows: any[];
  rawPatternStrength: number;
  sampleSupport: number;
  sourceSignals: string[];
}> {
  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  const [logs, workouts] = await Promise.all([
    DailyLog.find({ userId })
      .select("date energy deepWorkHours stressLevel")
      .sort({ date: -1 }).limit(90).lean(),
    WorkoutSession.find({ userId })
      .select("date duration endTime")
      .sort({ date: -1 }).limit(90).lean(),
  ]);

  if (logs.length < 7) {
    return {
      recoveryWindows: [], rawPatternStrength: 0, sampleSupport: 0,
      sourceSignals: ["insufficient_log_data_for_recovery_analysis"],
    };
  }

  const logMap: Record<string, { energy: number; deepWork: number; stress: number }> = {};
  for (const log of logs) {
    const l = log as any;
    const dateStr = getLocalDateString(new Date(l.date), timezone);
    logMap[dateStr] = { energy: l.energy ?? 5, deepWork: l.deepWorkHours ?? 0, stress: l.stressLevel ?? 3 };
  }

  const workoutEndMinuteMap: Record<string, number> = {};
  for (const w of workouts) {
    const ww = w as any;
    const dateStr = getLocalDateString(new Date(ww.date), timezone);
    if (ww.endTime) {
      const endDate = new Date(ww.endTime);
      if (!isNaN(endDate.getTime())) {
        workoutEndMinuteMap[dateStr] = dateToLocalMinutes(endDate, timezone);
      }
    }
  }

  const dateKeys = Object.keys(logMap).sort();

  const STRAIN_TRIGGERS = [
    { key: "deep_work_overload", isStrain: (d: { energy: number; deepWork: number; stress: number }, _: string) => d.deepWork >= 4 },
    { key: "post_gym",           isStrain: (_: any, dateStr: string) => dateStr in workoutEndMinuteMap },
    { key: "high_stress",        isStrain: (d: { energy: number; deepWork: number; stress: number }, _: string) => d.stress >= 7 },
  ];

  const recoveryWindows: any[] = [];
  let maxPatternStrength = 0;
  let totalChecks = 0;

  for (const trigger of STRAIN_TRIGGERS) {
    for (const lag of ["same_day", "next_day"] as const) {
      let hits = 0, checks = 0;
      let anchorMinuteSum = 0, anchorCount = 0;

      for (let i = 0; i < dateKeys.length; i++) {
        const dateStr = dateKeys[i];
        const currentLog = logMap[dateStr];
        if (!currentLog) continue;
        if (!trigger.isStrain(currentLog, dateStr)) continue;

        const targetDateStr = lag === "same_day" ? dateStr : dateKeys[i + 1];
        if (!targetDateStr) continue;
        const targetLog = logMap[targetDateStr];
        if (!targetLog) continue;

        checks++;
        if (targetLog.energy <= 4) hits++;

        if (trigger.key === "post_gym" && workoutEndMinuteMap[dateStr]) {
          anchorMinuteSum += workoutEndMinuteMap[dateStr];
          anchorCount++;
        }
      }

      if (checks < 3) continue;

      const correlationStrength = hits / checks;
      if (correlationStrength <= 0.5) continue;

      totalChecks += checks;

      // Determine window boundaries (half-open)
      let windowStart: number;
      let windowEnd:   number;
      let anchoredToTimestamp = false;

      if (anchorCount > 0) {
        // Anchored to actual workout end + 15-min buffer
        windowStart = Math.min(1439, Math.round(anchorMinuteSum / anchorCount) + 15);
        windowEnd   = Math.min(1440, windowStart + 120);
        anchoredToTimestamp = true;
      } else if (lag === "next_day") {
        // Next-day recovery: 00:00–08:00
        windowStart = 0;
        windowEnd   = 480;
      } else {
        // Same-day with no timestamp anchor — cannot invent window
        continue;
      }

      const recoveryWindow = tryCreateTemporalWindow(windowStart, windowEnd);
      if (!recoveryWindow) continue;

      const confResult = propagateConfidence({
        components: [
          { name: "correlationStrength", value: correlationStrength,                            weight: 0.5 },
          { name: "sampleSupport",       value: Math.min(hits / 10, 1),                        weight: 0.3 },
          { name: "anchorQuality",       value: anchoredToTimestamp ? 0.8 : 0.3,               weight: 0.2 },
        ],
        cap: 0.75,
        label: `recovery_${trigger.key}_${lag}`,
      });

      maxPatternStrength = Math.max(maxPatternStrength, confResult.finalConfidence);

      const recoveryPenalty = Math.min(0.5, correlationStrength * 0.6);

      recoveryWindows.push({
        startMinute: recoveryWindow.startMinute,
        endMinute:   recoveryWindow.endMinute,
        trigger:     trigger.key,
        lagMinutes:  lag === "next_day" ? 1440 : 0,
        recoveryPenalty: Number(recoveryPenalty.toFixed(3)),
        confidence:      confResult.finalConfidence,
        sourceSignals: [
          "forward_causal_chain_analysis", lag,
          `supporting_days:${hits}`,
          `correlation:${correlationStrength.toFixed(2)}`,
          anchoredToTimestamp ? "real_timestamp_anchor" : "next_day_boundary_only",
          `window:${formatTemporalWindow(recoveryWindow)}`,
        ],
        _confidenceBreakdown: confResult.breakdown,
      });
    }
  }

  const sampleSupport = Math.min(1, totalChecks / 20);

  return {
    recoveryWindows,
    rawPatternStrength: Number(maxPatternStrength.toFixed(3)),
    sampleSupport:      Number(sampleSupport.toFixed(3)),
    sourceSignals: [
      `triggers_found:${recoveryWindows.length}`,
      "same_day_and_next_day_lag_only",
      "half_open_interval_semantics",
    ],
  };
}
