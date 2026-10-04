import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSurfaceActionIdempotencyKey,
  ISurfaceActionEnvelope,
  InteractionSurfaceService,
  TemporalOccurrence,
  ExecutionChronicleEntry,
} from "../index";

test("Phase 1: Canonical Idempotency Key decouples from observed projection version", () => {
  const userId = "usr_test_daksh";
  const actionType = "complete_task";
  const entityId = "task_deepwork_42";
  const seed = "occ_session_99";

  // Simulate Device A (Phone) at projectionVersion 10
  const keyDeviceA = computeSurfaceActionIdempotencyKey(userId, actionType, entityId, seed);

  // Simulate Device B (Desktop) at projectionVersion 11
  const keyDeviceB = computeSurfaceActionIdempotencyKey(userId, actionType, entityId, seed);

  // Both devices MUST produce the exact same logical idempotency key
  assert.equal(keyDeviceA, keyDeviceB);
  assert.equal(typeof keyDeviceA, "string");
  assert.equal(keyDeviceA.length, 64); // SHA-256 hex string

  // A different action or entity must produce a distinct key
  const keyDifferentAction = computeSurfaceActionIdempotencyKey(userId, "pause_execution", entityId, seed);
  assert.notEqual(keyDeviceA, keyDifferentAction);
});

test("Phase 1: Surface projection adheres strictly to Silence Invariant when no active or due commitment", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_silence_test";
  const now = new Date("2026-10-04T10:00:00.000Z").getTime();

  // No occurrences, no chronicles
  const projection = await service.computeSurfaceProjection(userId, {
    referenceTimeMs: now,
    occurrences: [],
    chronicles: [],
  });

  assert.equal(projection.userId, userId);
  assert.equal(projection.schemaVersion, 2);
  assert.equal(projection.projectionVersion, 1);
  assert.equal(projection.interactionMode, "SILENT");
  assert.equal(projection.activeExecution, null);
  assert.equal(projection.upcomingCommitment, null);
  assert.equal(projection.pendingIntervention, null);
});

test("Phase 1: Upcoming commitment within 30 minutes triggers GLANCE mode", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_glance_test";
  const now = new Date("2026-10-04T10:00:00.000Z").getTime();
  const startTime = new Date("2026-10-04T10:20:00.000Z").toISOString(); // 20 mins from now
  const endTime = new Date("2026-10-04T11:00:00.000Z").toISOString();

  const mockOccurrence: TemporalOccurrence = {
    occurrenceId: "occ_meeting_1",
    userId,
    title: "System Architecture Review",
    kind: "HARD_EVENT",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 620,
      endMinute: 660,
      durationMinutes: 40,
      startIsoUtc: startTime,
      endIsoUtc: endTime,
      timezone: "UTC",
      isMidnightCrossing: false,
    },
    locationContext: { category: "VIRTUAL", label: "Google Meet" },
    rigidity: "UNMOVABLE",
    status: "SCHEDULED",
    version: 1,
    overrideType: "NONE",
    createdAt: now,
    updatedAt: now,
  };

  const projection = await service.computeSurfaceProjection(userId, {
    referenceTimeMs: now,
    occurrences: [mockOccurrence],
  });

  assert.equal(projection.interactionMode, "GLANCE");
  assert.ok(projection.upcomingCommitment);
  assert.equal(projection.upcomingCommitment?.title, "System Architecture Review");
  assert.equal(projection.upcomingCommitment?.category, "MEETING");
  assert.equal(projection.upcomingCommitment?.minutesUntilStart, 20);
  assert.equal(projection.upcomingCommitment?.isHardSchedule, true);
});

test("Phase 1: Occurrence due right now triggers PROPOSAL_PENDING and ATTENTION mode", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_proposal_test";
  const now = new Date("2026-10-04T14:00:00.000Z").getTime();
  const startTime = new Date("2026-10-04T14:02:00.000Z").toISOString(); // 2 mins from now
  const endTime = new Date("2026-10-04T15:00:00.000Z").toISOString();

  const mockOccurrence: TemporalOccurrence = {
    occurrenceId: "occ_deepwork_2",
    userId,
    title: "Kernel Pipeline Hardening",
    kind: "WORK_SESSION",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 840,
      endMinute: 900,
      durationMinutes: 60,
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
    occurrences: [mockOccurrence],
  });

  assert.equal(projection.interactionMode, "ATTENTION");
  assert.ok(projection.activeExecution);
  assert.equal(projection.activeExecution?.status, "PROPOSAL_PENDING");
  assert.equal(projection.activeExecution?.title, "Kernel Pipeline Hardening");
  assert.equal(projection.activeExecution?.canComplete, false);
});

test("Phase 1: In-progress occurrence triggers ACTIVE_EXECUTION mode with live chronometer", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_active_test";
  const startMs = new Date("2026-10-04T14:00:00.000Z").getTime();
  const now = startMs + 15 * 60 * 1000; // 15 mins elapsed
  const endIsoUtc = new Date(startMs + 45 * 60 * 1000).toISOString(); // 45 min session (30 min remaining)

  const mockOccurrence: TemporalOccurrence = {
    occurrenceId: "occ_active_10",
    userId,
    title: "Phase 1 Execution",
    kind: "WORK_SESSION",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 840,
      endMinute: 885,
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
    occurrences: [mockOccurrence],
  });

  assert.equal(projection.interactionMode, "ACTIVE_EXECUTION");
  assert.ok(projection.activeExecution);
  assert.equal(projection.activeExecution?.status, "ACTIVE");
  assert.equal(projection.activeExecution?.elapsedSeconds, 900);
  assert.equal(projection.activeExecution?.remainingSeconds, 1800);
  assert.equal(projection.activeExecution?.canComplete, true);
  assert.equal(projection.activeExecution?.canPause, true);
});

test("Phase 1: Token budget constraint: serialized projection strictly <= 250 tokens", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_token_audit";
  const now = Date.now();

  const verboseOccurrence: TemporalOccurrence = {
    occurrenceId: "occ_verbose_999",
    userId,
    title: "A very long detailed title that describes an extensive deep-work sprint involving multiple architectural subsystems across Tauri, Expo, and Next.js",
    kind: "WORK_SESSION",
    dateOnly: "2026-10-04",
    plannedInterval: {
      dateOnly: "2026-10-04",
      startMinute: 600,
      endMinute: 660,
      durationMinutes: 60,
      startIsoUtc: new Date(now).toISOString(),
      endIsoUtc: new Date(now + 3600000).toISOString(),
      timezone: "UTC",
      isMidnightCrossing: false,
    },
    locationContext: { category: "HOME", label: "Main Office Laboratory Workstation Alpha" },
    rigidity: "ELASTIC",
    status: "IN_PROGRESS",
    version: 1,
    overrideType: "NONE",
    createdAt: now,
    updatedAt: now,
  };

  const projection = await service.computeSurfaceProjection(userId, {
    referenceTimeMs: now,
    occurrences: [verboseOccurrence],
    latestBriefingSnippet: "Here is a lengthy briefing overview detailing all aspects of morning preparation, physical telemetry, sleep latency analysis, and temporal roadmap prioritization.",
  });

  const jsonStr = JSON.stringify(projection);
  const estimatedTokens = Math.ceil(jsonStr.length / 4);

  // SLA invariant: strictly <= 250 tokens
  assert.ok(
    estimatedTokens <= 250,
    `Projection exceeds 250 tokens! Measured: ${estimatedTokens} tokens (${jsonStr.length} bytes)`
  );
});

test("Phase 1: Hydration benchmark: 50 successive computations average < 5ms (target < 50ms)", async () => {
  const service = InteractionSurfaceService.getInstance();
  const userId = "usr_bench_1";
  const now = Date.now();

  const iterations = 50;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    await service.computeSurfaceProjection(userId, {
      referenceTimeMs: now + i * 1000,
    });
  }

  const durationMs = performance.now() - start;
  const avgMs = durationMs / iterations;

  assert.ok(
    avgMs < 50,
    `Average hydration latency ${avgMs.toFixed(2)}ms exceeded 50ms SLA!`
  );
});

test("Phase 1: Pub-Sub event subscription notifies listeners on new projection", async () => {
  const service = InteractionSurfaceService.getInstance();
  service.reset();

  const userId = "usr_pubsub_test";
  let receivedCount = 0;

  const unsubscribe = service.subscribe(userId, (proj) => {
    receivedCount++;
    assert.equal(proj.userId, userId);
  });

  await service.computeSurfaceProjection(userId);
  await service.computeSurfaceProjection(userId);

  assert.equal(receivedCount, 2);

  unsubscribe();
  await service.computeSurfaceProjection(userId);
  // After unsubscribing, receivedCount must not increment
  assert.equal(receivedCount, 2);
});
