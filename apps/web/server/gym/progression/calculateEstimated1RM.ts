export function calculateEstimated1RM(weight: number, reps: number): number {
  if (!weight || !reps || reps <= 0) return 0;
  // Epley Formula: 1RM = Weight × (1 + Reps / 30)
  return Number((weight * (1 + reps / 30)).toFixed(2));
}
