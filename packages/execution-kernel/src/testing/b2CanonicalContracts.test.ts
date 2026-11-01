/**
 * b2CanonicalContracts.test.ts
 * 
 * Loop 1 (WP1) Verification Suite:
 * - Option B deterministic event identity formatting
 * - Monotonic causal sequence calculation
 * - Canonical consumer operation identity (opId)
 * - Zod schema validation across all 5 event categories
 * - Strict rejection of invalid envelopes and payloads
 */

import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatCanonicalEventId,
  calculateCausalSequence,
  formatConsumerOpId,
  ICanonicalEventEnvelope,
} from "../events/contracts/CanonicalEventContracts";
import {
  validateCanonicalEnvelope,
  safeValidateCanonicalEnvelope,
  CanonicalEventIdRegex,
} from "../events/schemas/CanonicalEventSchemas";

describe("LOOP 1 (WP1): Canonical Event Contracts & Envelope Schemas", () => {
  it("CONTRACT-01: formatCanonicalEventId produces deterministic Option B IDs with retry stability", () => {
    const id1 = formatCanonicalEventId("task", "task_abc_123", 2, 0, "completed");
    const id2 = formatCanonicalEventId("task", "task_abc_123", 2, 0, "completed");
    
    assert.equal(id1, "evt_task_task_abc_123_v2_0_completed");
    assert.equal(id1, id2, "Retry must produce exact same event ID");
    assert.match(id1, CanonicalEventIdRegex, "Must match Option B regex");
  });

  it("CONTRACT-02: Same-version distinct ordinals produce collision-free distinct IDs", () => {
    const idA = formatCanonicalEventId("goal", "goal_999", 4, 0, "progress_updated");
    const idB = formatCanonicalEventId("goal", "goal_999", 4, 1, "completed");

    assert.equal(idA, "evt_goal_goal_999_v4_0_progress_updated");
    assert.equal(idB, "evt_goal_goal_999_v4_1_completed");
    assert.notEqual(idA, idB, "Distinct event ordinals at same version must never collide");
  });

  it("CONTRACT-03: calculateCausalSequence establishes strictly monotonic ordering", () => {
    const seqV4_0 = calculateCausalSequence(4, 0);
    const seqV4_1 = calculateCausalSequence(4, 1);
    const seqV5_0 = calculateCausalSequence(5, 0);

    assert.equal(seqV4_0, 4000);
    assert.equal(seqV4_1, 4001);
    assert.equal(seqV5_0, 5000);

    assert.ok(seqV4_0 < seqV4_1, "Ordinal 1 must be greater than Ordinal 0 for same version");
    assert.ok(seqV4_1 < seqV5_0, "Version 5 must be greater than Version 4");
  });

  it("CONTRACT-04: formatConsumerOpId formats canonical consumer operation compound key", () => {
    const eventId = "evt_task_123_v2_0_completed";
    const consumerName = "GoalIntelligenceConsumer";
    const opId = formatConsumerOpId(consumerName, eventId);

    assert.equal(opId, "GoalIntelligenceConsumer_evt_task_123_v2_0_completed");
  });

  it("SCHEMA-01: Validates canonical envelopes across all 5 event categories", () => {
    const now = Date.now();

    // 1. DOMAIN_EVENT
    const domainEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_task_task_123_v2_0_completed",
      userId: "user_alpha_1",
      category: "DOMAIN_EVENT",
      type: "domain.task.completed",
      aggregateId: "task_123",
      aggregateType: "task",
      aggregateVersion: 2,
      eventOrdinal: 0,
      causalSequence: 2000,
      occurredAt: now,
      recordedAt: now,
      correlationId: "corr_123",
      source: "TaskService",
      payload: {
        taskId: "task_123",
        userId: "user_alpha_1",
        completedAt: new Date(now).toISOString(),
        title: "Finish quarterly report",
      },
    };
    const validDomain = validateCanonicalEnvelope(domainEnvelope);
    assert.ok(validDomain);

    // 2. TELEMETRY_EVENT
    const telemetryEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_user_user_alpha_1_v10_0_ingested",
      userId: "user_alpha_1",
      category: "TELEMETRY_EVENT",
      type: "telemetry.wearables.ingested",
      aggregateId: "user_alpha_1",
      aggregateType: "user",
      aggregateVersion: 10,
      eventOrdinal: 0,
      causalSequence: 10000,
      occurredAt: now,
      recordedAt: now,
      correlationId: "corr_456",
      source: "TelemetryIngestionService",
      payload: {
        userId: "user_alpha_1",
        generationTimestamp: now,
        observationIds: ["obs_1", "obs_2"],
        telemetryQuality: 0.95,
      },
    };
    const validTelemetry = validateCanonicalEnvelope(telemetryEnvelope);
    assert.ok(validTelemetry);

    // 3. ANALYTICAL_EVENT
    const analyticalEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_occurrence_occ_99_v3_0_conflict",
      userId: "user_alpha_1",
      category: "ANALYTICAL_EVENT",
      type: "analytical.schedule.conflict_detected",
      aggregateId: "occ_99",
      aggregateType: "occurrence",
      aggregateVersion: 3,
      eventOrdinal: 0,
      causalSequence: 3000,
      occurredAt: now,
      recordedAt: now,
      correlationId: "corr_789",
      source: "ScheduleSolver",
      payload: {
        conflictId: "conf_1",
        userId: "user_alpha_1",
        conflictingOccurrenceIds: ["occ_1", "occ_2"],
        overlapMinutes: 30,
        dateOnly: "2026-10-31",
      },
    };
    const validAnalytical = validateCanonicalEnvelope(analyticalEnvelope);
    assert.ok(validAnalytical);

    // 4. SYSTEM_EVENT
    const systemEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_user_user_alpha_1_v1_0_bootstrapped",
      userId: "user_alpha_1",
      category: "SYSTEM_EVENT",
      type: "system.outbox.lease_reclaimed",
      aggregateId: "user_alpha_1",
      aggregateType: "user",
      aggregateVersion: 1,
      eventOrdinal: 0,
      causalSequence: 1000,
      occurredAt: now,
      recordedAt: now,
      correlationId: "corr_sys",
      source: "WorkerLeaseManager",
      payload: { workerId: "worker_peer_1" },
    };
    assert.ok(validateCanonicalEnvelope(systemEnvelope));

    // 5. OBSERVATION_EVENT
    const obsEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_dailylog_log_20261031_v1_0_stress",
      userId: "user_alpha_1",
      category: "OBSERVATION_EVENT",
      type: "observation.stress.detected",
      aggregateId: "log_20261031",
      aggregateType: "dailylog",
      aggregateVersion: 1,
      eventOrdinal: 0,
      causalSequence: 1000,
      occurredAt: now,
      recordedAt: now,
      correlationId: "corr_obs",
      source: "ObservationMapper",
      payload: { normalizedValue: 0.8 },
    };
    assert.ok(validateCanonicalEnvelope(obsEnvelope));
  });

  it("SCHEMA-02: Strict rejection of invalid envelopes and malformed IDs", () => {
    // Missing userId
    const missingUser = safeValidateCanonicalEnvelope({
      eventId: "evt_task_123_v1_0_created",
      userId: "",
      category: "DOMAIN_EVENT",
      type: "domain.task.created",
      aggregateId: "123",
      aggregateType: "task",
      aggregateVersion: 1,
      eventOrdinal: 0,
      causalSequence: 1000,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "c1",
      source: "TaskService",
      payload: { taskId: "123", userId: "u1", title: "Test", dueDate: "2026-10-31" },
    });
    assert.equal(missingUser.success, false, "Must reject empty userId");

    // Malformed eventId (missing ordinal or version prefix)
    const badEventId = safeValidateCanonicalEnvelope({
      eventId: "invalid_id_format",
      userId: "u1",
      category: "DOMAIN_EVENT",
      type: "domain.task.created",
      aggregateId: "123",
      aggregateType: "task",
      aggregateVersion: 1,
      eventOrdinal: 0,
      causalSequence: 1000,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "c1",
      source: "TaskService",
      payload: { taskId: "123", userId: "u1", title: "Test", dueDate: "2026-10-31" },
    });
    assert.equal(badEventId.success, false, "Must reject malformed eventId");

    // Invalid category
    const badCategory = safeValidateCanonicalEnvelope({
      eventId: "evt_task_123_v1_0_created",
      userId: "u1",
      category: "UNKNOWN_CATEGORY",
      type: "domain.task.created",
      aggregateId: "123",
      aggregateType: "task",
      aggregateVersion: 1,
      eventOrdinal: 0,
      causalSequence: 1000,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "c1",
      source: "TaskService",
      payload: { taskId: "123", userId: "u1", title: "Test", dueDate: "2026-10-31" },
    });
    assert.equal(badCategory.success, false, "Must reject unknown category");

    // Invalid payload schema (e.g. invalid date format in dueDate)
    const badPayload = safeValidateCanonicalEnvelope({
      eventId: "evt_task_123_v1_0_created",
      userId: "u1",
      category: "DOMAIN_EVENT",
      type: "domain.task.created",
      aggregateId: "123",
      aggregateType: "task",
      aggregateVersion: 1,
      eventOrdinal: 0,
      causalSequence: 1000,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "c1",
      source: "TaskService",
      payload: { taskId: "123", userId: "u1", title: "Test", dueDate: "31-10-2026" }, // non-standard date
    });
    assert.equal(badPayload.success, false, "Must reject invalid payload shape");
  });
});
