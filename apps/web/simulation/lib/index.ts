/**
 * Simulation Library Utilities (Phase 1.1 Foundation)
 */

export function formatStepTime(day: number, time: string): string {
  return `Day ${day} • ${time}`;
}

export function formatSeed(seed: number): string {
  return `0x${seed.toString(16).toUpperCase().padStart(8, "0")}`;
}

export const DETERMINISM_SEEDS = [42, 1337, 9001, 2026] as const;
