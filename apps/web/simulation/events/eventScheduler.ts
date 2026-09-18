/**
 * EventScheduler — Deterministic Scheduled Event Manager
 *
 * Schedules notifications, reminders, meetings, and weather shifts at exact virtual minutes.
 * Injects scheduled events directly into the DeterministicEventBus upon reach.
 */

import { DeterministicEventBus } from "./deterministicEventBus";
import { SimulationEvent, createSimulationEvent, SimulationEventType } from "./contracts/eventContracts";
import { PipelineStage } from "../world/contracts/simulationEngineContract";

export interface ScheduledTask {
  triggerVirtualMinute: number;
  eventType: SimulationEventType;
  title: string;
  description: string;
  payload?: Record<string, unknown>;
}

export class EventScheduler {
  private queue: ScheduledTask[] = [];

  public schedule(task: ScheduledTask): void {
    this.queue.push(task);
    this.queue.sort((a, b) => a.triggerVirtualMinute - b.triggerVirtualMinute);
  }

  public checkAndFire(
    runUid: string,
    virtualDay: number,
    virtualMinute: number,
    timestampVirtual: string,
    eventBus: DeterministicEventBus
  ): SimulationEvent[] {
    const fired: SimulationEvent[] = [];
    const remaining: ScheduledTask[] = [];

    for (const task of this.queue) {
      if (task.triggerVirtualMinute <= virtualMinute) {
        const evt = createSimulationEvent({
          eventType: task.eventType,
          runUid,
          sequenceNumber: eventBus.getNextSequenceNumber(),
          eventIndex: 1,
          pipelineStage: PipelineStage.SCHEDULER_ENGINE,
          subsystem: "SCHEDULER",
          virtualDay,
          virtualMinute,
          virtualTimestamp: timestampVirtual,
          title: task.title,
          description: task.description,
          payload: task.payload ?? {},
        });
        eventBus.publish(evt);
        fired.push(evt);
      } else {
        remaining.push(task);
      }
    }

    this.queue = remaining;
    return fired;
  }
}
