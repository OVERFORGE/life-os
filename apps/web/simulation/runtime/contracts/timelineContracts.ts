/**
 * Timeline Contracts — Canonical Specifications for Chronological Simulation History
 *
 * Defines TIMELINE_SCHEMA_VERSION ("1.0.0"), TimelineEventType enum, discriminated payload map,
 * TimelineRecorderInput DTO, TimelineEvent interface, TimelineMetadata, and SimulationTimeline.
 */

export const TIMELINE_SCHEMA_VERSION = "1.0.0" as const;

export enum TimelineEventType {
  SIMULATION_STARTED = "SIMULATION_STARTED",
  TICK_EXECUTED = "TICK_EXECUTED",
  SNAPSHOT_CREATED = "SNAPSHOT_CREATED",
  DAY_COMPLETED = "DAY_COMPLETED",
  SIMULATION_FINISHED = "SIMULATION_FINISHED",
}

export interface SimulationStartedPayload {
  seed: number;
  startDay: number;
  startMinute: number;
}

export interface TickExecutedPayload {
  worldHash: string;
  eventsCount: number;
}

export interface SnapshotCreatedPayload {
  snapshotId: string;
  worldHash: string;
}

export interface DayCompletedPayload {
  day: number;
  focusMinutes: number;
  completedActivities: number;
}

export interface SimulationFinishedPayload {
  finalDay: number;
  totalTicks: number;
  replayHash: string;
}

export interface TimelineEventPayloadMap {
  [TimelineEventType.SIMULATION_STARTED]: SimulationStartedPayload;
  [TimelineEventType.TICK_EXECUTED]: TickExecutedPayload;
  [TimelineEventType.SNAPSHOT_CREATED]: SnapshotCreatedPayload;
  [TimelineEventType.DAY_COMPLETED]: DayCompletedPayload;
  [TimelineEventType.SIMULATION_FINISHED]: SimulationFinishedPayload;
}

export interface TimelineRecorderInput<T extends TimelineEventType = TimelineEventType> {
  tick: number;
  virtualDay: number;
  virtualMinute: number;
  type: T;
  payload: TimelineEventPayloadMap[T];
}

export interface TimelineEvent<T extends TimelineEventType = TimelineEventType> {
  eventId: string; // e.g. "TLE_RUN001_s000001"
  sequence: number;
  tick: number;
  virtualDay: number;
  virtualMinute: number;
  type: T;
  payload: TimelineEventPayloadMap[T];
}

export interface TimelineMetadata {
  timelineVersion: typeof TIMELINE_SCHEMA_VERSION;
  runUid: string;
  seed: number;
  totalEvents: number;
}

export interface SimulationTimeline {
  metadata: TimelineMetadata;
  events: readonly TimelineEvent[];
}

/**
 * Derives a canonical deterministic event identifier from run UID and sequence number.
 */
export function createDeterministicEventId(runUid: string, sequence: number): string {
  return `TLE_${runUid}_s${sequence.toString().padStart(6, "0")}`;
}
