/**
 * Runtime Metrics Module — Phase 1.3
 * Pure deterministic telemetry tracking (no wall-clock dependencies).
 */

import { RuntimeMetricsDTO } from "../types";

export const INITIAL_RUNTIME_METRICS: Readonly<RuntimeMetricsDTO> = Object.freeze({
  elapsedTicks: 0,
  elapsedMinutes: 0,
  pauseCount: 0,
  resumeCount: 0,
  advanceCount: 0,
});

export function updateAdvanceMetrics(
  metrics: RuntimeMetricsDTO,
  additionalTicks: number,
  additionalMinutes: number
): RuntimeMetricsDTO {
  return {
    ...metrics,
    elapsedTicks: metrics.elapsedTicks + additionalTicks,
    elapsedMinutes: metrics.elapsedMinutes + additionalMinutes,
    advanceCount: metrics.advanceCount + 1,
  };
}

export function incrementPauseCount(metrics: RuntimeMetricsDTO): RuntimeMetricsDTO {
  return { ...metrics, pauseCount: metrics.pauseCount + 1 };
}

export function incrementResumeCount(metrics: RuntimeMetricsDTO): RuntimeMetricsDTO {
  return { ...metrics, resumeCount: metrics.resumeCount + 1 };
}
