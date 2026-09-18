/**
 * TimelineRecorder — Subsystem for Collecting & Constructing Timeline Events
 *
 * Collects TimelineRecorderInput fact entries emitted during runtime simulation execution,
 * assigns monotonic sequence numbers and canonical eventId strings, and constructs TimelineEvents.
 * Single authority for TimelineEvent construction.
 */

import {
  TimelineEvent,
  TimelineEventType,
  TimelineRecorderInput,
  createDeterministicEventId,
} from "./contracts/timelineContracts";

export class TimelineRecorder {
  private events: TimelineEvent[] = [];

  /**
   * Records a timeline fact input and constructs a canonical TimelineEvent.
   */
  public recordEvent<T extends TimelineEventType>(
    runUid: string,
    input: TimelineRecorderInput<T>
  ): void {
    const sequence = this.events.length + 1;
    const eventId = createDeterministicEventId(runUid, sequence);

    const event: TimelineEvent<T> = {
      eventId,
      sequence,
      tick: input.tick,
      virtualDay: input.virtualDay,
      virtualMinute: input.virtualMinute,
      type: input.type,
      payload: input.payload,
    };

    this.events.push(event as TimelineEvent);
  }

  /**
   * Returns read-only array of all recorded timeline events.
   */
  public getEvents(): readonly TimelineEvent[] {
    return this.events;
  }

  /**
   * Clears recorded events.
   */
  public clear(): void {
    this.events = [];
  }
}
