import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSurfaceActionIdempotencyKey,
  InteractionSurfaceService,
  TemporalOccurrence,
} from "../index";

test("Phase 4: Mobile Active Notification: State mapping for PROPOSAL_PENDING ('Ready to start?')", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_mobile_test";
  const now = new Date("2026-10-04T12:00:00.000Z").getTime();
  const startTime = new Date(now).toISOString(); // Due right now
  const endTime = new Date("2026-10-04T12:50:00.000Z").toISOString();

  const mockOcc: TemporalOccurrence = {
    occurrenceId: "occ_deep_focus",
    userId,
    title: "Deep Focus Sprint",
    kind: "WORK_SESSION",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 720,
      endMinute: 770,
      durationMinutes: 45,
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
    occurrences: [mockOcc],
  });

  assert.equal(projection.interactionMode, "ATTENTION");
  assert.ok(projection.activeExecution);
  assert.equal(projection.activeExecution?.status, "PROPOSAL_PENDING");
  assert.equal(projection.activeExecution?.title, "Deep Focus Sprint");
  assert.equal(projection.activeExecution?.plannedDurationMinutes, 45);

  // In this state, mobile notification renders:
  // Title: "Ready to start?"
  // Body: "Deep Focus Sprint (45m)"
  // Actions: [Start] [Later]
});

test("Phase 4: Mobile Active Notification: State mapping for ACTIVE ('Just tell me when you're done.')", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_mobile_active";
  const startMs = new Date("2026-10-04T12:00:00.000Z").getTime();
  const now = startMs + 10 * 60 * 1000; // 10 minutes in
  const endIsoUtc = new Date(startMs + 45 * 60 * 1000).toISOString();

  const mockOcc: TemporalOccurrence = {
    occurrenceId: "occ_live_sprint",
    userId,
    title: "Live Execution Sprint",
    kind: "WORK_SESSION",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 720,
      endMinute: 765,
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
    occurrences: [mockOcc],
  });

  assert.equal(projection.interactionMode, "ACTIVE_EXECUTION");
  assert.ok(projection.activeExecution);
  assert.equal(projection.activeExecution?.status, "ACTIVE");
  assert.equal(projection.activeExecution?.canComplete, true);
  assert.equal(projection.activeExecution?.canPause, true);
  assert.equal(projection.activeExecution?.canExtend, true);
  assert.equal(projection.activeExecution?.elapsedSeconds, 600);

  // In this state, mobile notification renders:
  // Title: "Live Execution Sprint"
  // Body: "Just tell me when you're done."
  // Actions: [Done] [Pause] [+15m]
});

test("Phase 4: Mobile Active Notification: Silence Invariant returns null active execution when completed", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_mobile_done";
  const now = Date.now();

  const completedOcc: TemporalOccurrence = {
    occurrenceId: "occ_done_sprint",
    userId,
    title: "Finished Task",
    kind: "WORK_SESSION",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 500,
      endMinute: 545,
      durationMinutes: 45,
      startIsoUtc: new Date(now - 3600000).toISOString(),
      endIsoUtc: new Date(now - 1000).toISOString(),
      timezone: "UTC",
      isMidnightCrossing: false,
    },
    locationContext: { category: "HOME" },
    rigidity: "ELASTIC",
    status: "COMPLETED",
    version: 3,
    overrideType: "NONE",
    createdAt: now - 3600000,
    updatedAt: now,
  };

  const projection = await service.computeSurfaceProjection(userId, {
    referenceTimeMs: now,
    occurrences: [completedOcc],
  });

  assert.equal(projection.interactionMode, "SILENT");
  assert.equal(projection.activeExecution, null);

  // In this state, ActiveExecutionNotificationManager calls:
  // notifee.cancelNotification(ACTIVE_NOTIF_ID) -> returns to SILENCE.
});
