export interface OverallFitnessResult {
  score: number;
  status: 'Elite' | 'Progressing' | 'Stable' | 'Plateau' | 'Regressing';
  consistencyScore: number;
  expectedWeeklySessions: number;
  actualWeeklySessions: number;
}

export function scoreOverallFitness(
  sessions: any[], // All sessions sorted by date
  activeRoutineDays: number = 4
): OverallFitnessResult {
  let score = 50;
  
  if (!sessions || sessions.length === 0) {
    return { score: 0, status: 'Regressing', consistencyScore: 0, expectedWeeklySessions: activeRoutineDays, actualWeeklySessions: 0 };
  }

  // Calculate Consistency (last 4 weeks)
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const recentSessions = sessions.filter(s => new Date(s.date || s.createdAt) >= fourWeeksAgo);
  
  // Calculate unique days worked out in last 28 days
  const uniqueDays = new Set(recentSessions.map(s => new Date(s.date || s.createdAt).toISOString().split('T')[0]));
  const actualSessions = uniqueDays.size;
  const expectedSessions = activeRoutineDays * 4;
  
  let consistencyRatio = actualSessions / expectedSessions;
  if (consistencyRatio > 1) consistencyRatio = 1; // Cap at 100%
  
  const consistencyScore = Math.round(consistencyRatio * 100);
  
  if (consistencyScore >= 90) score += 30;
  else if (consistencyScore >= 75) score += 15;
  else if (consistencyScore >= 50) score += 0;
  else if (consistencyScore >= 25) score -= 15;
  else score -= 30;

  // We would also aggregate average exercise scores here, but for simplicity we rely on consistency and frequency.
  // A fully built system would iterate all exercises and average their `scoreExerciseProgress`.
  
  score = Math.max(0, Math.min(100, Math.round(score)));
  
  let status: OverallFitnessResult['status'] = 'Stable';
  if (score >= 90) status = 'Elite';
  else if (score >= 70) status = 'Progressing';
  else if (score >= 40) status = 'Stable';
  else if (score >= 20) status = 'Plateau';
  else status = 'Regressing';

  return {
    score,
    status,
    consistencyScore,
    expectedWeeklySessions: activeRoutineDays,
    actualWeeklySessions: Number((actualSessions / 4).toFixed(1)) // avg per week
  };
}
