import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSurfaceActionIdempotencyKey,
  InteractionSurfaceService,
  TemporalOccurrence,
  ISurfaceActionEnvelope,
} from "../index";

test("Phase 7: Web Sticky Bar: State mapping for PROPOSAL_PENDING", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_web_test";
  const now = new Date("2026-10-04T16:00:00.000Z").getTime();
  const startTime = new Date("2026-10-04T16:05:00.000Z").toISOString();
  const endTime = new Date("2026-10-04T16:45:00.000Z").toISOString();

  const occ: TemporalOccurrence = {
    occurrenceId: "occ_web_sprint",
    userId,
    title: "Database Index Optimization",
    kind: "WORK_SESSION",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 965,
      endMinute: 1005,
      durationMinutes: 40,
      startIsoUtc: startTime,
      endIsoUtc: endTime,
      timezone: "UTC",
      isMidnightCrossing: false,
    },
    locationContext: { category: "HOME" },
    rigidity: "ELASTIC",
    status: "SCHEDULED",
    version: 1,
    overrideType: "NONE",
    createdAt: now,
    updatedAt: now,
  };

  const projection = await service.computeSurfaceProjection(userId, {
    referenceTimeMs: now,
    occurrences: [occ],
  });

  assert.equal(projection.interactionMode, "ATTENTION");
  assert.ok(projection.activeExecution);
  assert.equal(projection.activeExecution?.status, "PROPOSAL_PENDING");
  assert.equal(projection.activeExecution?.title, "Database Index Optimization");
  assert.equal(projection.activeExecution?.plannedDurationMinutes, 40);
});

test("Phase 7: Web Sticky Bar: State mapping for ACTIVE with live chronometer", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_web_active";
  const startMs = new Date("2026-10-04T16:00:00.000Z").getTime();
  const now = startMs + 18 * 60 * 1000; // 18 mins in
  const endIsoUtc = new Date(startMs + 45 * 60 * 1000).toISOString();

  const occ: TemporalOccurrence = {
    occurrenceId: "occ_web_live",
    userId,
    title: "Database Index Optimization",
    kind: "WORK_SESSION",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 960,
      endMinute: 1005,
      durationMinutes: 45,
      startIsoUtc: new Date(startMs).toISOString(),
      endIsoUtc,
      timezone: "UTC",
      isMidnightCrossing: false,
    },
    locationContext: { category: "HOME" },
    rigidity: "ELASTIC",
    status: "IN_PROGRESS",
    version: 2,
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
  assert.equal(projection.activeExecution?.status, "ACTIVE");
  assert.equal(projection.activeExecution?.elapsedSeconds, 1080); // 18m
  assert.equal(projection.activeExecution?.remainingSeconds, 1620); // 27m
});

test("Phase 7: Web Action Ingress: Envelope construction with WEB_STICKY_BAR source", () => {
  const userId = "usr_web_ingress";
  const entityId = "task_web_complete";
  const seed = "occ_web_complete";

  const idempotencyKey = computeSurfaceActionIdempotencyKey(
    userId,
    "complete_task",
    entityId,
    seed
  );

  const envelope: ISurfaceActionEnvelope<"complete_task"> = {
    sourceSurface: "WEB_STICKY_BAR",
    actionType: "complete_task",
    entityId,
    timestampMs: Date.now(),
    idempotencyKey,
    observedProjectionVersion: 2,
    payload: {
      completedAtMs: Date.now(),
      completionNote: "Finished web task",
    },
    clientSessionToken: "web_jwt_token",
  };

  assert.equal(envelope.sourceSurface, "WEB_STICKY_BAR");
  assert.equal(envelope.actionType, "complete_task");
  assert.equal(envelope.idempotencyKey.length, 64);
  assert.equal(envelope.observedProjectionVersion, 2);
});
