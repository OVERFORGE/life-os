/**
 * b1OperationalSchedule.test.ts
 *
 * Unit tests verifying Loop 1 (WP1) ScheduleExtractionHelper:
 * - Overlapping interval merging (eliminating double counting)
 * - Overnight schedule calculation
 * - In-progress and next commitment identification
 * - Focus block detection
 * - Truthful metrics with empty schedule
 */

import test from "node:test";
import assert from "node:assert/strict";
import { ScheduleExtractionHelper } from "../worldv2/ScheduleExtractionHelper";

test("LOOP 1 (WP1): Operational Schedule & Interval Merging Verification", async (suite) => {
  await suite.test("SCHED-01: Overlapping intervals merge cleanly and do not double-count duration", async () => {
    // Reference time: 09:00 UTC (540 minutes into day)
    const refDate = new Date("2026-10-30T09:00:00Z");
    const refMs = refDate.getTime();

    // Two overlapping meetings: 10:00 - 11:00 (60m) and 10:30 - 11:30 (60m)
    // Individual sum would be 120m, but merged interval is 10:00 - 11:30 (90m)
    const rawOccurrences = [
      {
        occurrenceId: "occ-1",
        title: "Sprint Planning",
        kind: "HARD_EVENT",
        rigidity: "UNMOVABLE",
        plannedInterval: {
          startMinute: 600, // 10:00
          endMinute: 660,   // 11:00
          durationMinutes: 60,
        },
      },
      {
        occurrenceId: "occ-2",
        title: "Architecture Sync",
        kind: "HARD_EVENT",
        rigidity: "UNMOVABLE",
        plannedInterval: {
          startMinute: 630, // 10:30
          endMinute: 690,   // 11:30
          durationMinutes: 60,
        },
      },
    ];

    const projection = await ScheduleExtractionHelper.extractSchedule({
      userId: "test-user-1",
      referenceTimeMs: refMs,
      userTimezone: "UTC",
      wakeMinute: 480,  // 08:00
      sleepMinute: 1380, // 23:00
      rawOccurrences,
    });

    assert.equal(projection.hardCommitmentCount, 2, "Both hard commitments counted in hardCommitmentCount");
    assert.equal(projection.todayMeetingCount, 2);
    assert.equal(projection.uniqueOccupiedBlockCount, 1, "Merged into 1 continuous occupied block");
    assert.equal(projection.totalOccupiedDurationMinutes, 90, "Total duration must be 90m, NOT 120m");
    assert.equal(projection.todayMeetingDurationMinutes, 90);
    assert.equal(projection.nextCommitmentTime, "10:00");
    assert.equal(projection.nextCommitmentTitle, "Sprint Planning");
    assert.equal(projection.inProgressCommitmentTitle, undefined);
  });

  await suite.test("SCHED-02: Overnight active day span correctly spans midnight", async () => {
    // Wake 08:00 (480), Sleep 01:00 AM next day (60)
    const span = ScheduleExtractionHelper.calculateActiveDaySpanMinutes(480, 60);
    // (1440 - 480) + 60 = 960 + 60 = 1020 minutes (17 hours)
    assert.equal(span, 1020, "Overnight span from 08:00 to 01:00 must be 1020 minutes");

    // Reference time: 23:45 UTC (1425 minutes)
    const refDate = new Date("2026-10-30T23:45:00Z");
    const refMs = refDate.getTime();

    const lateMeeting = [
      {
        occurrenceId: "occ-late",
        title: "Midnight Release Call",
        kind: "HARD_EVENT",
        rigidity: "UNMOVABLE",
        plannedInterval: {
          startMinute: 1410, // 23:30
          endMinute: 1470,   // 00:30 next day
          durationMinutes: 60,
        },
      },
    ];

    const projection = await ScheduleExtractionHelper.extractSchedule({
      userId: "test-user-overnight",
      referenceTimeMs: refMs,
      userTimezone: "UTC",
      wakeMinute: 480,
      sleepMinute: 60,
      rawOccurrences: lateMeeting,
    });

    assert.equal(projection.inProgressCommitmentTitle, "Midnight Release Call", "Late meeting must be in-progress at 23:45");
    assert.equal(projection.uniqueOccupiedBlockCount, 1);
    assert.equal(projection.totalOccupiedDurationMinutes, 60);
  });

  await suite.test("SCHED-03: Focus block gaps (>= 90m) are calculated correctly", async () => {
    // Reference time: 08:00 UTC (480)
    const refDate = new Date("2026-10-30T08:00:00Z");
    const refMs = refDate.getTime();

    // Meetings:
    // 09:00 - 10:00 (540 - 600) -> Gap before: 08:00 - 09:00 (60m, < 90m -> not a focus block)
    // 13:00 - 14:00 (780 - 840) -> Gap between: 10:00 - 13:00 (180m, = 2 focus blocks of 90m)
    // End of day: 23:00 (1380)  -> Gap after: 14:00 - 23:00 (540m, = 6 focus blocks of 90m)
    const rawOccurrences = [
      {
        occurrenceId: "m1",
        title: "Morning Sync",
        kind: "WORK_SESSION",
        plannedInterval: { startMinute: 540, endMinute: 600, durationMinutes: 60 },
      },
      {
        occurrenceId: "m2",
        title: "Lunch Review",
        kind: "WORK_SESSION",
        plannedInterval: { startMinute: 780, endMinute: 840, durationMinutes: 60 },
      },
    ];

    const projection = await ScheduleExtractionHelper.extractSchedule({
      userId: "test-user-focus",
      referenceTimeMs: refMs,
      userTimezone: "UTC",
      wakeMinute: 480,
      sleepMinute: 1380,
      focusBlockThresholdMinutes: 90,
      rawOccurrences,
    });

    // Gaps:
    // 1) 480 to 540: 60m (0 focus blocks, 1 free interval)
    // 2) 600 to 780: 180m (2 focus blocks, 1 free interval)
    // 3) 840 to 1380: 540m (6 focus blocks, 1 free interval)
    // Total free intervals: 3, Total focus blocks: 8
    assert.equal(projection.remainingFreeIntervalsCount, 3);
    assert.equal(projection.freeFocusBlocksRemaining, 8);
  });

  await suite.test("SCHED-04: Empty schedule produces truthful zero values, never static fallbacks", async () => {
    const refDate = new Date("2026-10-30T10:00:00Z");
    const refMs = refDate.getTime();

    const projection = await ScheduleExtractionHelper.extractSchedule({
      userId: "test-empty-user",
      referenceTimeMs: refMs,
      userTimezone: "UTC",
      wakeMinute: 480,
      sleepMinute: 1380,
      rawOccurrences: [],
    });

    assert.equal(projection.hardCommitmentCount, 0, "No meetings in empty schedule");
    assert.equal(projection.todayMeetingCount, 0);
    assert.equal(projection.todayMeetingDurationMinutes, 0);
    assert.equal(projection.uniqueOccupiedBlockCount, 0);
    assert.equal(projection.totalOccupiedDurationMinutes, 0);
    assert.equal(projection.scheduleDensity, 0.0);
    assert.equal(projection.calendarState, "FREE");
    assert.equal(projection.isScheduleTight, false);
    assert.equal(projection.inProgressCommitmentTitle, undefined);
    assert.equal(projection.nextCommitmentTime, undefined);
  });
});

