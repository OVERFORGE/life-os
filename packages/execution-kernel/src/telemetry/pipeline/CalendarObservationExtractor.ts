/**
 * CalendarObservationExtractor.ts
 * Extracts normalized, deterministic observations from external calendar events.
 * Part of Phase 2 Continuous Telemetry Engine.
 */

import { Observation, createFrozenObservation, generateDeterministicObservationId } from "../Observation";
import { RawCalendarEvent } from "../contracts/ObservationEventContracts";

export interface CalendarExtractionInput {
  userId: string;
  dayStartMs: number; // Start of target day (e.g., 00:00:00 UTC or user timezone)
  events: RawCalendarEvent[];
  generationTimestamp?: number;
}

export class CalendarObservationExtractor {
  private static readonly WORKDAY_MS = 8 * 60 * 60 * 1000; // 8-hour workday reference (28,800,000 ms)
  private static readonly FRAGMENTATION_GAP_THRESHOLD_MS = 45 * 60 * 1000; // 45 min
  private static readonly MAX_DEEP_WORK_REFERENCE_MS = 4 * 60 * 60 * 1000; // 4 hours

  /**
   * Extracts ScheduleDensity, CalendarFragmentation, and DeepWorkWindow observations.
   */
  static extractObservations(input: CalendarExtractionInput): Observation[] {
    const { userId, dayStartMs, events, generationTimestamp = Date.now() } = input;
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

    // Filter confirmed/active non-all-day meetings falling within the day
    const validEvents = events
      .filter((e) => !e.isAllDay && e.status !== "cancelled" && e.endTime > dayStartMs && e.startTime < dayEndMs)
      .map((e) => ({
        startTime: Math.max(dayStartMs, e.startTime),
        endTime: Math.min(dayEndMs, e.endTime),
        id: e.id,
      }))
      .sort((a, b) => a.startTime - b.startTime);

    // Merge overlapping intervals to accurately compute busy time and gaps
    const mergedIntervals: Array<{ start: number; end: number }> = [];
    for (const ev of validEvents) {
      if (mergedIntervals.length === 0) {
        mergedIntervals.push({ start: ev.startTime, end: ev.endTime });
      } else {
        const last = mergedIntervals[mergedIntervals.length - 1];
        if (ev.startTime <= last.end) {
          last.end = Math.max(last.end, ev.endTime);
        } else {
          mergedIntervals.push({ start: ev.startTime, end: ev.endTime });
        }
      }
    }

    // 1. Calculate total meeting duration
    let totalMeetingMs = 0;
    for (const interval of mergedIntervals) {
      totalMeetingMs += interval.end - interval.start;
    }

    const meetingHours = totalMeetingMs / (60 * 60 * 1000);
    const scheduleDensityNorm = Math.min(1.0, Math.max(0.0, totalMeetingMs / CalendarObservationExtractor.WORKDAY_MS));

    // 2. Calculate fragmentation and deep work gaps
    let shortGapsCount = 0;
    let maxFreeGapMs = 0;

    if (mergedIntervals.length > 0) {
      // Workday bounds: 9 AM to 5 PM relative to dayStartMs (or first event to last event)
      const workStartMs = dayStartMs + 9 * 60 * 60 * 1000;
      const workEndMs = dayStartMs + 17 * 60 * 60 * 1000;

      // Initial gap before first meeting during workday
      if (mergedIntervals[0].start > workStartMs) {
        const gap = Math.min(mergedIntervals[0].start, workEndMs) - workStartMs;
        if (gap > 0) {
          if (gap < CalendarObservationExtractor.FRAGMENTATION_GAP_THRESHOLD_MS) shortGapsCount++;
          if (gap > maxFreeGapMs) maxFreeGapMs = gap;
        }
      }

      // Intermediate gaps
      for (let i = 0; i < mergedIntervals.length - 1; i++) {
        const gap = mergedIntervals[i + 1].start - mergedIntervals[i].end;
        if (gap > 0) {
          if (gap < CalendarObservationExtractor.FRAGMENTATION_GAP_THRESHOLD_MS) {
            shortGapsCount++;
          }
          if (gap > maxFreeGapMs) {
            maxFreeGapMs = gap;
          }
        }
      }

      // Post-meeting gap during workday
      const lastEnd = mergedIntervals[mergedIntervals.length - 1].end;
      if (lastEnd < workEndMs) {
        const gap = workEndMs - Math.max(lastEnd, workStartMs);
        if (gap > 0) {
          if (gap < CalendarObservationExtractor.FRAGMENTATION_GAP_THRESHOLD_MS) shortGapsCount++;
          if (gap > maxFreeGapMs) maxFreeGapMs = gap;
        }
      }
    } else {
      // Free day
      maxFreeGapMs = CalendarObservationExtractor.WORKDAY_MS;
    }

    const fragmentationNorm = Math.min(1.0, shortGapsCount / 5.0);
    const deepWorkNorm = Math.min(1.0, maxFreeGapMs / CalendarObservationExtractor.MAX_DEEP_WORK_REFERENCE_MS);
    const deepWorkHours = maxFreeGapMs / (60 * 60 * 1000);

    const sourceDayKey = new Date(dayStartMs).toISOString().split("T")[0];
    const observations: Observation[] = [];

    // Observation 1: ScheduleDensity
    observations.push(
      createFrozenObservation({
        id: generateDeterministicObservationId("ScheduleDensity", sourceDayKey, dayStartMs),
        type: "ScheduleDensity",
        userId,
        timestamp: dayStartMs,
        generatedAt: generationTimestamp,
        generatedBy: "CalendarObservationExtractor-v1",
        confidence: 1.0,
        normalizedValue: Number(scheduleDensityNorm.toFixed(3)),
        rawValue: Number(meetingHours.toFixed(2)),
        unit: "hours",
        metadata: {
          meetingCount: validEvents.length,
          mergedIntervalCount: mergedIntervals.length,
          totalMeetingMinutes: Math.round(totalMeetingMs / 60000),
        },
        ownership: {
          sourceCollection: "calendar_events",
          sourceEntityId: `cal-${sourceDayKey}`,
          originatingSubsystem: "CalendarTelemetry",
          createdAt: dayStartMs,
        },
      })
    );

    // Observation 2: CalendarFragmentation
    observations.push(
      createFrozenObservation({
        id: generateDeterministicObservationId("CalendarFragmentation", sourceDayKey, dayStartMs),
        type: "CalendarFragmentation",
        userId,
        timestamp: dayStartMs,
        generatedAt: generationTimestamp,
        generatedBy: "CalendarObservationExtractor-v1",
        confidence: 1.0,
        normalizedValue: Number(fragmentationNorm.toFixed(3)),
        rawValue: shortGapsCount,
        unit: "gaps",
        metadata: {
          fragmentedGapCount: shortGapsCount,
          thresholdMinutes: 45,
        },
        ownership: {
          sourceCollection: "calendar_events",
          sourceEntityId: `cal-${sourceDayKey}`,
          originatingSubsystem: "CalendarTelemetry",
          createdAt: dayStartMs,
        },
      })
    );

    // Observation 3: DeepWorkWindow
    observations.push(
      createFrozenObservation({
        id: generateDeterministicObservationId("DeepWorkWindow", sourceDayKey, dayStartMs),
        type: "DeepWorkWindow",
        userId,
        timestamp: dayStartMs,
        generatedAt: generationTimestamp,
        generatedBy: "CalendarObservationExtractor-v1",
        confidence: 1.0,
        normalizedValue: Number(deepWorkNorm.toFixed(3)),
        rawValue: Number(deepWorkHours.toFixed(2)),
        unit: "hours",
        metadata: {
          maxContinuousBlockMinutes: Math.round(maxFreeGapMs / 60000),
        },
        ownership: {
          sourceCollection: "calendar_events",
          sourceEntityId: `cal-${sourceDayKey}`,
          originatingSubsystem: "CalendarTelemetry",
          createdAt: dayStartMs,
        },
      })
    );

    return observations;
  }
}
