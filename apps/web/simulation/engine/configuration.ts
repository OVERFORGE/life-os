/**
 * Runtime Configuration Module — Phase 1.3
 * Immutable simulation configuration definitions.
 */

import { RuntimeConfigurationDTO } from "../types";

export const DEFAULT_RUNTIME_CONFIGURATION: Readonly<RuntimeConfigurationDTO> = Object.freeze({
  startDay: 1,
  startMinute: 480, // 08:00 canonical
  totalDays: 1,
  maxTicks: 1440,
  tickIntervalMinutes: 1,
  speedMultiplier: 1,
  deterministicReplay: true,
  persistSnapshots: false,
  enableLogging: true,
  futureFlags: {},
});

export function buildConfiguration(
  override?: Partial<RuntimeConfigurationDTO>
): Readonly<RuntimeConfigurationDTO> {
  const totalDays = override?.totalDays ?? DEFAULT_RUNTIME_CONFIGURATION.totalDays;
  const tickIntervalMinutes = override?.tickIntervalMinutes ?? DEFAULT_RUNTIME_CONFIGURATION.tickIntervalMinutes;
  const maxTicks = override?.maxTicks ?? totalDays * Math.ceil(1440 / tickIntervalMinutes);

  return Object.freeze({
    ...DEFAULT_RUNTIME_CONFIGURATION,
    ...override,
    totalDays,
    tickIntervalMinutes,
    maxTicks,
  });
}
