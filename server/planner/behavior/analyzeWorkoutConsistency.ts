import { WorkoutSession } from "@/server/db/models/WorkoutSession";

export async function analyzeWorkoutConsistency(userId: string) {
  // Fetch sessions from the last 90 days
  const now = new Date();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(now.getDate() - 90);

  const sessions = await WorkoutSession.find({
    userId,
    date: { $gte: ninetyDaysAgo },
  })
    .select("date")
    .sort({ date: -1 })
    .lean();

  if (!sessions || sessions.length === 0) {
    return {
      expectedPerWeek: null,
      actualPerWeek: 0,
      consistencyScore: 0,
      confidence: 0,
    };
  }

  // Calculate actual workouts per week (over the window they've been active, max 12 weeks)
  const firstSessionDate = new Date(sessions[sessions.length - 1].date);
  const msActive = now.getTime() - firstSessionDate.getTime();
  const weeksActive = Math.max(1, msActive / (1000 * 60 * 60 * 24 * 7));

  const actualPerWeek = Number((sessions.length / weeksActive).toFixed(2));

  /**
   * FUTURE ARCHITECTURE PLACEHOLDER: Full Gym Intelligence
   * Currently, we measure simple "workout frequency" (actualPerWeek).
   * In future planner modules, we will integrate rich workout load signals:
   * - Training Volume & Set Count (overall CNS load)
   * - RPE (Rate of Perceived Exertion) & Intensity levels
   * - Session Duration mapping
   * - Progressive Overload Quality (is the user plateauing?)
   * 
   * These advanced signals will deeply influence recovery recommendations
   * and cognitive load balancing in the adaptive planner.
   */

  // Determine consistency (are they clustered or evenly distributed?)
  // We can group sessions by week and calculate the variance of weekly frequency.
  const weekBuckets: number[] = new Array(Math.ceil(weeksActive)).fill(0);
  for (const session of sessions) {
    const d = new Date(session.date);
    const msSinceFirst = d.getTime() - firstSessionDate.getTime();
    const weekIndex = Math.floor(msSinceFirst / (1000 * 60 * 60 * 24 * 7));
    if (weekIndex >= 0 && weekIndex < weekBuckets.length) {
      weekBuckets[weekIndex]++;
    }
  }

  let expectedPerWeek = null; // System must never invent expectations.

  // Consistency Score: 1.0 means exact same number of workouts every week.
  // 0.0 means high variance.
  let consistencyScore = 0;
  if (weekBuckets.length > 1) {
    const avgWeekly = sessions.length / weekBuckets.length;
    const squaredDiffs = weekBuckets.map(count => Math.pow(count - avgWeekly, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / weekBuckets.length;
    
    // Base consistency score mapping (acceptable variance of 1 workout/week deviation)
    consistencyScore = Math.max(0, 1 - Math.sqrt(variance) / Math.max(1, avgWeekly));
  } else if (weekBuckets.length === 1 && sessions.length > 0) {
    consistencyScore = 1; // 1 week of data, consistent by definition but low confidence
  }

  // Confidence scales with how many weeks of history we have (max confidence at 12 weeks)
  const confidence = Math.min(1, weekBuckets.length / 12);

  return {
    expectedPerWeek,
    actualPerWeek,
    consistencyScore: Number(consistencyScore.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
  };
}
