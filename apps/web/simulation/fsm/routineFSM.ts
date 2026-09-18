/**
 * RoutineFSM — Finite State Machine for Daily Routine Phases
 *
 * States: MORNING | DEEP_WORK | EXERCISE | LUNCH | EVENING | SLEEP
 */

export type RoutineState =
  | "MORNING"
  | "DEEP_WORK"
  | "EXERCISE"
  | "LUNCH"
  | "EVENING"
  | "SLEEP";

export class RoutineFSM {
  /**
   * Derives the active routine state for a given minute of the virtual day (0..1439).
   */
  public static getRoutineStateForMinute(virtualMinute: number): RoutineState {
    const minuteOfDay = virtualMinute % 1440;

    // 06:00 - 08:00 (360 - 480)
    if (minuteOfDay >= 360 && minuteOfDay < 480) {
      return "MORNING";
    }

    // 08:00 - 12:00 (480 - 720)
    if (minuteOfDay >= 480 && minuteOfDay < 720) {
      return "DEEP_WORK";
    }

    // 12:00 - 13:00 (720 - 780)
    if (minuteOfDay >= 720 && minuteOfDay < 780) {
      return "LUNCH";
    }

    // 13:00 - 17:00 (780 - 1020)
    if (minuteOfDay >= 780 && minuteOfDay < 1020) {
      return "DEEP_WORK";
    }

    // 17:00 - 18:30 (1020 - 1110)
    if (minuteOfDay >= 1020 && minuteOfDay < 1110) {
      return "EXERCISE";
    }

    // 18:30 - 22:30 (1110 - 1350)
    if (minuteOfDay >= 1110 && minuteOfDay < 1350) {
      return "EVENING";
    }

    // 22:30 - 06:00 (1350 - 360)
    return "SLEEP";
  }
}
