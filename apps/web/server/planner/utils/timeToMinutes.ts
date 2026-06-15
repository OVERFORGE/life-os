/**
 * Converts a 24-hour HH:MM string to absolute minutes (0-1439).
 * If invalid, returns null.
 */
export function timeStringToMinutes(timeStr: string | undefined | null): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/**
 * Normalizes an array of times (in minutes) for sleep crossover.
 * Example: 11 PM (1380) and 1 AM (60).
 * If a time is before 12:00 PM (720), we assume it's an after-midnight sleep time
 * and add 1440 minutes (24 hours) to it so it becomes mathematically comparable.
 */
export function normalizeSleepMinutes(minutesArray: number[]): number[] {
  return minutesArray.map((m) => {
    if (m < 720) return m + 1440; // Convert 1 AM to 25th hour
    return m;
  });
}

/**
 * Denormalizes sleep average back to 0-1439 scale.
 */
export function denormalizeSleepMinutes(avg: number): number {
  return avg >= 1440 ? avg - 1440 : avg;
}
