/**
 * Simulation Event Contracts — Strict Determinism & Rich Metadata
 *
 * Defines strongly-typed simulation events published over the DeterministicEventBus.
 * 100% seed-driven event IDs and multi-key deterministic event sorting.
 */

import { PipelineStage } from "../../world/contracts/simulationEngineContract";

export type SimulationEventType =
  | "ACTIVITY_STARTED"
  | "ACTIVITY_ENDED"
  | "ACTIVITY_INTERRUPTED"
  | "TASK_PROGRESS_UPDATED"
  | "TASK_COMPLETED"
  | "ENERGY_LOW"
  | "FOCUS_DEPLETED"
  | "SLEEP_NEEDED"
  | "NOTIFICATION_RECEIVED"
  | "MEETING_STARTED"
  | "ROUTINE_CHANGED";

export type EventSubsystem =
  | "BIOMETRIC"
  | "ACTIVITY"
  | "TASK"
  | "ENVIRONMENT"
  | "ROUTINE"
  | "PROJECT"
  | "SCHEDULER";

export interface SimulationEvent {
  eventId: string;
  eventType: SimulationEventType;
  runUid: string;
  sequenceNumber: number;
  eventIndex: number;
  pipelineStage: PipelineStage;
  subsystem: EventSubsystem;
  parentEventId?: string;
  virtualDay: number;
  virtualMinute: number;
  virtualTimestamp: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
}

export function createSimulationEvent(params: {
  eventType: SimulationEventType;
  runUid: string;
  sequenceNumber: number;
  eventIndex: number;
  pipelineStage: PipelineStage;
  subsystem: EventSubsystem;
  parentEventId?: string;
  virtualDay: number;
  virtualMinute: number;
  virtualTimestamp: string;
  title: string;
  description: string;
  payload?: Record<string, unknown>;
}): SimulationEvent {
  const eventId = `EVT_${params.runUid}_m${params.virtualMinute}_st${params.pipelineStage}_seq${params.sequenceNumber}`;

  return {
    eventId,
    eventType: params.eventType,
    runUid: params.runUid,
    sequenceNumber: params.sequenceNumber,
    eventIndex: params.eventIndex,
    pipelineStage: params.pipelineStage,
    subsystem: params.subsystem,
    parentEventId: params.parentEventId,
    virtualDay: params.virtualDay,
    virtualMinute: params.virtualMinute,
    virtualTimestamp: params.virtualTimestamp,
    title: params.title,
    description: params.description,
    payload: params.payload ?? {},
  };
}
