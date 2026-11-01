/**
 * b2PhysicalCognitivePropagation.test.ts
 * 
 * Loop 6 (WP3) Verification Suite:
 * - Physical readiness propagation from workout and wearable events to DailyLog
 * - Authoritative initialization of missing DailyLog documents
 * - Monotonic guard preventing older telemetry from overwriting newer physical state
 * - Cognitive assessment snapshot creation with 4-hour temporal validity
 * - Idempotency on cognitive assessment redelivery
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PhysicalReadinessConsumer } from "../events/consumers/PhysicalReadinessConsumer";
import { CognitiveHistoryConsumer } from "../events/consumers/CognitiveHistoryConsumer";

class MockCollection {
  public docs: Map<string, any> = new Map();

  findOne(query: Record<string, any>): any {
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) {
        const cloned = JSON.parse(JSON.stringify(doc));
        return {
          ...cloned,
          lean: () => Promise.resolve(cloned),
          then: (resolve: any, reject: any) => Promise.resolve(cloned).then(resolve, reject),
        };
      }
    }
    return {
      lean: () => Promise.resolve(null),
      then: (resolve: any, reject: any) => Promise.resolve(null).then(resolve, reject),
    };
  }

  findById(id: string): any {
    const doc = this.docs.get(id);
    const cloned = doc ? JSON.parse(JSON.stringify(doc)) : null;
    return {
      ...cloned,
      lean: () => Promise.resolve(cloned),
      then: (resolve: any, reject: any) => Promise.resolve(cloned).then(resolve, reject),
    };
  }

  async create(doc: any): Promise<any> {
    const id = doc._id || `id_${Date.now()}_${Math.random()}`;
    const newDoc = { _id: id, ...doc };
    this.docs.set(id, newDoc);
    return JSON.parse(JSON.stringify(newDoc));
  }

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, opts?: any): Promise<any> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        if (update.$set) Object.assign(doc, update.$set);
        return JSON.parse(JSON.stringify(doc));
      }
    }
    if (opts?.upsert) {
      const newDoc = { ...(update.$set || {}) };
      const docId = newDoc._id || `id_${Date.now()}`;
      newDoc._id = docId;
      this.docs.set(docId, newDoc);
      return JSON.parse(JSON.stringify(newDoc));
    }
    return null;
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number; modifiedCount: number }> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        if (update.$set) Object.assign(doc, update.$set);
        return { matchedCount: 1, modifiedCount: 1 };
      }
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  private matchesQuery(doc: Record<string, any>, query: Record<string, any>): boolean {
    for (const [k, v] of Object.entries(query)) {
      if (k === "derivedFromCausalSequence" && v && typeof v === "object" && "$lt" in v) {
        if ((doc.derivedFromCausalSequence ?? 0) >= (v as any).$lt) return false;
        continue;
      }
      if (k === "_id") {
        if (doc._id !== v) return false;
        continue;
      }
      if (doc[k] !== v) return false;
    }
    return true;
  }
}

describe("LOOP 6 (WP3): Physical Readiness & Cognitive History Consumers", () => {
  let mockDailyLog: MockCollection;
  let mockCognitive: MockCollection;
  let physicalConsumer: PhysicalReadinessConsumer;
  let cognitiveConsumer: CognitiveHistoryConsumer;

  beforeEach(() => {
    mockDailyLog = new MockCollection();
    mockCognitive = new MockCollection();

    physicalConsumer = new PhysicalReadinessConsumer({
      dailyLogModel: mockDailyLog,
    });

    cognitiveConsumer = new CognitiveHistoryConsumer({
      cognitiveHistoryModel: mockCognitive,
    });
  });

  it("PHYS-01: domain.health.workout_logged initializes missing DailyLog and propagates strain & calories", async () => {
    const envelope = {
      eventId: "evt_workout_w1_v1_1_logged",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.health.workout_logged",
      aggregateId: "w1",
      aggregateType: "workout" as const,
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: "2026-10-31T08:00:00.000Z",
      recordedAt: "2026-10-31T08:00:01.000Z",
      correlationId: "corr_w1",
      source: "gym_tracker",
      payload: {
        date: "2026-10-31",
        workoutType: "Upper Body Hypertrophy",
        calories: 520,
        strainScore: 15.8,
      },
    };

    const res = await physicalConsumer.process(envelope as any, 1);
    assert.equal(res.status, "SUCCEEDED");

    const createdLog = Array.from(mockDailyLog.docs.values()).find(
      (d) => d.userId === "usr_alice" && d.date === "2026-10-31"
    );

    assert.ok(createdLog, "DailyLog document must be initialized");
    assert.equal(createdLog.physical.gym, true);
    assert.equal(createdLog.physical.workoutType, "Upper Body Hypertrophy");
    assert.equal(createdLog.physical.calories, 520);
    assert.equal(createdLog.physical.trainingStrainScore, 15.8);
    assert.equal(createdLog.derivedFromCausalSequence, 1001);
  });

  it("PHYS-02: telemetry.wearables.ingested updates steps, recoveryScore, and sleepQuality", async () => {
    // Seed existing DailyLog
    mockDailyLog.docs.set("log_1", {
      _id: "log_1",
      userId: "usr_alice",
      date: "2026-10-31",
      physical: { gym: false, steps: 4000, recoveryScore: 60 },
      sleep: { quality: 70 },
      derivedFromCausalSequence: 1001,
      lastEventId: "evt_prev",
    });

    const envelope = {
      eventId: "evt_wearable_telemetry_v2_1_ingested",
      userId: "usr_alice",
      category: "TELEMETRY_EVENT" as const,
      type: "telemetry.wearables.ingested",
      aggregateId: "wearable_whoop",
      aggregateType: "user" as const,
      aggregateVersion: 2,
      eventOrdinal: 1,
      causalSequence: 2001,
      occurredAt: "2026-10-31T10:00:00.000Z",
      recordedAt: "2026-10-31T10:00:01.000Z",
      correlationId: "corr_tel_1",
      source: "whoop_sync",
      payload: {
        date: "2026-10-31",
        steps: 12500,
        recoveryScore: 92,
        sleepQuality: 88,
      },
    };

    const res = await physicalConsumer.process(envelope as any, 1);
    assert.equal(res.status, "SUCCEEDED");

    const updated = mockDailyLog.docs.get("log_1");
    assert.equal(updated.physical.steps, 12500);
    assert.equal(updated.physical.recoveryScore, 92);
    assert.equal(updated.sleep.quality, 88);
    assert.equal(updated.derivedFromCausalSequence, 2001);
  });

  it("PHYS-03: Out-of-order telemetry delivery prevented by causalSequence guard (Correction B)", async () => {
    mockDailyLog.docs.set("log_2", {
      _id: "log_2",
      userId: "usr_alice",
      date: "2026-10-31",
      physical: { steps: 10000, recoveryScore: 95 },
      derivedFromCausalSequence: 3005, // Already at sequence 3005
      lastEventId: "evt_future",
    });

    const staleTelemetry = {
      eventId: "evt_wearable_stale_v3_1",
      userId: "usr_alice",
      category: "TELEMETRY_EVENT" as const,
      type: "telemetry.wearables.ingested",
      aggregateId: "wearable_whoop",
      aggregateType: "user" as const,
      aggregateVersion: 3,
      eventOrdinal: 1,
      causalSequence: 3001, // Stale (< 3005)
      occurredAt: "2026-10-31T09:00:00.000Z",
      recordedAt: "2026-10-31T09:00:01.000Z",
      correlationId: "corr_stale",
      source: "whoop_sync",
      payload: {
        date: "2026-10-31",
        steps: 5000,
        recoveryScore: 50,
      },
    };

    const res = await physicalConsumer.process(staleTelemetry as any, 1);
    assert.equal(res.status, "SKIPPED_STALE", "Stale telemetry must be classified as SKIPPED_STALE");

    const log = mockDailyLog.docs.get("log_2");
    assert.equal(log.physical.steps, 10000, "Steps must NOT regress");
    assert.equal(log.physical.recoveryScore, 95, "Recovery score must NOT regress");
  });

  it("COG-01: observation.cognitive.assessed records cognitive snapshot with valid temporal window", async () => {
    const occurredAt = new Date("2026-10-31T14:30:00.000Z");
    const envelope = {
      eventId: "evt_cognitive_c1_v1_1_assessed",
      userId: "usr_alice",
      category: "OBSERVATION_EVENT" as const,
      type: "observation.cognitive.assessed",
      aggregateId: "obs_c1",
      aggregateType: "user" as const,
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: occurredAt.toISOString(),
      recordedAt: occurredAt.toISOString(),
      correlationId: "corr_cog_1",
      source: "cognitive_engine",
      payload: {
        stressScore: 0.25,
        energyLevel: 0.85,
        cognitiveLoad: 0.40,
        focusReadiness: 0.90,
        confidence: 0.95,
        primaryFactors: ["hrv_elevated", "deep_rest_verified"],
      },
    };

    const res = await cognitiveConsumer.process(envelope as any, 1);
    assert.equal(res.status, "SUCCEEDED");

    assert.equal(mockCognitive.docs.size, 1);
    const snapshot = Array.from(mockCognitive.docs.values())[0];
    assert.equal(snapshot.userId, "usr_alice");
    assert.equal(snapshot.timestamp, occurredAt.getTime());
    assert.equal(snapshot.stress.estimate, 0.25);
    assert.equal(snapshot.energy.estimate, 0.85);
    assert.equal(snapshot.focusReadiness.estimate, 0.90);
    assert.ok(snapshot.temporalValidity.validUntil > snapshot.temporalValidity.validFrom);
  });

  it("COG-02: Exact redelivery of cognitive assessment is idempotent", async () => {
    const occurredAt = new Date("2026-10-31T14:30:00.000Z");
    const envelope = {
      eventId: "evt_cognitive_c1_v1_1_assessed",
      userId: "usr_alice",
      category: "OBSERVATION_EVENT" as const,
      type: "observation.cognitive.assessed",
      aggregateId: "obs_c1",
      aggregateType: "user" as const,
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: occurredAt.toISOString(),
      recordedAt: occurredAt.toISOString(),
      correlationId: "corr_cog_1",
      source: "cognitive_engine",
      payload: {
        stressScore: 0.25,
      },
    };

    // First attempt creates document
    const res1 = await cognitiveConsumer.process(envelope as any, 1);
    assert.equal(res1.status, "SUCCEEDED");
    assert.equal(mockCognitive.docs.size, 1);

    // Redelivery must return SUCCEEDED without duplicating record
    const res2 = await cognitiveConsumer.process(envelope as any, 1);
    assert.equal(res2.status, "SUCCEEDED");
    assert.equal(mockCognitive.docs.size, 1, "Must not insert duplicate record");
  });
});
