import { Task } from "@/server/db/models/Task";
import { getLocalDateString } from "../utils/dateHelpers";
import { User } from "@/server/db/models/User";
import { applyTemporalDecay, clamp } from "../utils/statistics";
import { propagateConfidence } from "../utils/confidencePropagation";

/**
 * Detects context-switching fragmentation using category entropy analysis.
 *
 * SECTION 8: Entropy normalised against FIXED global ceiling log2(12).
 * SECTION 9: Single source of truth — no duplicate implementations.
 * FIX 13: Uses propagateConfidence() — no custom formula.
 */

const FRAGMENTATION_CONFIDENCE_CAP = 0.65;
const FLOW_WINDOW_MINUTES          = 90;
const MAX_FRAGMENTATION_CATEGORIES = 12;
const GLOBAL_MAX_ENTROPY           = Math.log2(MAX_FRAGMENTATION_CATEGORIES); // ≈ 3.585

export async function analyzeFragmentation(userId: string) {
  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  const tasks = await Task.find({ userId, status: "completed", completedAt: { $ne: null } })
    .select("completedAt category tags priority")
    .sort({ completedAt: 1 }).limit(500).lean();

  if (!tasks || tasks.length < 5) {
    return {
      fragmentationScore: 0, switchEntropyScore: 0, averageSwitchesPerDay: 0,
      rawPatternStrength: 0, sampleSupport: 0, confidence: 0,
      sourceSignals: ["insufficient_history"],
    };
  }

  const today = new Date();
  const tasksPerDay: Record<string, Array<{ completedAt: Date; category: string; decayWeight: number }>> = {};

  for (const task of tasks) {
    const t = task as any;
    const completedAt = new Date(t.completedAt);
    if (isNaN(completedAt.getTime())) continue;
    const daysOld = (today.getTime() - completedAt.getTime()) / 86400000;
    const decay   = applyTemporalDecay(daysOld);
    const dateStr = getLocalDateString(completedAt, timezone);
    if (!tasksPerDay[dateStr]) tasksPerDay[dateStr] = [];
    const category = (t.category || t.tags?.[0] || "uncategorized").toLowerCase().trim();
    tasksPerDay[dateStr].push({ completedAt, category, decayWeight: decay });
  }

  let totalSwitches = 0, totalEntropyScore = 0, validDays = 0, totalDecayWeight = 0;

  for (const dayTasks of Object.values(tasksPerDay)) {
    if (dayTasks.length < 2) continue;
    validDays++;
    dayTasks.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    const dayDecay = dayTasks.reduce((s, t) => s + t.decayWeight, 0) / dayTasks.length;
    totalDecayWeight += dayDecay;

    let daySwitches = 0, prevCat = dayTasks[0].category, prevTime = dayTasks[0].completedAt.getTime();
    for (let i = 1; i < dayTasks.length; i++) {
      const curr = dayTasks[i];
      const diffMins = (curr.completedAt.getTime() - prevTime) / 60000;
      if (curr.category !== prevCat && diffMins <= FLOW_WINDOW_MINUTES) daySwitches++;
      prevCat = curr.category; prevTime = curr.completedAt.getTime();
    }
    totalSwitches += daySwitches * dayDecay;

    // SECTION 8 FIX: Fixed ceiling — comparable across all days
    const catCounts: Record<string, number> = {};
    for (const t of dayTasks) catCounts[t.category] = (catCounts[t.category] || 0) + 1;
    const n = dayTasks.length;
    let entropy = 0;
    for (const count of Object.values(catCounts)) { const p = count / n; if (p > 0) entropy -= p * Math.log2(p); }
    totalEntropyScore += Math.min(1, entropy / GLOBAL_MAX_ENTROPY) * dayDecay;
  }

  if (validDays === 0 || totalDecayWeight === 0) {
    return {
      fragmentationScore: 0, switchEntropyScore: 0, averageSwitchesPerDay: 0,
      rawPatternStrength: 0, sampleSupport: 0, confidence: 0,
      sourceSignals: ["no_valid_multi_task_days"],
    };
  }

  const averageSwitchesPerDay = totalSwitches / totalDecayWeight;
  const switchEntropyScore    = clamp(totalEntropyScore / totalDecayWeight);
  const fragmentationScore    = clamp(clamp(averageSwitchesPerDay / 8) * 0.5 + switchEntropyScore * 0.5);
  const sampleSupport         = clamp(Math.min(validDays / 14, 1));
  const confResult = propagateConfidence({
    components: [
      { name: "rawPattern",    value: fragmentationScore, weight: 0.5 },
      { name: "sampleSupport", value: sampleSupport,      weight: 0.5 },
    ],
    cap: FRAGMENTATION_CONFIDENCE_CAP, label: "fragmentation",
  });

  return {
    fragmentationScore:    Number(fragmentationScore.toFixed(3)),
    switchEntropyScore:    Number(switchEntropyScore.toFixed(3)),
    averageSwitchesPerDay: Number(averageSwitchesPerDay.toFixed(1)),
    rawPatternStrength:    Number(fragmentationScore.toFixed(3)),
    sampleSupport:         Number(sampleSupport.toFixed(3)),
    confidence:            confResult.finalConfidence,
    sourceSignals: [
      "category_switch_analysis",
      `fixed_entropy_ceiling:log2(${MAX_FRAGMENTATION_CATEGORIES})`,
      "flow_state_detection", "temporal_decay_applied",
      `valid_days:${validDays}`,
    ],
  };
}
