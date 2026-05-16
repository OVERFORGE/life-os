import { DayBoundary } from "../types/HorizonTypes";

/**
 * Translates an absolute logical tick into a horizon-relative dayIndex
 * and an intra-day minute offset, based on the provided day boundaries.
 * 
 * This prevents implicit modulo math across the codebase and establishes
 * a strict translation boundary.
 */
export function tickToDayIndex(
  logicalTick: number,
  boundaries: DayBoundary[]
): { dayIndex: number; minuteWithinDay: number } {
  if (boundaries.length === 0) {
    throw new Error("Cannot translate tick: boundaries array is empty.");
  }

  // Sort boundaries by dayIndex to ensure correct sequential evaluation
  const sortedBoundaries = [...boundaries].sort((a, b) => a.dayIndex - b.dayIndex);

  let cumulativeMinutes = 0;

  for (const boundary of sortedBoundaries) {
    const dayDuration = boundary.endMinute - boundary.startMinute;
    
    // Total physical length of the day. A typical day is 1440 minutes.
    // If logicalTick falls within this day's cumulative range:
    if (logicalTick >= cumulativeMinutes && logicalTick < cumulativeMinutes + dayDuration) {
      return {
        dayIndex: boundary.dayIndex,
        minuteWithinDay: boundary.startMinute + (logicalTick - cumulativeMinutes)
      };
    }

    cumulativeMinutes += dayDuration;
  }

  // If tick exceeds all boundaries, project it relative to the last boundary
  const lastBoundary = sortedBoundaries[sortedBoundaries.length - 1];
  return {
    dayIndex: lastBoundary.dayIndex,
    minuteWithinDay: lastBoundary.startMinute + (logicalTick - cumulativeMinutes)
  };
}

/**
 * Translates a horizon-relative dayIndex and intra-day minute offset
 * into an absolute logical tick.
 */
export function dayIndexToTick(
  dayIndex: number,
  minuteWithinDay: number,
  boundaries: DayBoundary[]
): number {
  if (boundaries.length === 0) {
    throw new Error("Cannot translate dayIndex: boundaries array is empty.");
  }

  const sortedBoundaries = [...boundaries].sort((a, b) => a.dayIndex - b.dayIndex);
  let cumulativeMinutes = 0;

  for (const boundary of sortedBoundaries) {
    if (boundary.dayIndex === dayIndex) {
      if (minuteWithinDay < boundary.startMinute || minuteWithinDay > boundary.endMinute) {
        // Warning: minute is outside the defined boundary for this day.
        // We still calculate the linear tick based on the startMinute.
      }
      return cumulativeMinutes + (minuteWithinDay - boundary.startMinute);
    }
    const dayDuration = boundary.endMinute - boundary.startMinute;
    cumulativeMinutes += dayDuration;
  }

  throw new Error(`Cannot find DayBoundary for dayIndex: ${dayIndex}`);
}
