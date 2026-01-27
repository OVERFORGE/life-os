type Trend = "up" | "down" | "flat";

export function computeTrend(recent: number[], previous: number[]) {
  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const r = avg(recent);
  const p = avg(previous);

  const diff = r - p;

  let trend: Trend = "flat";
  if (diff > 0.3) trend = "up";
  if (diff < -0.3) trend = "down";

  return {
    recent: r,
    previous: p,
    diff,
    trend,
  };
}
