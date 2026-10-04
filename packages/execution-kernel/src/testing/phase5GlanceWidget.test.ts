import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InteractionSurfaceService,
  TemporalOccurrence,
} from "../index";

test("Phase 5: Glance Widget: Dormant state preserves Silence Invariant and Executioners calm tone", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_widget_dormant";
  const now = Date.now();

  const projection = await service.computeSurfaceProjection(userId, {
    referenceTimeMs: now,
    occurrences: [],
  });

  assert.equal(projection.interactionMode, "SILENT");
  assert.equal(projection.activeExecution, null);
  assert.equal(projection.upcomingCommitment, null);
});

test("Phase 5: Glance Widget: Upcoming commitment within 30m provides glanceable countdown", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_widget_upcoming";
  const now = new Date("2026-10-04T09:00:00.000Z").getTime();
  const startIsoUtc = new Date("2026-10-04T09:25:00.000Z").toISOString(); // 25 min away
  const endIsoUtc = new Date("2026-10-04T10:00:00.000Z").toISOString();

  const occ: TemporalOccurrence = {
    occurrenceId: "occ_glance_1",
    userId,
    title: "Client Sync",
    kind: "HARD_EVENT",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 565,
      endMinute: 600,
      durationMinutes: 35,
      startIsoUtc,
      endIsoUtc,
      timezone: "UTC",
      isMidnightCrossing: false,
    },
    locationContext: { category: "VIRTUAL", label: "Zoom" },
    rigidity: "UNMOVABLE",
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

  assert.equal(projection.interactionMode, "GLANCE");
  assert.ok(projection.upcomingCommitment);
  assert.equal(projection.upcomingCommitment?.title, "Client Sync");
  assert.equal(projection.upcomingCommitment?.minutesUntilStart, 25);
  assert.equal(projection.upcomingCommitment?.category, "MEETING");
});

test("Phase 5: Glance Widget: Active session presents focused title and eliminates distractions", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_widget_active";
  const startMs = new Date("2026-10-04T11:00:00.000Z").getTime();
  const now = startMs + 12 * 60 * 1000; // 12 mins in
  const endIsoUtc = new Date(startMs + 60 * 60 * 1000).toISOString();

  const occ: TemporalOccurrence = {
    occurrenceId: "occ_widget_focus",
    userId,
    title: "Kernel Pipeline Audit",
    kind: "WORK_SESSION",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 660,
      endMinute: 720,
      durationMinutes: 60,
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
  assert.equal(projection.activeExecution?.title, "Kernel Pipeline Audit");
  assert.equal(projection.activeExecution?.elapsedSeconds, 720);
});
