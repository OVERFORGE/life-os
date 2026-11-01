/**
 * ScheduleExtractionHelper.ts
 *
 * Deterministic schedule metrics extractor with interval merging and overnight boundary support.
 * Part of Phase B1 Canonical Personal World Model (WP1).
 */

import mongoose from "mongoose";
import { IOperationalScheduleProjection } from "./contracts/LifeContextProjectionContracts";
import { getActiveDate } from "../automation/timeUtils";

export interface ScheduleExtractionOptions {
  userId: string;
  referenceTimeMs: number;
  userTimezone: string;
  wakeMinute?: number; // Default: 480 (08:00)
  sleepMinute?: number; // Default: 1380 (23:00)
  focusBlockThresholdMinutes?: number; // Default: 90
  timeoutMs?: number; // Default: 75ms
  rawOccurrences?: any[]; // Optional direct injection for tests or cached reads
}

export interface RawInterval {
  start: number;
  end: number;
  rawStart: number;
  title: string;
  kind?: string;
  rigidity?: string;
}

export class ScheduleExtractionHelper {
  public static readonly DEFAULT_WAKE_MINUTE = 480; // 08:00
  public static readonly DEFAULT_SLEEP_MINUTE = 1380; // 23:00
  public static readonly DEFAULT_FOCUS_THRESHOLD = 90; // 90 min
  public static readonly DEFAULT_QUERY_TIMEOUT_MS = 75; // 75ms server ceiling

  /**
   * Computes the span of the active day in minutes, taking overnight schedules into account.
   */
  public static calculateActiveDaySpanMinutes(wakeMinute: number, sleepMinute: number): number {
    if (sleepMinute <= wakeMinute) {
      return (1440 - wakeMinute) + sleepMinute;
    }
    return sleepMinute - wakeMinute;
  }

  /**
   * Returns the local minute of the day [0 - 1439] for a given timestamp and timezone.
   */
  public static getMinuteOfDay(date: Date, timezone: string): number {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || "UTC",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      });
      const parts = formatter.formatToParts(date);
      let hour = 0;
      let minute = 0;
      for (const p of parts) {
        if (p.type === "hour") hour = parseInt(p.value, 10);
        if (p.type === "minute") minute = parseInt(p.value, 10);
      }
      if (hour === 24) hour = 0;
      return hour * 60 + minute;
    } catch (_) {
      return date.getUTCHours() * 60 + date.getUTCMinutes();
    }
  }

  /**
   * Formats a minute of day into HH:MM string format.
   */
  public static formatMinuteToTimeString(minuteOfDay: number): string {
    const norm = ((minuteOfDay % 1440) + 1440) % 1440;
    const h = Math.floor(norm / 60);
    const m = norm % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  }

  /**
   * Merges contiguous or overlapping intervals to prevent double-counting.
   */
  public static mergeIntervals(intervals: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
    if (intervals.length === 0) return [];

    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];

    for (const item of sorted) {
      if (merged.length === 0) {
        merged.push({ start: item.start, end: item.end });
      } else {
        const last = merged[merged.length - 1];
        if (item.start <= last.end) {
          last.end = Math.max(last.end, item.end);
        } else {
          merged.push({ start: item.start, end: item.end });
        }
      }
    }

    return merged;
  }

  /**
   * Queries TemporalOccurrence records for the user and target date with maxTimeMS(75).
   */
  public static async fetchOccurrencesFromDatabase(
    userId: string,
    targetDateOnly: string,
    timeoutMs: number = ScheduleExtractionHelper.DEFAULT_QUERY_TIMEOUT_MS
  ): Promise<{ occurrences: any[]; status: "AUTHORITATIVE" | "FALLBACK_EMPTY" | "DEGRADED" }> {
    if (mongoose.connection.readyState !== 1) {
      return { occurrences: [], status: "FALLBACK_EMPTY" };
    }

    try {
      let occurrenceModel = (mongoose.models as any)?.TemporalOccurrence;
      if (!occurrenceModel) {
        try {
          occurrenceModel = (await import("../../../../apps/web/server/db/models/TemporalOccurrence")).TemporalOccurrence;
        } catch (_) {
          try {
            occurrenceModel = (await import("@/server/db/models/TemporalOccurrence")).TemporalOccurrence;
          } catch (_) {}
        }
      }

      if (!occurrenceModel) {
        return { occurrences: [], status: "FALLBACK_EMPTY" };
      }

      // Execute query with server-side timeout
      const occurrences = await occurrenceModel
        .find({
          userId,
          dateOnly: targetDateOnly,
          status: { $nin: ["CANCELLED", "SKIPPED"] },
        })
        .maxTimeMS(timeoutMs)
        .lean()
        .exec();

      return {
        occurrences: Array.isArray(occurrences) ? occurrences : [],
        status: "AUTHORITATIVE",
      };
    } catch (err: any) {
      console.warn(`[ScheduleExtractionHelper] Database query failed or timed out: ${err?.message || err}`);
      return { occurrences: [], status: "DEGRADED" };
    }
  }

  /**
   * Authoritatively extracts operational schedule metrics from TemporalOccurrences.
   */
  public static async extractSchedule(
    options: ScheduleExtractionOptions
  ): Promise<IOperationalScheduleProjection> {
    const {
      userId,
      referenceTimeMs,
      userTimezone,
      wakeMinute = ScheduleExtractionHelper.DEFAULT_WAKE_MINUTE,
      sleepMinute = ScheduleExtractionHelper.DEFAULT_SLEEP_MINUTE,
      focusBlockThresholdMinutes = ScheduleExtractionHelper.DEFAULT_FOCUS_THRESHOLD,
      timeoutMs = ScheduleExtractionHelper.DEFAULT_QUERY_TIMEOUT_MS,
      rawOccurrences,
    } = options;

    const refDate = new Date(referenceTimeMs);
    const targetDateOnly = getActiveDate(userTimezone, 4, refDate);
    const isOvernight = sleepMinute <= wakeMinute;
    const activeDaySpanMinutes = ScheduleExtractionHelper.calculateActiveDaySpanMinutes(wakeMinute, sleepMinute);
    const activeDayEndMinute = isOvernight ? sleepMinute + 1440 : sleepMinute;

    let occurrences: any[] = [];
    let dataQualityStatus: "AUTHORITATIVE" | "PARTIAL" | "FALLBACK_EMPTY" | "DEGRADED" = "AUTHORITATIVE";

    if (rawOccurrences !== undefined) {
      occurrences = rawOccurrences;
      dataQualityStatus = "AUTHORITATIVE";
    } else {
      const dbResult = await ScheduleExtractionHelper.fetchOccurrencesFromDatabase(userId, targetDateOnly, timeoutMs);
      occurrences = dbResult.occurrences;
      dataQualityStatus = dbResult.status;
    }

    // Determine current minute relative to user's timezone
    const currentMinuteRaw = ScheduleExtractionHelper.getMinuteOfDay(refDate, userTimezone);
    const effectiveCurrentMinute =
      isOvernight && currentMinuteRaw <= sleepMinute
        ? currentMinuteRaw + 1440
        : currentMinuteRaw;

    // Filter, normalize, and extract valid intervals
    const validIntervals: RawInterval[] = [];
    let inProgressCommitmentTitle: string | undefined;

    for (const occ of occurrences) {
      const interval = occ.plannedInterval;
      if (!interval || typeof interval.startMinute !== "number" || typeof interval.endMinute !== "number") {
        continue;
      }

      let start = interval.startMinute;
      let end = interval.endMinute;

      // Handle overnight occurrence coordinates
      if (isOvernight) {
        if (start < wakeMinute && start <= sleepMinute) start += 1440;
        if (end < wakeMinute && end <= sleepMinute) end += 1440;
      }
      if (end < start) {
        end += 1440; // Spans midnight
      }

      // Check if in-progress right now
      if (start <= effectiveCurrentMinute && end > effectiveCurrentMinute) {
        if (!inProgressCommitmentTitle) {
          inProgressCommitmentTitle = occ.title;
        }
      }

      // Clamp interval to user's active day
      const clampedStart = Math.max(wakeMinute, start);
      const clampedEnd = Math.min(activeDayEndMinute, end);

      if (clampedEnd > clampedStart) {
        validIntervals.push({
          start: clampedStart,
          end: clampedEnd,
          rawStart: interval.startMinute,
          title: occ.title || "Untitled Commitment",
          kind: occ.kind,
          rigidity: occ.rigidity,
        });
      }
    }

    // Merge overlapping intervals
    const mergedIntervals = ScheduleExtractionHelper.mergeIntervals(validIntervals);

    // Compute occupied duration
    const totalOccupiedDurationMinutes = mergedIntervals.reduce(
      (acc, curr) => acc + (curr.end - curr.start),
      0
    );
    const uniqueOccupiedBlockCount = mergedIntervals.length;

    // Hard commitment count (INSTITUTIONAL or HARD_EVENT or UNMOVABLE)
    const hardCommitmentCount = occurrences.filter(
      (o) => o.kind === "HARD_EVENT" || o.rigidity === "UNMOVABLE"
    ).length;

    // Next commitment: earliest upcoming event starting after current minute
    let nextCommitmentTime: string | undefined;
    let nextCommitmentTitle: string | undefined;

    const upcomingCandidates = validIntervals
      .filter((i) => i.start > effectiveCurrentMinute)
      .sort((a, b) => a.start - b.start);

    if (upcomingCandidates.length > 0) {
      const nextOne = upcomingCandidates[0];
      nextCommitmentTime = ScheduleExtractionHelper.formatMinuteToTimeString(nextOne.rawStart);
      nextCommitmentTitle = nextOne.title;
    }

    // Calculate remaining free intervals and focus blocks
    let remainingFreeIntervalsCount = 0;
    let freeFocusBlocksRemaining = 0;
    let cursor = Math.max(wakeMinute, effectiveCurrentMinute);

    for (const block of mergedIntervals) {
      if (block.end <= cursor) {
        continue;
      }
      const blockStart = Math.max(cursor, block.start);
      if (blockStart > cursor) {
        const gapMinutes = blockStart - cursor;
        remainingFreeIntervalsCount++;
        if (gapMinutes >= focusBlockThresholdMinutes) {
          freeFocusBlocksRemaining += Math.floor(gapMinutes / focusBlockThresholdMinutes);
        }
      }
      cursor = Math.max(cursor, block.end);
    }

    if (cursor < activeDayEndMinute) {
      const gapMinutes = activeDayEndMinute - cursor;
      remainingFreeIntervalsCount++;
      if (gapMinutes >= focusBlockThresholdMinutes) {
        freeFocusBlocksRemaining += Math.floor(gapMinutes / focusBlockThresholdMinutes);
      }
    }

    // Schedule density and calendar state
    const densityRatio =
      activeDaySpanMinutes > 0
        ? Math.min(1.0, Math.max(0.0, totalOccupiedDurationMinutes / activeDaySpanMinutes))
        : 0.0;
    const scheduleDensity = Number(densityRatio.toFixed(2));

    let calendarState: "FREE" | "LIGHT" | "MODERATE" | "PACKED" | "UNKNOWN" = "FREE";
    if (dataQualityStatus === "DEGRADED") {
      calendarState = "UNKNOWN";
    } else if (occurrences.length === 0 || totalOccupiedDurationMinutes === 0) {
      calendarState = "FREE";
    } else if (scheduleDensity < 0.25) {
      calendarState = "LIGHT";
    } else if (scheduleDensity < 0.65) {
      calendarState = "MODERATE";
    } else {
      calendarState = "PACKED";
    }

    const isScheduleTight = scheduleDensity >= 0.65;

    return {
      hardCommitmentCount,
      todayMeetingCount: hardCommitmentCount,
      meetingCount: hardCommitmentCount,
      todayMeetingDurationMinutes: totalOccupiedDurationMinutes,
      uniqueOccupiedBlockCount,
      totalOccupiedDurationMinutes,
      remainingFreeIntervalsCount,
      freeFocusBlocksRemaining,
      nextCommitmentTime,
      nextCommitmentTitle,
      inProgressCommitmentTitle,
      isScheduleTight,
      scheduleDensity,
      calendarState,
      activeDaySpanMinutes,
      freshnessTimestamp: referenceTimeMs,
      dataQualityStatus,
    };
  }
}

