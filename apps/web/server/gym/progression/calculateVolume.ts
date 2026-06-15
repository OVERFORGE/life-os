export function calculateVolume(weight: number, reps: number, sets: number = 1): number {
  if (!weight || !reps || sets <= 0) return 0;
  return Number((weight * reps * sets).toFixed(2));
}
