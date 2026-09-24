import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOccurrenceId,
  TemporalInterval,
  TemporalEntityKind,
  RigidityLevel,
  ExecutionChronicleEntry,
} from "../temporal/contracts/TemporalContracts";
import {
  normalizeTemporalInterval,
  doIntervalsOverlap,
  timeStringToMinutes,
  minutesToTimeString,
} from "../temporal/normalization/temporalNormalizer";
import {
  resolveStructuredTemporal,
  resolveTemporalExpression,
} from "../orchestration/semantic/temporalResolver";
import { StructuredTemporalMeaning } from "../orchestration/contracts/SemanticTurnContracts";
import { DOMAIN_CAPABILITIES } from "../orchestration/contracts/ActionProposalContracts";

// Fixed reference: Monday, Sept 21, 2026 14:00:00 UTC (10:00 AM EDT)
const FIXED_REF_TIME = new Date("2026-09-21T14:00:00Z").getTime();
const TEST_TIMEZONE = "America/New_York";

test("Phase 1: Canonical Occurrence Identity & Series Linkage", () => {
  // Recurring series occurrence ID format: occ_${seriesId}_${YYYYMMDD}
  const seriesId = "ser_routine_gym_morning";
  const dateOnly = "2026-09-22";
  const occId = buildOccurrenceId(seriesId, dateOnly);
  assert.equal(occId, "occ_ser_routine_gym_morning_20260922");

  // Idempotency: exact same series + date yields exact same ID
  const occId2 = buildOccurrenceId(seriesId, dateOnly);
  assert.equal(occId, occId2);

  // Ad-hoc occurrence generates unique prefix
  const adhocId = buildOccurrenceId(undefined, dateOnly);
  assert.ok(adhocId.startsWith("occ_adhoc_"));

  // Explicit fallback provided
  const customId = buildOccurrenceId(undefined, dateOnly, "custom_occ_123");
  assert.equal(customId, "custom_occ_123");
});

test("Phase 1: Deterministic Minute-of-Day Conversions", () => {
  assert.equal(timeStringToMinutes("00:00"), 0);
  assert.equal(timeStringToMinutes("09:30"), 570);
  assert.equal(timeStringToMinutes("14:00"), 840);
  assert.equal(timeStringToMinutes("23:59"), 1439);

  assert.equal(minutesToTimeString(0), "00:00");
  assert.equal(minutesToTimeString(570), "09:30");
  assert.equal(minutesToTimeString(840), "14:00");
  assert.equal(minutesToTimeString(1439), "23:59");
});

test("Phase 1: Timezone-Safe Interval Normalization & Invariants", () => {
  // Schedule a 90-minute block from 14:00 to 15:30 EDT on 2026-09-21
  const result = normalizeTemporalInterval({
    dateOnly: "2026-09-21",
    startTime: "14:00",
    endTime: "15:30",
    timezone: TEST_TIMEZONE, // EDT is UTC-4
  });

  assert.equal(result.valid, true);
  const interval = result.interval!;
  assert.equal(interval.dateOnly, "2026-09-21");
  assert.equal(interval.startMinute, 840);
  assert.equal(interval.endMinute, 930);
  assert.equal(interval.durationMinutes, 90);
  assert.equal(interval.isMidnightCrossing, false);

  // 14:00 EDT = 18:00 UTC
  assert.equal(interval.startIsoUtc, "2026-09-21T18:00:00.000Z");
  // 15:30 EDT = 19:30 UTC
  assert.equal(interval.endIsoUtc, "2026-09-21T19:30:00.000Z");

  // Duration auto-derivation: startTime + durationMinutes -> endTime
  const autoEnd = normalizeTemporalInterval({
    dateOnly: "2026-09-21",
    startTime: "10:00",
    durationMinutes: 45,
    timezone: "UTC",
  });
  assert.equal(autoEnd.valid, true);
  assert.equal(autoEnd.interval!.endMinute, 645);
  assert.equal(autoEnd.interval!.durationMinutes, 45);
  assert.equal(autoEnd.interval!.startIsoUtc, "2026-09-21T10:00:00.000Z");
  assert.equal(autoEnd.interval!.endIsoUtc, "2026-09-21T10:45:00.000Z");
});

test("Phase 1: Midnight-Crossing Interval Handling", () => {
  // Session starting at 23:00 and ending at 01:30 the next day (150 minutes)
  const result = normalizeTemporalInterval({
    dateOnly: "2026-09-21",
    startTime: "23:00",
    endTime: "01:30",
    timezone: "UTC",
  });

  assert.equal(result.valid, true);
  const interval = result.interval!;
  assert.equal(interval.startMinute, 1380);
  assert.equal(interval.endMinute, 1530); // 1440 + 90
  assert.equal(interval.durationMinutes, 150);
  assert.equal(interval.isMidnightCrossing, true);
  assert.equal(interval.startIsoUtc, "2026-09-21T23:00:00.000Z");
  assert.equal(interval.endIsoUtc, "2026-09-22T01:30:00.000Z"); // Rolled over to next day
});

test("Phase 1: Adversarial & Impossible Interval Rejection", () => {
  // 1. Negative duration
  const neg = normalizeTemporalInterval({
    dateOnly: "2026-09-21",
    startTime: "14:00",
    durationMinutes: -30,
    timezone: "UTC",
  });
  assert.equal(neg.valid, false);
  assert.ok(neg.error?.includes("NEGATIVE_DURATION"));

  // 2. Out of bounds start time (> 23:59)
  const oob = normalizeTemporalInterval({
    dateOnly: "2026-09-21",
    startTime: "25:00",
    timezone: "UTC",
  });
  assert.equal(oob.valid, false);
  assert.ok(oob.error?.includes("INVALID_TIME_VALUES"));

  // 3. Malformed time string
  const malformed = normalizeTemporalInterval({
    dateOnly: "2026-09-21",
    startTime: "not-a-time",
    timezone: "UTC",
  });
  assert.equal(malformed.valid, false);
  assert.ok(malformed.error?.includes("INVALID_TIME_FORMAT"));

  // 4. Arithmetic mismatch: start=10:00 (600), end=11:00 (660), duration specified as 90
  const mismatch = normalizeTemporalInterval({
    dateOnly: "2026-09-21",
    startMinute: 600,
    endMinute: 660,
    durationMinutes: 90,
    timezone: "UTC",
  });
  assert.equal(mismatch.valid, false);
  assert.ok(mismatch.error?.includes("INTERVAL_ARITHMETIC_MISMATCH"));

  // 5. Invalid date format
  const badDate = normalizeTemporalInterval({
    dateOnly: "21-09-2026",
    startTime: "10:00",
  });
  assert.equal(badDate.valid, false);
  assert.ok(badDate.error?.includes("INVALID_DATE_FORMAT"));
});

test("Phase 1: Collision & Interval Overlap Determinism", () => {
  // Interval A: 09:00 - 10:30
  const intA = normalizeTemporalInterval({
    dateOnly: "2026-09-21",
    startTime: "09:00",
    endTime: "10:30",
    timezone: "UTC",
  }).interval!;

  // Interval B: 10:00 - 11:00 (Overlaps A between 10:00 and 10:30)
  const intB = normalizeTemporalInterval({
    dateOnly: "2026-09-21",
    startTime: "10:00",
    endTime: "11:00",
    timezone: "UTC",
  }).interval!;

  // Interval C: 10:30 - 11:30 (Adjacent back-to-back with A, should NOT overlap)
  const intC = normalizeTemporalInterval({
    dateOnly: "2026-09-21",
    startTime: "10:30",
    endTime: "11:30",
    timezone: "UTC",
  }).interval!;

  // Interval D: 14:00 - 15:00 (Completely disjoint)
  const intD = normalizeTemporalInterval({
    dateOnly: "2026-09-21",
    startTime: "14:00",
    endTime: "15:00",
    timezone: "UTC",
  }).interval!;

  assert.equal(doIntervalsOverlap(intA, intB), true, "intA and intB must overlap");
  assert.equal(doIntervalsOverlap(intB, intA), true, "Overlap must be symmetric");
  assert.equal(doIntervalsOverlap(intA, intC), false, "Adjacent boundary must NOT overlap");
  assert.equal(doIntervalsOverlap(intA, intD), false, "Disjoint intervals must NOT overlap");

  // Midnight crossing overlap:
  // Session 1: Day 1 23:00 to 01:00 (crosses into Day 2)
  const intCross = normalizeTemporalInterval({
    dateOnly: "2026-09-21",
    startTime: "23:00",
    endTime: "01:00",
    timezone: "UTC",
  }).interval!;

  // Session 2: Day 2 00:30 to 02:00 (overlaps with intCross in the first 30 mins of Day 2)
  const intNextDay = normalizeTemporalInterval({
    dateOnly: "2026-09-22",
    startTime: "00:30",
    endTime: "02:00",
    timezone: "UTC",
  }).interval!;

  assert.equal(doIntervalsOverlap(intCross, intNextDay), true, "Cross-midnight interval must detect overlap on next day");
});

test("Phase 1: Zero-Regex Structured Temporal Resolution", () => {
  // Direct structured temporal meaning from SemanticIntentInterpreter
  const structuredMeaning: StructuredTemporalMeaning = {
    dateOnly: "2026-09-22",
    startTime: "14:30",
    durationMinutes: 45,
    timezone: TEST_TIMEZONE,
    rawExpression: "tomorrow at 2:30pm for 45 minutes",
  };

  const resolved = resolveStructuredTemporal(structuredMeaning, TEST_TIMEZONE, FIXED_REF_TIME);
  assert.equal(resolved.dateOnly, "2026-09-22");
  assert.equal(resolved.timeOnly, "14:30");
  assert.equal(resolved.timezone, TEST_TIMEZONE);
  assert.ok(resolved.isoTimestamp.includes("2026-09-22"));

  // Relative anchor: TOMORROW relative to Monday Sept 21 -> Tuesday Sept 22
  const relTomorrow: StructuredTemporalMeaning = {
    relativeAnchor: "TOMORROW",
    startTime: "09:00",
    durationMinutes: 60,
    rawExpression: "tomorrow 9am",
  };
  const resolvedTomorrow = resolveStructuredTemporal(relTomorrow, TEST_TIMEZONE, FIXED_REF_TIME);
  assert.equal(resolvedTomorrow.dateOnly, "2026-09-22");
  assert.equal(resolvedTomorrow.timeOnly, "09:00");

  // Relative anchor: YESTERDAY relative to Monday Sept 21 -> Sunday Sept 20
  const relYesterday: StructuredTemporalMeaning = {
    relativeAnchor: "YESTERDAY",
    startTime: "20:00",
    rawExpression: "yesterday 8pm",
  };
  const resolvedYesterday = resolveStructuredTemporal(relYesterday, TEST_TIMEZONE, FIXED_REF_TIME);
  assert.equal(resolvedYesterday.dateOnly, "2026-09-20");
});

test("Phase 1: Append-Only Execution Chronicle Contract", () => {
  const startMs = FIXED_REF_TIME;
  const endMs = startMs + 90 * 60 * 1000; // 90 minutes later

  const entry: ExecutionChronicleEntry = {
    chronicleId: `chron_${Date.now()}_test`,
    userId: "usr_phase1_test",
    occurrenceId: "occ_ser_deep_work_20260921",
    entityType: "task",
    entityId: "task_pitch_deck_01",
    title: "Complete Q3 Pitch Deck",
    startedAtMs: startMs,
    endedAtMs: endMs,
    durationMinutes: 90,
    interruptionsCount: 1,
    completedWorkUnits: ["Draft slides 1-5", "Refine financial model"],
    notes: "Focused session with short coffee break",
    source: "web_manual",
    createdAt: Date.now(),
  };

  assert.equal(entry.durationMinutes, 90);
  assert.equal(entry.interruptionsCount, 1);
  assert.equal(entry.completedWorkUnits?.length, 2);
  assert.equal(entry.source, "web_manual");
});

test("Phase 1: Domain Capability Registration & Idempotency Scopes", () => {
  // Verify all 5 new RoutineAI actions are registered in DOMAIN_CAPABILITIES
  const schedCap = DOMAIN_CAPABILITIES["schedule_occurrence"];
  assert.ok(schedCap, "schedule_occurrence must be registered");
  assert.equal(schedCap.domain, "productivity");
  assert.equal(schedCap.operationKind, "CREATE");
  assert.equal(schedCap.idempotencyScope, "TEMPORAL_SLOT");

  const reschedCap = DOMAIN_CAPABILITIES["reschedule_occurrence"];
  assert.ok(reschedCap, "reschedule_occurrence must be registered");
  assert.equal(reschedCap.operationKind, "RESCHEDULE");

  const cancelCap = DOMAIN_CAPABILITIES["cancel_occurrence"];
  assert.ok(cancelCap, "cancel_occurrence must be registered");
  assert.equal(cancelCap.operationKind, "CANCEL");

  const seriesCap = DOMAIN_CAPABILITIES["create_temporal_series"];
  assert.ok(seriesCap, "create_temporal_series must be registered");
  assert.equal(seriesCap.idempotencyScope, "GLOBAL_CONTENT");

  const logExecCap = DOMAIN_CAPABILITIES["log_execution_interval"];
  assert.ok(logExecCap, "log_execution_interval must be registered");
  assert.equal(logExecCap.operationKind, "CREATE");
});
