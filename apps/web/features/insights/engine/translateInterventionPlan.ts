import { METRIC_SCALES } from "./metricScales";

export function translateDeltaToHuman({
  metric,
  current,
  delta,
}: {
  metric: keyof typeof METRIC_SCALES;
  current: number;
  delta: number;
}) {
  const scale = METRIC_SCALES[metric];
  const unit = scale.unit;

  const target = current + delta;

  const perDay = Math.sign(delta) * scale.maxStepPerDay;

  const days = Math.max(3, Math.ceil(Math.abs(delta) / scale.maxStepPerDay));

  const humanReadable =
    metric === "sleep" || metric === "deepWork"
      ? `Change ${metric} by ~${perDay} ${unit}/day for ${days} days (target ≈ ${target.toFixed(1)} ${unit})`
      : `Shift ${metric} by ~${perDay} ${unit}/day for ${days} days (target ≈ ${target.toFixed(1)})`;

  return {
    metric,
    delta,
    target,
    perDayChange: perDay,
    days,
    unit,
    humanReadable,
  };
}
