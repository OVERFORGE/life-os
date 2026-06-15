import { detectProgression } from "./detectProgression";
import { calculateVolume } from "./calculateVolume";

export interface SetProgressScore {
  score: number; // 0-100
  history: any[]; // Graded history
}

export function scoreSetProgress(
  setHistory: any[], // [{ date, weight, reps, targetReps }, ...]
  targetRepsDefault: number = 10
): SetProgressScore {
  if (!setHistory || setHistory.length === 0) {
    return { score: 0, history: [] };
  }

  // Sort chronological
  const sorted = [...setHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  let totalScore = 50; // Base score
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
      if (monthDelta > 5) totalScore += 30;
      else if (monthDelta > 0) totalScore += 15;
      else if (monthDelta < -5) totalScore -= 20;
    }

    const firstVol = calculateVolume(firstRecent.weight, firstRecent.reps);
    const lastVol = calculateVolume(lastRecent.weight, lastRecent.reps);
    if (lastVol > firstVol * 1.1) totalScore += 10;

    const recentFatigue = recentHistory.filter(h => h.progression.fatigueRisk).length;
    if (recentFatigue > 1) totalScore -= 15;
  }

  if (recentHistory.length === 0) totalScore -= 20;
  else if (recentHistory.length >= 4) totalScore += 15;

  totalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  return {
    score: totalScore,
    history: gradedHistory.reverse()
  };
}
