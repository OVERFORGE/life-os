import test from "node:test";
import assert from "node:assert/strict";
import { resolveTemporalExpression } from "../orchestration/semantic/temporalResolver";

test("Timezone-aware relative offset resolution: 'in 2 mins' in Asia/Kolkata", () => {
  // Reference time: 2026-10-05T00:13:00.000Z
  // In Asia/Kolkata (+05:30), this is 2026-10-05 05:43:00
  const refTime = new Date("2026-10-05T00:13:00.000Z").getTime();
  const timezone = "Asia/Kolkata";

  const resolved = resolveTemporalExpression("in 2 mins", timezone, refTime);

  // In 2 minutes from 05:43:00 is 05:45:00
  assert.equal(resolved.dateOnly, "2026-10-05");
  assert.equal(resolved.timeOnly, "05:45");
  assert.equal(resolved.isoTimestamp, "2026-10-05T00:15:00.000Z");
  assert.equal(resolved.timezone, "Asia/Kolkata");
});

test("Timezone-aware relative offset resolution: 'in 1 hour' in America/New_York", () => {
  // Reference time: 2026-10-05T18:30:00.000Z
  // In America/New_York (EDT, UTC-4), this is 2026-10-05 14:30:00
  const refTime = new Date("2026-10-05T18:30:00.000Z").getTime();
  const timezone = "America/New_York";

  const resolved = resolveTemporalExpression("in 1 hour", timezone, refTime);

  // 1 hour later: 15:30:00 EDT = 19:30:00 UTC
  assert.equal(resolved.dateOnly, "2026-10-05");
  assert.equal(resolved.timeOnly, "15:30");
  assert.equal(resolved.isoTimestamp, "2026-10-05T19:30:00.000Z");
});

test("Timezone-aware relative offset across midnight boundary", () => {
  // Reference time: 23:55 local time
  // UTC: 2026-10-05T18:25:00.000Z in Asia/Kolkata (+5:30) is 2026-10-05 23:55:00
  const refTime = new Date("2026-10-05T18:25:00.000Z").getTime();
  const timezone = "Asia/Kolkata";

  const resolved = resolveTemporalExpression("in 10 mins", timezone, refTime);

  // 10 minutes later is next day 00:05:00
  assert.equal(resolved.dateOnly, "2026-10-06");
  assert.equal(resolved.timeOnly, "00:05");
  assert.equal(resolved.isoTimestamp, "2026-10-05T18:35:00.000Z");
});

test("2-minute relative reminder task accurately projects 'IN 2M' on widget then transitions to PROPOSAL when due", async () => {
  const { InteractionSurfaceService } = await import("../experience/surface/InteractionSurfaceService");
  const { mapProjectionToWidgetDTO } = await import("../experience/surface/contracts/WidgetPresentationDTO");

  const service = InteractionSurfaceService.getInstance();
  const timezone = "Asia/Kolkata";
  const t0 = new Date("2026-10-05T08:44:00.000Z").getTime(); // 2:14 PM IST
  const targetUtc = new Date(t0 + 2 * 60 * 1000).toISOString(); // 2:16 PM IST = 08:46:00Z

  const occurrences: any[] = [
    {
      occurrenceId: "task_occ_123",
      userId: "usr_test",
      title: "do my homework",
      kind: "WORK_SESSION",
      dateOnly: "2026-10-05",
      plannedInterval: {
        dateOnly: "2026-10-05",
        startMinute: 14 * 60 + 16,
        endMinute: 14 * 60 + 31,
        durationMinutes: 15,
        startIsoUtc: targetUtc,
        endIsoUtc: new Date(t0 + 17 * 60 * 1000).toISOString(),
        timezone,
        isMidnightCrossing: false,
      },
      locationContext: {
        category: "CUSTOM",
        label: "LifeOS Task",
        requiresPhysicalTransit: false,
      },
      rigidity: "ELASTIC",
      status: "SCHEDULED",
      linkedEntity: { entityType: "task", entityId: "task_123" },
      version: 1,
      overrideType: "NONE",
      createdAt: t0,
      updatedAt: t0,
    },
  ];

  // At 2:14 PM (2 minutes before due time):
  const pAtCreation = await service.computeSurfaceProjection("usr_test", {
    referenceTimeMs: t0,
    occurrences,
    chronicles: [],
  });

  const widgetAtCreation = mapProjectionToWidgetDTO(pAtCreation);
  assert.equal(widgetAtCreation.displayState, "UPCOMING");
  assert.equal(widgetAtCreation.badgeText, "IN 2M");
  assert.equal(widgetAtCreation.primaryTitle, "do my homework");

  // At 2:16 PM (at due time):
  const tDue = t0 + 2 * 60 * 1000;
  const pAtDue = await service.computeSurfaceProjection("usr_test", {
    referenceTimeMs: tDue,
    occurrences,
    chronicles: [],
  });

  const widgetAtDue = mapProjectionToWidgetDTO(pAtDue);
  assert.equal(widgetAtDue.displayState, "PROPOSAL");
  assert.equal(widgetAtDue.badgeText, "PROPOSAL");
  assert.equal(widgetAtDue.primaryTitle, "do my homework");
  assert.equal(widgetAtDue.secondaryText, "Ready to start?");
  assert.equal(widgetAtDue.allowedActions.canStart, true);
  assert.equal(widgetAtDue.allowedActions.canExtend, true);
  assert.equal(widgetAtDue.activeContext?.entityId, "task_occ_123");
  assert.equal(widgetAtDue.activeContext?.idempotencySeed, "task_occ_123");
});

