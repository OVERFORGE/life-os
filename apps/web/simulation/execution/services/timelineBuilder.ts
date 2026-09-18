/**
 * TimelineBuilder — Subsystem for Canonical SimulationTimeline DTO Assembly
 *
 * Responsible strictly for constructing versioned SimulationTimeline DTOs ("1.0.0").
 * Decoupled from event recording (TimelineRecorder) and hashing (TimelineHasher).
 */

import {
  TimelineEvent,
  SimulationTimeline,
  TIMELINE_SCHEMA_VERSION,
} from "../../runtime/contracts/timelineContracts";

export class TimelineBuilder {
  /**
   * Assembles a canonical versioned SimulationTimeline DTO from recorded timeline events.
   */
  public static buildTimeline(
    runUid: string,
    seed: number,
    events: readonly TimelineEvent[]
  ): SimulationTimeline {
    return {
      metadata: {
        timelineVersion: TIMELINE_SCHEMA_VERSION,
        runUid,
        seed,
        totalEvents: events.length,
      },
      events: [...events],
    };
  }
}
