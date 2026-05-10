import { DailyLog } from "@/server/db/models/DailyLog";
import { Task } from "@/server/db/models/Task";
import { WorkoutSession } from "@/server/db/models/WorkoutSession";
import { getLocalDateString } from "./dateHelpers";
import { User } from "@/server/db/models/User";

/**
 * Computes a global data reliability score (0–1) for a user's behavioral data.
 *
 * FIX 6: This is the ONLY place reliability dampens confidence.
 * Analyzers output raw pattern confidence; orchestrators multiply by this score.
 *
 * FIX 8: Added temporalDistributionScore to detect clustered vs spread-out data.
 * 30 consecutive logs look healthy by count but score LOW on distribution.
 */
export async function calculateDataReliability(userId: string): Promise<{
  score: number;
  profileHealth: {
    dataCoverageScore: number;
    temporalCoverageDays: number;
    sparsityScore: number;
    confidenceIntegrityScore: number;
    temporalDistributionScore: number;
  };
  sourceSignals: string[];
}> {
  const user = await User.findById(userId).select("settings createdAt").lean();
  const timezone = (user as any)?.settings?.timezone;
  const accountCreated = (user as any)?.createdAt ? new Date((user as any).createdAt) : null;
  const signals: string[] = [];

  // --- 1. Collect distinct logged days from all sources ---
  const [logs, tasks, workouts] = await Promise.all([
    DailyLog.find({ userId }).select("date").lean(),
    Task.find({ userId, status: "completed", completedAt: { $ne: null } }).select("completedAt").lean(),
    WorkoutSession.find({ userId }).select("date").lean(),
  ]);

  const distinctDays = new Set<string>();
  for (const log of logs)     { if ((log as any).date)        distinctDays.add(getLocalDateString(new Date((log as any).date), timezone)); }
  for (const task of tasks)   { if ((task as any).completedAt) distinctDays.add(getLocalDateString(new Date((task as any).completedAt), timezone)); }
  for (const w of workouts)   { if ((w as any).date)          distinctDays.add(getLocalDateString(new Date((w as any).date), timezone)); }

  const temporalCoverageDays = distinctDays.size;

  // --- 2. Expected coverage window ---
  const today = new Date();
  const daysSinceCreation = accountCreated
    ? Math.max(1, Math.floor((today.getTime() - accountCreated.getTime()) / 86400000))
    : 30;
  const windowDays = Math.min(daysSinceCreation, 90);

  const dataCoverageScore = Math.min(1, temporalCoverageDays / windowDays);
  if (dataCoverageScore < 0.3) signals.push("low_data_coverage");
  if (temporalCoverageDays < 7) signals.push("insufficient_temporal_coverage");

  // --- 3. Sparsity ---
  const logCount = logs.length;
  const sparsityScore = logCount === 0
    ? 0
    : Math.min(1, logCount / Math.max(1, windowDays));
  if (sparsityScore < 0.2) signals.push("extremely_sparse_daily_logs");

  // --- 4. Confidence integrity ---
  let filledCount = 0;
  for (const log of logs) {
    const l = log as any;
    if (l.energy != null && l.wakeTime) filledCount++;
  }
  const confidenceIntegrityScore = logCount === 0 ? 0 : Math.min(1, filledCount / logCount);
  if (confidenceIntegrityScore < 0.5) signals.push("low_log_completeness");

  // --- 5. FIX 8: Temporal Distribution Score ---
  // Measures how evenly spread the distinct days are across the observation window.
  // If all 30 logs are in a 3-day burst, distribution = poor.
  let temporalDistributionScore = 0;
  if (distinctDays.size >= 2) {
    const sortedDays = Array.from(distinctDays)
      .map(d => new Date(d + "T00:00:00Z").getTime())
      .sort((a, b) => a - b);

    const totalSpanDays = (sortedDays[sortedDays.length - 1] - sortedDays[0]) / 86400000;

    if (totalSpanDays > 0) {
      // Ideal: days are uniformly spread. Metric: ratio of span to count.
      // If span = 30 days, count = 10 days → one every 3 days = good distribution.
      // If span = 3 days, count = 10 days → all clustered = poor distribution.
      const idealGapDays = totalSpanDays / (distinctDays.size - 1);
      
      // Compute coefficient of variation (CV) of inter-day gaps
      const gaps: number[] = [];
      for (let i = 1; i < sortedDays.length; i++) {
        gaps.push((sortedDays[i] - sortedDays[i - 1]) / 86400000);
      }
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const variance = gaps.reduce((s, g) => s + Math.pow(g - avgGap, 2), 0) / gaps.length;
      const cv = avgGap > 0 ? Math.sqrt(variance) / avgGap : 1;

      // Lower CV = more uniform = better distribution
      // CV of 0 = perfectly uniform, CV > 2 = very clustered
      temporalDistributionScore = Math.max(0, Math.min(1, 1 - cv / 2));
    }

    if (temporalDistributionScore < 0.3) signals.push("clustered_temporal_evidence");
  }

  // --- 6. Composite reliability ---
  // Coverage 30%, Sparsity 25%, Integrity 25%, Distribution 20%
  const score = Math.max(0, Math.min(1,
    dataCoverageScore          * 0.30 +
    sparsityScore              * 0.25 +
    confidenceIntegrityScore   * 0.25 +
    temporalDistributionScore  * 0.20
  ));

  if (score < 0.2) signals.push("critical_data_unreliability");

  return {
    score: Number(score.toFixed(3)),
    profileHealth: {
      dataCoverageScore:         Number(dataCoverageScore.toFixed(3)),
      temporalCoverageDays,
      sparsityScore:             Number(sparsityScore.toFixed(3)),
      confidenceIntegrityScore:  Number(confidenceIntegrityScore.toFixed(3)),
      temporalDistributionScore: Number(temporalDistributionScore.toFixed(3)),
    },
    sourceSignals: signals,
  };
}

/**
 * FIX 6: Orchestrator-level reliability application.
 * Analyzers output rawPatternConfidence; orchestrators call this once.
 */
export function applyReliabilityPenalty(rawPatternConfidence: number, reliabilityScore: number): number {
  return Math.max(0, Math.min(1, rawPatternConfidence * reliabilityScore));
}
