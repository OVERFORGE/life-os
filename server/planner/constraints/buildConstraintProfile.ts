import { ConstraintProfile } from "@/server/db/models/ConstraintProfile";
import { BehavioralProfile } from "@/server/db/models/BehavioralProfile";
import { DailyLog } from "@/server/db/models/DailyLog";
import { Task } from "@/server/db/models/Task";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { User } from "@/server/db/models/User";
import { analyzeRecurringConstraints } from "./analyzeRecurringConstraints";
import { analyzeCommutePatterns } from "./analyzeCommutePatterns";
import { analyzeTaskDensity } from "./analyzeTaskDensity";
import { analyzeAvailabilityWindows } from "./analyzeAvailabilityWindows";
import { analyzeFragmentation } from "./analyzeFragmentation";
import { analyzeRecoveryWindows } from "./analyzeRecoveryWindows";
import { calculateDataReliability } from "../utils/calculateDataReliability";
import { getLocalDateString } from "../utils/dateHelpers";
import { validateConstraintProfile } from "../utils/validatePlannerOutput";
import { clamp } from "../utils/statistics";

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
 * Planners and agents MUST check plannerSafe before scheduling.
 */
function deriveUncertaintyMetadata(
  reliabilityScore: number,
  validationWarnings: string[],
  analyzedDays: number,
  constraintCount: number
): { uncertaintyLevel: "low" | "medium" | "high"; inferenceQuality: "weak" | "moderate" | "strong"; plannerSafe: boolean } {
  const warningCount = validationWarnings.length;

  let uncertaintyLevel: "low" | "medium" | "high" = "high";
  if (reliabilityScore > 0.7 && warningCount === 0 && analyzedDays >= 14) uncertaintyLevel = "low";
  else if (reliabilityScore > 0.4 && warningCount <= 2 && analyzedDays >= 7)  uncertaintyLevel = "medium";

  let inferenceQuality: "weak" | "moderate" | "strong" = "weak";
  if (constraintCount > 0 && reliabilityScore > 0.6 && analyzedDays >= 14) inferenceQuality = "strong";
  else if (constraintCount > 0 && reliabilityScore > 0.3)                   inferenceQuality = "moderate";

  // plannerSafe: planner agents MAY proceed if medium or better
  const plannerSafe = uncertaintyLevel !== "high" && inferenceQuality !== "weak";

  return { uncertaintyLevel, inferenceQuality, plannerSafe };
}

export async function buildConstraintProfile(userId: string) {
  // 1. Load Behavioral Profile
  const behavioralProfile = await BehavioralProfile.findOne({ userId }).lean() as any;

  // 2. Data reliability
  const reliability = await calculateDataReliability(userId);

  // 3. Run independent analyzers
  const [recurringConstraints, taskDensityPatterns, contextSwitchingProfile, recoveryResult] =
    await Promise.all([
      analyzeRecurringConstraints(userId),
      analyzeTaskDensity(userId),
      analyzeFragmentation(userId),
      analyzeRecoveryWindows(userId),
    ]);

  const recoveryWindows = recoveryResult.recoveryWindows;

  // 4. Commute (depends on recurring constraints)
  const commutePatterns = await analyzeCommutePatterns(recurringConstraints);

  // 5. Availability (depends on all above + behavioral profile + chronotype)
  const chronotype = behavioralProfile?.chronotype ?? null;
  const availabilityWindows = await analyzeAvailabilityWindows(
    recurringConstraints, commutePatterns, behavioralProfile,
    recoveryWindows, chronotype, reliability.score
  );

  // 6. Analyzed days
  const analyzedDays = await countDistinctAnalyzedDays(userId);

  // 7. FIX 15: Soft validation — no throws, collect warnings, persist partial-safe profile
  const pendingConstraint = { availabilityWindows, recurringConstraints, recoveryWindows, commutePatterns };
  const cValidation = validateConstraintProfile(pendingConstraint);

  const validationWarnings = [...cValidation.errors, ...cValidation.warnings];

  if (cValidation.errors.length > 0) {
    console.error("[ConstraintProfile] Validation errors (writing partial profile):", cValidation.errors);
  }
  if (cValidation.warnings.length > 0) {
    console.warn("[ConstraintProfile] Temporal consistency warnings:", cValidation.warnings);
  }

  // 8. FIX 17: Uncertainty surface metadata
  const uncertainty = deriveUncertaintyMetadata(
    reliability.score,
    validationWarnings,
    analyzedDays,
    recurringConstraints.length
  );

  // 9. Upsert (always proceeds — degraded profiles are better than missing profiles)
  const profile = await ConstraintProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        recurringConstraints,
        commutePatterns,
        availabilityWindows,
        taskDensityPatterns,
        contextSwitchingProfile,
        recoveryWindows,
        "metadata.lastUpdated":               new Date(),
        "metadata.analyzedDays":              analyzedDays,
        "metadata.seasonalSegmentationPrepared": true,
        "metadata.profileHealth":             {
          ...reliability.profileHealth,
          validationWarnings,
          uncertaintyLevel:    uncertainty.uncertaintyLevel,
          inferenceQuality:    uncertainty.inferenceQuality,
          plannerSafe:         uncertainty.plannerSafe,
        },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return profile;
}
