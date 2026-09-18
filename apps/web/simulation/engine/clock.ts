/**
 * Deterministic Simulation Clock — Phase 1.3
 * Pure functional module for time derivation and tick calculations.
 * NO database, NO React state, NO API logic, NO timers/intervals.
 */

export interface ClockState {
  tick: number;
  startDay: number;
  startMinute: number;
}

/** Converts "HH:MM" 24h time to minute-of-day integer (0 - 1439). */
export function timeToMinute(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return 480; // default 08:00
  return Math.max(0, Math.min(1439, h * 60 + m));
}

/** Converts minute-of-day integer (0 - 1439) to "HH:MM" string. */
export function minuteToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Derives virtual day and minute-of-day from monotonic tick counter. */
export function deriveTimeFromTicks(
  tick: number,
  startDay: number = 1,
  startMinute: number = 480,
  tickIntervalMinutes: number = 1
) {
  const totalElapsedMinutes = Math.max(0, tick) * Math.max(1, tickIntervalMinutes);
  const totalMinutesFromZero = (startDay - 1) * 1440 + startMinute + totalElapsedMinutes;

  const currentDay = Math.floor(totalMinutesFromZero / 1440) + 1;
  const currentMinute = totalMinutesFromZero % 1440;

  return {
    currentDay,
    currentMinute,
    elapsedMinutes: totalElapsedMinutes,
    formattedTime: minuteToTime(currentMinute),
  };
}

/** Formats human-readable timestamp e.g. "Day 1 • 08:00". */
export function formatTimestamp(day: number, minute: number): string {
  return `Day ${day} • ${minuteToTime(minute)}`;
}

/** Advance clock state deterministically by N ticks. */
export function advanceClock(
  clock: ClockState,
  ticks: number = 1,
  tickIntervalMinutes: number = 1
): ClockState {
  const newTick = Math.max(0, clock.tick + Math.max(1, ticks));
  return {
    ...clock,
    tick: newTick,
  };
}

/** Reset clock state back to tick 0. */
export function resetClock(startDay: number = 1, startMinute: number = 480): ClockState {
  return {
    tick: 0,
    startDay,
    startMinute,
  };
}
