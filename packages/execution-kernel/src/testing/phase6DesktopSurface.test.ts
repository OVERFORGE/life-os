import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InteractionSurfaceService,
  TemporalOccurrence,
  computeSurfaceActionIdempotencyKey,
  ISurfaceActionEnvelope,
} from "../index";

test("Phase 6: Desktop Tray: Active execution derives glanceable tray title and tooltip", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_desktop_test";
  const startMs = new Date("2026-10-04T15:00:00.000Z").getTime();
  const now = startMs + 20 * 60 * 1000; // 20 min in
  const endIsoUtc = new Date(startMs + 50 * 60 * 1000).toISOString(); // 30 min remaining

  const occ: TemporalOccurrence = {
    occurrenceId: "occ_desktop_sprint",
    userId,
    title: "System Architecture Review",
    kind: "WORK_SESSION",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 900,
      endMinute: 950,
      durationMinutes: 50,
      startIsoUtc: new Date(startMs).toISOString(),
      endIsoUtc,
      timezone: "UTC",
      isMidnightCrossing: false,
    },
    locationContext: { category: "HOME" },
    rigidity: "ELASTIC",
    status: "IN_PROGRESS",
    version: 1,
    overrideType: "NONE",
    createdAt: startMs,
    updatedAt: now,
  };

  const projection = await service.computeSurfaceProjection(userId, {
    referenceTimeMs: now,
    occurrences: [occ],
  });

  assert.equal(projection.interactionMode, "ACTIVE_EXECUTION");
  assert.ok(projection.activeExecution);
  assert.equal(projection.activeExecution?.title, "System Architecture Review");
  assert.equal(projection.activeExecution?.remainingSeconds, 1800);

  // Derive desktop tray representation
  const remainingMins = Math.round(projection.activeExecution.remainingSeconds / 60);
  const trayTitle = `${projection.activeExecution.title} (${remainingMins}m)`;
  const trayTooltip = `LifeOS Active: ${projection.activeExecution.title}`;

  assert.equal(trayTitle, "System Architecture Review (30m)");
  assert.equal(trayTooltip, "LifeOS Active: System Architecture Review");
});

test("Phase 6: Desktop Tray: Dormant state preserves Silence Invariant with empty title and Calm tooltip", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_desktop_calm";
  const now = Date.now();

  const projection = await service.computeSurfaceProjection(userId, {
    referenceTimeMs: now,
    occurrences: [],
  });

  assert.equal(projection.interactionMode, "SILENT");
  assert.equal(projection.activeExecution, null);

  const trayTitle = "";
  const trayTooltip = "LifeOS: Calm";

  assert.equal(trayTitle, "");
  assert.equal(trayTooltip, "LifeOS: Calm");
});

test("Phase 6: Desktop Action Ingress: Canonical envelope with DESKTOP_TRAY sourceSurface", () => {
  const userId = "usr_desktop_user";
  const entityId = "task_desktop_done";
  const seed = "occ_desktop_done";

  const idempotencyKey = computeSurfaceActionIdempotencyKey(
    userId,
    "complete_task",
    entityId,
    seed
  );

  const envelope: ISurfaceActionEnvelope<"complete_task"> = {
    sourceSurface: "DESKTOP_TRAY",
    actionType: "complete_task",
    entityId,
    timestampMs: Date.now(),
    idempotencyKey,
    observedProjectionVersion: 4,
    payload: {
      completedAtMs: Date.now(),
    },
    clientSessionToken: "desktop_sess_token",
  };

  assert.equal(envelope.sourceSurface, "DESKTOP_TRAY");
  assert.equal(envelope.actionType, "complete_task");
  assert.equal(envelope.idempotencyKey.length, 64);
});
