/**
 * Daily Lifecycle Contracts — DTOs & Event Specifications for Semantic Day Boundaries
 *
 * Defines DailyTransitionEventType enum, DailyTransitionEvent, DailySummary DTO,
 * and DailyLifecycleResult contracts.
 */

export enum DailyTransitionEventType {
  DAY_COMPLETED = "DAY_COMPLETED",
  SLEEP_COMPLETED = "SLEEP_COMPLETED",
  GOALS_EVALUATED = "GOALS_EVALUATED",
  MEMORY_CONSOLIDATED = "MEMORY_CONSOLIDATED",
  HABITS_FINALIZED = "HABITS_FINALIZED",
}

export interface DailyTransitionEvent {
  type: DailyTransitionEventType;
  payload?: Record<string, unknown>;
}

export interface DailySummary {
  day: number;
  focusMinutes: number;
  completedActivities: number;
  endingEnergy: number;
  endingStress: number;
  endingFatigue: number;
  sleepMinutes: number;
  completedTasks: number;
  unfinishedTasks: number;
}

export interface DailyLifecycleResult {
  previousDay: number;
  newDay: number;
  dailySummary: DailySummary;
  transitionEvents: DailyTransitionEvent[];
}
