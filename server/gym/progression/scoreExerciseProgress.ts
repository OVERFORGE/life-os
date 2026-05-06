import { detectProgression, OverloadGrade } from "./detectProgression";
import { calculateVolume } from "./calculateVolume";
import { calculateEstimated1RM } from "./calculateEstimated1RM";

export interface ExerciseProgressScore {
  score: number; // 0-100
  insights: string[];
  history: any[]; // The graded history
}

export function scoreExerciseProgress(
  exerciseHistory: any[], // [{ date, weight, reps, targetReps }, ...]
  targetRepsDefault: number = 10
): ExerciseProgressScore {
  if (!exerciseHistory || exerciseHistory.length === 0) {
    return { score: 0, insights: ["No history available to analyze."], history: [] };
  }

  // Sort chronological
  const sorted = [...exerciseHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  let totalScore = 50; // Base score
  const insights: string[] = [];
  const gradedHistory: any[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const previous = i > 0 ? sorted[i - 1] : null;
    
    const target = current.targetReps || targetRepsDefault;
    const progression = detectProgression(
      current.weight || 0,
      current.reps || 0,
      previous?.weight || 0,
      previous?.reps || 0,
      target
    );

    gradedHistory.push({
      ...current,
      progression
    });
  }

  // Evaluate last 30 days
  const now = new Date().getTime();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const recentHistory = gradedHistory.filter(h => new Date(h.date).getTime() >= thirtyDaysAgo);

  if (recentHistory.length > 0) {
    const firstRecent = recentHistory[0];
    const lastRecent = recentHistory[recentHistory.length - 1];
    
    const initial1RM = firstRecent.progression.estimated1RM;
    const final1RM = lastRecent.progression.estimated1RM;
    
    if (initial1RM > 0) {
      const monthDelta = ((final1RM - initial1RM) / initial1RM) * 100;
      if (monthDelta > 5) {
        totalScore += 25;
        insights.push(`Your strength increased by ${monthDelta.toFixed(1)}% this month.`);
      } else if (monthDelta > 0) {
        totalScore += 10;
        insights.push(`Slight strength increase of ${monthDelta.toFixed(1)}% this month.`);
      } else if (monthDelta < -5) {
        totalScore -= 20;
        insights.push(`Your strength decreased by ${Math.abs(monthDelta).toFixed(1)}% this month. Check your recovery.`);
      } else {
        insights.push(`Strength is relatively stable.`);
      }
    }

    // Check fatigue
    const recentFatigue = recentHistory.filter(h => h.progression.fatigueRisk).length;
    if (recentFatigue > 1) {
      totalScore -= 15;
      insights.push(`You have shown fatigue in multiple recent sets. Consider deloading this exercise.`);
    }

    // Check volume progression
    const firstVol = calculateVolume(firstRecent.weight, firstRecent.reps);
    const lastVol = calculateVolume(lastRecent.weight, lastRecent.reps);
    if (lastVol > firstVol * 1.1) {
      totalScore += 10;
      insights.push(`Volume progression is improving consistently.`);
    }
  }

  // Check consistency (are they doing it regularly?)
  if (recentHistory.length === 0) {
    totalScore -= 30;
    insights.push(`You haven't performed this exercise in the last 30 days.`);
  } else if (recentHistory.length >= 4) {
    totalScore += 15;
    insights.push(`Great consistency! You've hit this exercise ${recentHistory.length} times recently.`);
  }

  // Cap score
  totalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  return {
    score: totalScore,
    insights,
    history: gradedHistory.reverse() // Return newest first for UI
  };
}
