/**
 * WorldStateContracts — Canonical Simulated World State & Accessors
 *
 * Persists ONLY canonical raw state. Derived values (formatted timestamps,
 * remaining session duration, completion percentages) are computed via accessors.
 */

import { ActivitySession } from "./activitySession";
import { formatTimestamp } from "../../engine/clock";

export interface Biometrics {
  energy: number;          // 0.0 to 100.0
  focus: number;           // 0.0 to 100.0
  fatigue: number;         // 0.0 to 100.0
  sleepPressure: number;   // 0.0 to 100.0
  hunger: number;          // 0.0 to 100.0
  hydration: number;       // 0.0 to 100.0
  stress: number;          // 0.0 to 100.0
}

export interface SimulatedWorldState {
  version: number;
  runUid: string;
  virtualDay: number;
  virtualMinute: number;
  biometrics: Biometrics;
  activeSession: ActivitySession | null;
  currentRoutinePhase: string;
  location: string;
  environment: {
    noiseLevel: "quiet" | "moderate" | "loud";
    weather: "Clear" | "Rainy" | "Cloudy";
  };
  totalFocusMinutes: number;
  completedActivitiesCount: number;
  executionStreakMins: number;
  activeTaskId: string | null;
  activeTaskProgress: number;
}

export function createInitialWorldState(
  runUid: string,
  startDay: number = 1,
  startMinute: number = 480
): SimulatedWorldState {
  return {
    version: 1,
    runUid,
    virtualDay: startDay,
    virtualMinute: startMinute,
    biometrics: {
      energy: 85.0,
      focus: 90.0,
      fatigue: 10.0,
      sleepPressure: 15.0,
      hunger: 20.0,
      hydration: 85.0,
      stress: 15.0,
    },
    activeSession: null,
    currentRoutinePhase: "DEEP_WORK",
    location: "Home Office",
    environment: {
      noiseLevel: "quiet",
      weather: "Clear",
    },
    totalFocusMinutes: 0,
    completedActivitiesCount: 0,
    executionStreakMins: 0,
    activeTaskId: null,
    activeTaskProgress: 0,
  };
}

/** Accessor: Computes formatted timestamp string ("Day 1 • 08:00") */
export function formatWorldTimestamp(state: SimulatedWorldState): string {
  return formatTimestamp(state.virtualDay, state.virtualMinute);
}

/** Accessor: Computes remaining session duration in minutes */
export function calculateSessionRemainingMins(session: ActivitySession | null, currentVirtualMinute: number): number {
  if (!session) return 0;
  const expectedEnd = session.startedAtVirtualMinute + session.estimatedDurationMins;
  return Math.max(0, expectedEnd - currentVirtualMinute);
}

/** Accessor: Computes session progress percentage (0..100%) */
export function calculateSessionProgress(session: ActivitySession | null): number {
  if (!session || session.estimatedDurationMins <= 0) return 0;
  return Math.min(100, Math.round((session.elapsedMinutes / session.estimatedDurationMins) * 100));
}
