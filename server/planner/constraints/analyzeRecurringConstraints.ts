import { Task } from "@/server/db/models/Task";
import { getLocalDateString } from "../utils/dateHelpers";
import { User } from "@/server/db/models/User";
import { applyTemporalDecay, clamp } from "../utils/statistics";
import {
  createTemporalWindow, tryCreateTemporalWindow,
  calculateTemporalOverlap, temporalWindowAdjacent,
  mergeTemporalWindows, subtractTemporalWindows,
  formatTemporalWindow, dateToLocalMinutes,
} from "../utils/TemporalWindow";
import { basicConfidence } from "../utils/confidencePropagation";

const CONSTRAINT_CONFIDENCE_CAP = 0.65;
const MIN_CLUSTER_SIZE = 3;
const MIN_TEMPORAL_SPREAD_DAYS = 7;

/**
 * Detects recurring occupied time blocks from task completion history.
 *
 * LABEL POLICY: Types are NEVER semantic ("university", "work").
 * INTERVAL SEMANTICS: All internal windows use half-open [start, end).
 * CONFIDENCE: Uses centralised propagateConfidence() — no custom formula.
 */
export async function analyzeRecurringConstraints(userId: string) {
  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  const tasks = await Task.find({ userId, status: "completed", completedAt: { $ne: null } })
    .select("title completedAt metadata recurringParentId dueDate dueTime priority")
    .sort({ completedAt: 1 })
    .lean();

  if (!tasks || tasks.length === 0) return [];

  // Cluster by recurringParentId first, then by exact title
  const clusters: Record<string, typeof tasks> = {};
  for (const task of tasks) {
    const key = (task as any).recurringParentId
      ? `rec_${(task as any).recurringParentId}`
      : `title_${(task.title || "").trim().toLowerCase()}`;
    if (!clusters[key]) clusters[key] = [];
    clusters[key].push(task);
  }

  const recurringConstraints: any[] = [];
  const today = new Date();

  for (const [key, clusterTasks] of Object.entries(clusters)) {
    if (clusterTasks.length < MIN_CLUSTER_SIZE) continue;

    // --- 1. Temporal spread check ---
    const timestamps = clusterTasks
      .map(t => new Date((t as any).completedAt).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);
    if (timestamps.length < MIN_CLUSTER_SIZE) continue;

    const temporalSpreadDays = Math.floor((timestamps[timestamps.length - 1] - timestamps[0]) / 86400000);
    const spreadScore = temporalSpreadDays < MIN_TEMPORAL_SPREAD_DAYS
      ? temporalSpreadDays / MIN_TEMPORAL_SPREAD_DAYS
      : 1;

    // --- 2. Per-occurrence data with temporal decay ---
    const startMinutes: number[] = [];
    const endMinutes: number[] = [];
    const durations: number[] = [];
    const daysEncountered = new Set<number>();
    let hasScheduledBounds = 0;
    let lateBoundaryCount  = 0;
    let totalDecayWeight   = 0;

    for (const task of clusterTasks) {
      const t = task as any;
      const completedAt = new Date(t.completedAt);
      if (isNaN(completedAt.getTime())) continue;

      const daysOld = (today.getTime() - completedAt.getTime()) / 86400000;
      const decayWeight = applyTemporalDecay(daysOld);
      totalDecayWeight += decayWeight;

      const localDateStr = getLocalDateString(completedAt, timezone);
      const localDayOfWeek = new Date(localDateStr + "T00:00:00Z").getUTCDay();
      daysEncountered.add(localDayOfWeek);

      // Half-open: endMinute = completedAt minute, startMinute = endMinute - duration
      const endMin = completedAt.getHours() * 60 + completedAt.getMinutes();
      endMinutes.push(endMin);

      if (endMin > 23 * 60) lateBoundaryCount++;

      const duration = Math.min(240, Math.max(15, t.metadata?.estimatedDuration ?? 60));
      durations.push(duration);
      startMinutes.push(Math.max(0, endMin - duration));

      if (t.dueTime) hasScheduledBounds++;
    }

    if (daysEncountered.size === 0 || startMinutes.length < MIN_CLUSTER_SIZE) continue;

    const avgStart = Math.round(startMinutes.reduce((a, b) => a + b, 0) / startMinutes.length);
    const avgEnd   = Math.min(1440, Math.round(endMinutes.reduce((a, b) => a + b, 0) / endMinutes.length));

    // Validate as a TemporalWindow
    const constraintWindow = tryCreateTemporalWindow(avgStart, avgEnd === avgStart ? avgEnd + 1 : avgEnd);
    if (!constraintWindow) continue;

    const { calculateVariance, clampMinutes } = await import("../utils/statistics");
    const startVariance    = calculateVariance(startMinutes);
    const durationVariance = calculateVariance(durations);

    // --- 3. Completion time reliability (FIX 4 corrected) ---
    const scheduledRatio    = hasScheduledBounds / clusterTasks.length;
    const lateBoundaryRatio = lateBoundaryCount  / clusterTasks.length;
    const varianceReliability = startVariance <= 3600 * 2 ? 1.0 : 0.5;

    const completionTimeReliability = clamp(
      scheduledRatio          * 0.5 +
      (1 - lateBoundaryRatio) * 0.3 +
      varianceReliability     * 0.2
    );

    // --- 4. Confidence via centralized propagation ---
    const { propagateConfidence } = await import("../utils/confidencePropagation");
    const confResult = propagateConfidence({
      components: [
        { name: "patternStrength",  value: Math.exp(-startVariance / (3600 * 2)), weight: 0.4 },
        { name: "sampleSupport",    value: Math.min(clusterTasks.length / 10, 1), weight: 0.3 },
        { name: "temporalSpread",   value: spreadScore,                             weight: 0.2 },
        { name: "timingReliability",value: completionTimeReliability,               weight: 0.1 },
      ],
      cap: CONSTRAINT_CONFIDENCE_CAP,
      label: `recurringConstraint_${key}`,
    });

    if (confResult.finalConfidence < 0.15) continue;

    const stabilityScore     = clamp(Math.exp(-startVariance    / (3600 * 2)));
    const constraintStrength = clamp(Math.exp(-durationVariance / (225  * 2)));

    const signals: string[] = [
      key.startsWith("rec_") ? "scheduled_recurring" : "inferred_recurring",
      `cluster_size:${clusterTasks.length}`,
      `temporal_spread_days:${temporalSpreadDays}`,
      `window:${formatTemporalWindow(constraintWindow)}`,
    ];
    if (completionTimeReliability < 0.5) signals.push("completion_time_only_low_reliability");
    if (varianceReliability < 1)        signals.push("high_start_time_variance_penalty");
    if (confResult.hasWeakSignal)       signals.push("weak_signal_detected");

    recurringConstraints.push({
      type: key.startsWith("rec_") ? "scheduled_recurring" : "inferred_recurring",
      startMinute: constraintWindow.startMinute,
      endMinute:   constraintWindow.endMinute,
      daysOfWeek:  Array.from(daysEncountered),
      confidence:  confResult.finalConfidence,
      variance:    Number(startVariance.toFixed(1)),
      stabilityScore:            Number(stabilityScore.toFixed(3)),
      constraintStrength:        Number(constraintStrength.toFixed(3)),
      completionTimeReliability: Number(completionTimeReliability.toFixed(3)),
      temporalSpreadDays,
      sourceSignals: signals,
      _confidenceBreakdown: confResult.breakdown, // explainability
    });
  }

  return recurringConstraints;
}
