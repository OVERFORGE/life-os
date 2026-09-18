/**
 * Runtime State Module — Phase 1.3
 * Canonical execution state derivation and tick progression.
 */

import { RuntimeStateDTO, RuntimeStatus, RuntimeConfigurationDTO } from "../types";
import { deriveTimeFromTicks, formatTimestamp } from "./clock";

export function deriveRuntimeState(
  status: RuntimeStatus,
  tick: number,
  config: RuntimeConfigurationDTO
): RuntimeStateDTO {
  // Use canonical startMinute (integer) instead of parsed string
  const derived = deriveTimeFromTicks(tick, config.startDay, config.startMinute, config.tickIntervalMinutes);

  const totalMaxMinutes = config.totalDays * 1440;
  const remainingMinutes = Math.max(0, totalMaxMinutes - derived.elapsedMinutes);

  const isRunning = status === "RUNNING";
  const isPaused = status === "PAUSED";
  const isFinished = status === "COMPLETED" || status === "FAILED" || status === "CANCELLED";

  return {
    status,
    isRunning,
    isPaused,
    isFinished,

    tick,
    currentDay: derived.currentDay,
    currentMinute: derived.currentMinute,
    formattedTime: derived.formattedTime,
    formattedTimestamp: formatTimestamp(derived.currentDay, derived.currentMinute),

    elapsedMinutes: derived.elapsedMinutes,
    elapsedTicks: tick,
    simulationSpeed: config.speedMultiplier,
    remainingMinutes,
  };
}
