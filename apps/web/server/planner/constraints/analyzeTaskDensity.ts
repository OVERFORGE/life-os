import { Task } from "@/server/db/models/Task";
import { getLocalDateString } from "../utils/dateHelpers";
import { User } from "@/server/db/models/User";
import { calculateVariance, calculateStandardDeviation, applyTemporalDecay, clamp } from "../utils/statistics";

const DENSITY_PATTERN_STRENGTH_CAP = 0.85;

// Deep cognitive work categories (proxy via metadata tags or priority)
const DEEP_WORK_CATEGORIES = ["coding", "study", "research", "design", "architecture", "writing"];

/**
 * Analyses realistic task workload capacity.
 *
 * PHILOSOPHY:
 * - Separates raw volume (how many tasks) from cognitive load (how demanding)
 * - Separates cognitive load from execution strain (deep work weight)
 * - 20 tiny errands ≠ 4 hours of architecture work
 * - Applies temporal decay (recent 14 days dominate)
 */
export async function analyzeTaskDensity(userId: string) {
  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  const tasks = await Task.find({ userId, status: "completed", completedAt: { $ne: null } })
    .select("completedAt metadata priority category tags")
    .sort({ completedAt: -1 })
    .limit(500) // Analyse up to 500 most recent
    .lean();

  if (!tasks || tasks.length === 0) {
    return {
      averageTaskVolume: 0,
      averageCognitiveLoad: 0,
      averageExecutionStrain: 0,
      overloadThreshold: 0,
      underloadThreshold: 0,
      confidence: 0,
      sourceSignals: ["no_task_history"],
    };
  }

  const today = new Date();

  // Group tasks by local date with decay weights
  const dayMap: Record<string, { count: number; cogLoad: number; strain: number; decayWeight: number }> = {};

  for (const task of tasks) {
    const t = task as any;
    const completedAt = new Date(t.completedAt);
    if (isNaN(completedAt.getTime())) continue;

    const daysOld = (today.getTime() - completedAt.getTime()) / 86400000;
    const decay = applyTemporalDecay(daysOld);

    const dateStr = getLocalDateString(completedAt, timezone);
    if (!dayMap[dateStr]) dayMap[dateStr] = { count: 0, cogLoad: 0, strain: 0, decayWeight: 0 };

    dayMap[dateStr].count++;
    dayMap[dateStr].decayWeight = Math.max(dayMap[dateStr].decayWeight, decay);

    // --- Cognitive Load with FIX 7: clamp duration, add reliability penalty ---
    let cogLoad = 1.0; // base cost
    if (t.metadata?.estimatedDuration) {
      const rawDuration = t.metadata.estimatedDuration;

      // FIX 7: Clamp max duration contribution at 240 minutes
      const clampedDuration = Math.min(240, Math.max(0, rawDuration));

      // FIX 7: Apply a reliability penalty for suspiciously long durations
      // > 4h tasks are likely inaccurate manual estimates
      const durationReliabilityPenalty = rawDuration > 240 ? 0.5 : 1.0;

      cogLoad += (clampedDuration / 30) * durationReliabilityPenalty; // +1 per 30min (max +8)
    }
    if (t.metadata?.energyCost) cogLoad += (t.metadata.energyCost / 10) * 2;
    if (t.priority === "high")   cogLoad += 1.0;
    if (t.priority === "urgent") cogLoad += 2.0;
    dayMap[dateStr].cogLoad += cogLoad;

    // --- Execution Strain (deep work weighting) ---
    const isDeepWork =
      DEEP_WORK_CATEGORIES.some(cat =>
        (t.category || "").toLowerCase().includes(cat) ||
        ((t.tags || []) as string[]).some((tag: string) => tag.toLowerCase().includes(cat))
      );

    // Deep work items weigh 3× more than errands for strain
    const strainContribution = isDeepWork ? cogLoad * 3 : cogLoad * 0.5;
    dayMap[dateStr].strain += strainContribution;
  }

  const days = Object.values(dayMap);
  if (days.length === 0) {
    return {
      averageTaskVolume: 0,
      averageCognitiveLoad: 0,
      averageExecutionStrain: 0,
      overloadThreshold: 0,
      underloadThreshold: 0,
      confidence: 0,
      sourceSignals: ["empty_valid_days"],
    };
  }

  // Decay-weighted averages
  const totalDecay = days.reduce((s, d) => s + d.decayWeight, 0);
  const avgVolume   = days.reduce((s, d) => s + d.count * d.decayWeight, 0) / totalDecay;
  const avgCogLoad  = days.reduce((s, d) => s + d.cogLoad * d.decayWeight, 0) / totalDecay;
  const avgStrain   = days.reduce((s, d) => s + d.strain * d.decayWeight, 0) / totalDecay;

  const strainValues = days.map(d => d.strain);
  const strainStdDev = calculateStandardDeviation(strainValues);

  // Overload = avg + 1.5σ of strain; underload = avg − 1.5σ (min 0)
  const overloadThreshold  = Number((avgStrain + 1.5 * strainStdDev).toFixed(2));
  const underloadThreshold = Math.max(0, Number((avgStrain - 1.5 * strainStdDev).toFixed(2)));

  // FIX 13: Separate patternStrength (quality of pattern) from sampleSupport (quantity of data)
  // Orchestrators multiply these with reliabilityScore to get final planner confidence.
  const rawPatternStrength = clamp(
    Math.min(strainStdDev > 0 ? 0.85 : 0.5, DENSITY_PATTERN_STRENGTH_CAP)
  );
  const sampleSupport = clamp(Math.min(days.length / 30, 1));

  // Legacy confidence field: combined for backward compatibility
  const confidence = clamp(rawPatternStrength * sampleSupport, 0, DENSITY_PATTERN_STRENGTH_CAP);

  return {
    averageTaskVolume:      Number(avgVolume.toFixed(1)),
    averageCognitiveLoad:   Number(avgCogLoad.toFixed(2)),
    averageExecutionStrain: Number(avgStrain.toFixed(2)),
    overloadThreshold,
    underloadThreshold,
    rawPatternStrength: Number(rawPatternStrength.toFixed(3)),
    sampleSupport:      Number(sampleSupport.toFixed(3)),
    confidence:         Number(confidence.toFixed(3)),
    sourceSignals: [
      "task_completion_history",
      `days_tracked:${days.length}`,
      "deep_work_strain_weighting",
      "temporal_decay_applied",
    ],
  };
}
