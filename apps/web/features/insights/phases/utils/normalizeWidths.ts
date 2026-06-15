export function normalizeWidths(phases: { durationDays: number }[] = []) {
  if (!Array.isArray(phases) || phases.length === 0) return [];

  const max = Math.max(...phases.map((p) => p.durationDays));

  return phases.map((p) => ({
    ...p,
    widthPercent: Math.max(5, (p.durationDays / max) * 100),
  }));
}
