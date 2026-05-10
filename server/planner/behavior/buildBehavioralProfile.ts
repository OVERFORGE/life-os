import { BehavioralProfile } from "@/server/db/models/BehavioralProfile";
import { DailyLog } from "@/server/db/models/DailyLog";
import { Task } from "@/server/db/models/Task";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { User } from "@/server/db/models/User";
import { analyzeWakePatterns } from "./analyzeWakePatterns";
import { analyzeSleepPatterns } from "./analyzeSleepPatterns";
import { analyzeFocusPatterns } from "./analyzeFocusPatterns";
import { analyzeEnergyPatterns } from "./analyzeEnergyPatterns";
import { analyzeWorkoutConsistency } from "./analyzeWorkoutConsistency";
import { analyzeBehaviorStability } from "./analyzeBehaviorStability";
import { analyzeChronotype } from "./analyzeChronotype";
import { calculateDataReliability } from "../utils/calculateDataReliability";
import { getLocalDateString } from "../utils/dateHelpers";
import { validateBehavioralProfile } from "../utils/validatePlannerOutput";

async function countDistinctAnalyzedDays(userId: string): Promise<number> {
  const user = await User.findById(userId).select("settings").lean();
  const timezone = (user as any)?.settings?.timezone;

  const [logs, tasks, workouts] = await Promise.all([
    DailyLog.find({ userId }).select("date").lean(),
    Task.find({ userId, status: "completed", completedAt: { $ne: null } }).select("completedAt").lean(),
    WorkoutSession.find({ userId }).select("date").lean(),
  ]);

  const days = new Set<string>();
  for (const l of logs)    { if ((l as any).date)        days.add(getLocalDateString(new Date((l as any).date), timezone)); }
  for (const t of tasks)   { if ((t as any).completedAt) days.add(getLocalDateString(new Date((t as any).completedAt), timezone)); }
  for (const w of workouts){ if ((w as any).date)        days.add(getLocalDateString(new Date((w as any).date), timezone)); }
  return days.size;
}

/**
 * FIX 17: Derive uncertainty metadata for planner consumers.
 */
function deriveUncertaintyMetadata(
  reliabilityScore: number,
  validationWarnings: string[],
  analyzedDays: number
): { uncertaintyLevel: "low" | "medium" | "high"; inferenceQuality: "weak" | "moderate" | "strong"; plannerSafe: boolean } {
  const warningCount = validationWarnings.length;

  let uncertaintyLevel: "low" | "medium" | "high" = "high";
  if (reliabilityScore > 0.7 && warningCount === 0 && analyzedDays >= 21) uncertaintyLevel = "low";
  else if (reliabilityScore > 0.4 && warningCount <= 2 && analyzedDays >= 7) uncertaintyLevel = "medium";

  let inferenceQuality: "weak" | "moderate" | "strong" = "weak";
  if (reliabilityScore > 0.6 && analyzedDays >= 21) inferenceQuality = "strong";
  else if (reliabilityScore > 0.3 && analyzedDays >= 7) inferenceQuality = "moderate";

  const plannerSafe = uncertaintyLevel !== "high" && inferenceQuality !== "weak";
  return { uncertaintyLevel, inferenceQuality, plannerSafe };
}

export async function buildBehavioralProfile(userId: string) {
  // 1. Run all analyzers
  const [wakeData, sleepData, focusData, energyData, workoutData] = await Promise.all([
    analyzeWakePatterns(userId),
    analyzeSleepPatterns(userId),
    analyzeFocusPatterns(userId),
    analyzeEnergyPatterns(userId),
    analyzeWorkoutConsistency(userId),
  ]);

  // 2. Derived metrics
  const maxFocusConfidence = focusData.length > 0 ? Math.max(...focusData.map((w: any) => w.confidence)) : 0;

  const stability = await analyzeBehaviorStability(
    wakeData.variance, wakeData.confidence,
    sleepData.variance, sleepData.confidence,
    workoutData.consistencyScore, workoutData.confidence,
    maxFocusConfidence
  );

  // 3. Chronotype (FIX 11: capped at 0.45; per-day task timestamp analysis)
  const chronotype = await analyzeChronotype(
    userId,
    wakeData.averageMinutes ?? null,
    sleepData.averageMinutes ?? null,
    focusData
  );

  // 4. Data reliability
  const reliability = await calculateDataReliability(userId);
  const analyzedDays = await countDistinctAnalyzedDays(userId);

  // 5. FIX 15: Soft validation — log but never throw
  const pendingBehavioral = {
    wakeWindow: wakeData, sleepWindow: sleepData,
    peakFocusWindows: focusData, behaviorStabilityScore: stability.score, chronotype,
  };
  const bValidation = validateBehavioralProfile(pendingBehavioral);
  const validationWarnings = [...bValidation.errors, ...bValidation.warnings];

  if (bValidation.errors.length > 0) {
    console.error("[BehavioralProfile] Validation errors (writing partial profile):", bValidation.errors);
  }
  if (bValidation.warnings.length > 0) {
    console.warn("[BehavioralProfile] Warnings:", bValidation.warnings);
  }

  // 6. FIX 17: Uncertainty surface
  const uncertainty = deriveUncertaintyMetadata(reliability.score, validationWarnings, analyzedDays);

  // 7. Upsert (always proceeds — partial profiles are better than missing ones)
  const profile = await BehavioralProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        wakeWindow: wakeData,
        sleepWindow: sleepData,
        peakFocusWindows: focusData,
        lowEnergyPatterns: energyData,
        workoutConsistency: workoutData,
        behaviorStabilityScore: stability.score,
        chronotype,
        "metadata.lastUpdated":    new Date(),
        "metadata.analyzedDays":   analyzedDays,
        "metadata.dataQualityScore": reliability.score,
        "metadata.profileHealth": {
          ...reliability.profileHealth,
          validationWarnings,
          uncertaintyLevel:  uncertainty.uncertaintyLevel,
          inferenceQuality:  uncertainty.inferenceQuality,
          plannerSafe:       uncertainty.plannerSafe,
        },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return profile;
}
