export function computeSnapshotDelta(prev: any, current: any) {
  const delta: any = {};

  for (const key of Object.keys(current)) {
    const a = prev?.[key] ?? 0;
    const b = current?.[key] ?? 0;
    delta[key] = Number((b - a).toFixed(2));
  }

  return delta;
}
