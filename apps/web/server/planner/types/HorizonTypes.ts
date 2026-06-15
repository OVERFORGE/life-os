import { TemporalWindow } from "../utils/TemporalWindow";

export type HorizonFailureReason =
  | "unresolvable_conflict"
  | "dependency_deadlock"
  | "horizon_exhausted"
  | "repair_instability";

export interface PlanningHorizon {
  horizonId: string;

  startDayIndex: number;
  endDayIndex: number;

  totalDays: number;

  rollingWindow: boolean;

  horizonHash: string;
}

export interface DayBoundary {
  dayIndex: number;

  startMinute: number;
  endMinute: number;

  sleepWindow?: TemporalWindow;

  carryOverBufferMinutes: number;
}

export interface DeferredCarryForward {
  chunkId: string;

  fromDayIndex: number;
  toDayIndex: number;

  carryReason:
    | "unfinished"
    | "repair_displacement"
    | "deadline_protection"
    | "recovery_protection";

  deferredMinutes: number;
}
