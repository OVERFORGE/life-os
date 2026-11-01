/**
 * b3Loop7Consumers.test.ts
 * 
 * Milestone B — Phase B3: Work Package 4 / Loop 7
 * Canonical Behavioral & Cadence Event Consumers Verification
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BehavioralIntelligenceConsumer } from "../events/consumers/BehavioralIntelligenceConsumer";
import { CadenceLearningConsumer } from "../events/consumers/CadenceLearningConsumer";
import { BehavioralProfileRepository } from "../learning/BehavioralProfileRepository";
import { CadenceProfileRepository } from "../temporal/cadence/CadenceProfileRepository";
import { ICanonicalEventEnvelope } from "../events/contracts/CanonicalEventContracts";

class MockMemoryCollection<T extends Record<string, any>> {
  public docs: Map<string, T> = new Map();

  find(query: Record<string, any>): any {
    let results: any[] = [];
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) {
        results.push(JSON.parse(JSON.stringify(doc)));
      }
    }
    const queryObj = {
      limit: (n: number) => {
        results = results.slice(0, n);
        return queryObj;
      },
      lean: () => queryObj,
      then: (resolve: any, reject: any) => Promise.resolve(results).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(results).catch(reject),
    };
    return queryObj;
  }

  findOne(query: Record<string, any>): any {
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) {
        const cloned = JSON.parse(JSON.stringify(doc));
        return {
          ...cloned,
          lean: () => Promise.resolve(cloned),
          then: (res: any, rej: any) => Promise.resolve(cloned).then(res, rej),
        };
      }
    }
    return null;
  }

  async create(docs: any | any[], _opts?: any): Promise<any> {
    const arr = Array.isArray(docs) ? docs : [docs];
    const created = arr.map((item) => {
      const id = String(item._id || item.observationId || item.userId || `id_${Date.now()}_${Math.random()}`);
      if (this.docs.has(id)) {
        const err: any = new Error(`E11000 duplicate key error`);
        err.code = 11000;
        throw err;
      }
      const doc = { _id: id, ...item };
      this.docs.set(id, doc);
      return JSON.parse(JSON.stringify(doc));
    });
    return Array.isArray(docs) ? created : created[0];
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number; modifiedCount: number }> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return { matchedCount: 1, modifiedCount: 1 };
      }
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, opts?: any): Promise<any> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return JSON.parse(JSON.stringify(doc));
      }
    }
    if (opts?.upsert) {
      const newDoc: any = { _id: filter._id || filter.userId || `id_${Date.now()}` };
      if (update.$set) Object.assign(newDoc, update.$set);
      this.docs.set(String(newDoc._id), newDoc);
      return JSON.parse(JSON.stringify(newDoc));
    }
    return null;
  }

  private matchesQuery(doc: any, query: Record<string, any>): boolean {
    for (const [k, v] of Object.entries(query)) {
      if (k === "_id" || k === "observationId" || k === "userId") {
        if (v && typeof v === "object" && "$in" in v) {
          const inArr = (v.$in as any[]).map(String);
          if (!inArr.includes(String(doc[k]))) return false;
        } else if (String(doc[k]) !== String(v)) {
          return false;
        }
        continue;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (v.$in && !v.$in.includes(doc[k])) return false;
        continue;
      }
      if (doc[k] !== v) return false;
    }
    return true;
  }

  private applyUpdate(doc: any, update: Record<string, any>): void {
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$inc) {
      for (const [k, incVal] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] || 0) + (incVal as number);
      }
    }
    if (update.$push) {
      for (const [k, pushVal] of Object.entries(update.$push)) {
        if (!doc[k]) doc[k] = [];
        const pv = pushVal as any;
        if (pv && typeof pv === "object" && pv.$each) {
          doc[k].push(...pv.$each);
          if (pv.$slice && pv.$slice < 0) {
            doc[k] = doc[k].slice(pv.$slice);
          }
        } else {
          doc[k].push(pushVal);
        }
      }
    }
  }
}

describe("B3 WP4 Loop 7: Canonical Behavioral & Cadence Event Consumers", () => {
  let mockObsColl: MockMemoryCollection<any>;
  let mockProfileColl: MockMemoryCollection<any>;
  let mockCadenceColl: MockMemoryCollection<any>;
  let behavioralRepo: BehavioralProfileRepository;
  let cadenceRepo: CadenceProfileRepository;
  let behavioralConsumer: BehavioralIntelligenceConsumer;
  let cadenceConsumer: CadenceLearningConsumer;

  beforeEach(() => {
    mockObsColl = new MockMemoryCollection();
    mockProfileColl = new MockMemoryCollection();
    mockCadenceColl = new MockMemoryCollection();

    behavioralRepo = new BehavioralProfileRepository({
      observationModel: mockObsColl,
      profileModel: mockProfileColl,
    });
    cadenceRepo = new CadenceProfileRepository({
      cadenceProfileModel: mockCadenceColl,
    });

    behavioralConsumer = new BehavioralIntelligenceConsumer({
      profileRepository: behavioralRepo,
    });
    cadenceConsumer = new CadenceLearningConsumer({
      cadenceRepository: cadenceRepo,
    });
  });

  it("B3-LOOP7-01: BehavioralIntelligenceConsumer processes task completion into journal and profile", async () => {
    const envelope: ICanonicalEventEnvelope = {
      eventId: "evt_task_t101_v1_1_completed",
      userId: "usr_alice",
      category: "DOMAIN_EVENT",
      type: "domain.task.completed",
      aggregateId: "t101",
      aggregateType: "task",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_t101",
      source: "web.tasks.complete",
      payload: { taskId: "t101", title: "Complete design spec", status: "completed" },
    };

    const res = await behavioralConsumer.process(envelope, 1);
    assert.equal(res.status, "SUCCEEDED");

    const journalDoc = await mockObsColl.findOne({ observationId: "obs_task_t101_v1_1" });
    assert.ok(journalDoc);
    assert.equal(journalDoc.projectionStatus, "APPLIED");
    assert.equal(journalDoc.category, "EXECUTION");

    const profile = await behavioralRepo.getProfile("usr_alice");
    assert.ok(profile);
    assert.equal(profile.projectionRevision, 1);
    assert.equal(profile.metrics.taskCompletionRate, 1.0);
  });

  it("B3-LOOP7-02: BehavioralIntelligenceConsumer classifies physical workouts and cognitive signals correctly", async () => {
    // 1. Physical workout event
    const workoutEnv: ICanonicalEventEnvelope = {
      eventId: "evt_workout_w1_v1_1_logged",
      userId: "usr_bob",
      category: "DOMAIN_EVENT",
      type: "domain.physical.workout_logged",
      aggregateId: "w1",
      aggregateType: "workout",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_w1",
      source: "web.gym.session",
      payload: { sessionId: "w1", durationSeconds: 3600 },
    };

    await behavioralConsumer.process(workoutEnv, 1);
    const workoutObs = await mockObsColl.findOne({ observationId: "obs_workout_w1_v1_1" });
    assert.equal(workoutObs.category, "PHYSICAL");

    // 2. Cognitive stress signal event
    const signalEnv: ICanonicalEventEnvelope = {
      eventId: "evt_dailylog_d1_v1_1_logged",
      userId: "usr_bob",
      category: "DOMAIN_EVENT",
      type: "domain.signal.logged",
      aggregateId: "d1",
      aggregateType: "dailylog",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_d1",
      source: "web.signals.log",
      payload: { key: "stress", value: 8 },
    };

    await behavioralConsumer.process(signalEnv, 1);
    const signalObs = await mockObsColl.findOne({ observationId: "obs_dailylog_d1_v1_1" });
    assert.equal(signalObs.category, "COGNITIVE");
  });

  it("B3-LOOP7-03: CadenceLearningConsumer derives day patterns from workout logged event", async () => {
    const mondayWorkoutEnv: ICanonicalEventEnvelope = {
      eventId: "evt_workout_w2_v1_1_logged",
      userId: "usr_carol",
      category: "DOMAIN_EVENT",
      type: "domain.physical.workout_logged",
      aggregateId: "w2",
      aggregateType: "workout",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: new Date("2026-10-26T07:30:00Z").getTime(), // Monday 07:30 UTC
      recordedAt: Date.now(),
      correlationId: "corr_w2",
      source: "web.gym.session",
      payload: { sessionId: "w2", durationSeconds: 3600 },
    };

    const res = await cadenceConsumer.process(mondayWorkoutEnv, 1);
    assert.equal(res.status, "SUCCEEDED");

    const savedCadence = await cadenceRepo.getProfile("usr_carol");
    assert.ok(savedCadence);
    const mondayPattern = savedCadence.dayPatterns.find((p: any) => p.dayOfWeek === 1);
    assert.ok(mondayPattern);
    assert.equal(mondayPattern.routines.length, 1);
    assert.equal(mondayPattern.routines[0].targetStartMinute, 450); // 07:30 = 450 min
  });

  it("B3-LOOP7-04: Cross-Aggregate Causal Ordering: Task (seq 5001) and Signal (seq 2000) succeed without collision", async () => {
    const userId = "usr_dave";

    // Task aggregate at version 5 produces causal sequence 5001
    const taskEnv: ICanonicalEventEnvelope = {
      eventId: "evt_task_t500_v5_1_completed",
      userId,
      category: "DOMAIN_EVENT",
      type: "domain.task.completed",
      aggregateId: "t500",
      aggregateType: "task",
      aggregateVersion: 5,
      eventOrdinal: 1,
      causalSequence: 5001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_t500",
      source: "web.tasks.complete",
      payload: { taskId: "t500", status: "completed" },
    };

    // Signal aggregate at version 2 produces causal sequence 2000
    const signalEnv: ICanonicalEventEnvelope = {
      eventId: "evt_dailylog_s200_v2_1_logged",
      userId,
      category: "DOMAIN_EVENT",
      type: "domain.signal.logged",
      aggregateId: "s200",
      aggregateType: "dailylog",
      aggregateVersion: 2,
      eventOrdinal: 0,
      causalSequence: 2000,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_s200",
      source: "web.signals.log",
      payload: { key: "energy", value: 9 },
    };

    // Task arrives first
    const res1 = await behavioralConsumer.process(taskEnv, 1);
    assert.equal(res1.status, "SUCCEEDED");

    // Later, Signal arrives with lower sequence (2000 < 5001) from independent aggregate
    // Under V1.0, this was falsely rejected as stale.
    // Under B3 Option C, this is PROPERLY PROCESSED!
    const res2 = await behavioralConsumer.process(signalEnv, 1);
    assert.equal(res2.status, "SUCCEEDED", "Signal from independent aggregate must never be rejected as stale");

    const profile = await behavioralRepo.getProfile(userId);
    assert.equal(profile.projectionRevision, 2);
    // Both cursors tracked independently
    assert.equal(profile.sourceCursors["task:t500"], 5001);
    assert.equal(profile.sourceCursors["dailylog:s200"], 2000);
  });

  it("B3-LOOP7-05: Out-of-order retention within same aggregate preserves both events", async () => {
    const userId = "usr_eve";

    // Event B (v5, seq 5001) arrives BEFORE Event A (v4, seq 4001)
    const eventB: ICanonicalEventEnvelope = {
      eventId: "evt_task_t600_v5_1_completed",
      userId,
      category: "DOMAIN_EVENT",
      type: "domain.task.completed",
      aggregateId: "t600",
      aggregateType: "task",
      aggregateVersion: 5,
      eventOrdinal: 1,
      causalSequence: 5001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_t600_b",
      source: "task_executor",
      payload: { taskId: "t600", status: "completed" },
    };

    const eventA: ICanonicalEventEnvelope = {
      eventId: "evt_task_t600_v4_1_completed",
      userId,
      category: "DOMAIN_EVENT",
      type: "domain.task.completed",
      aggregateId: "t600",
      aggregateType: "task",
      aggregateVersion: 4,
      eventOrdinal: 1,
      causalSequence: 4001,
      occurredAt: Date.now() - 3600000,
      recordedAt: Date.now(),
      correlationId: "corr_t600_a",
      source: "task_executor",
      payload: { taskId: "t600", status: "completed" },
    };

    const resB = await behavioralConsumer.process(eventB, 1);
    assert.equal(resB.status, "SUCCEEDED");

    const resA = await behavioralConsumer.process(eventA, 1);
    assert.equal(resA.status, "SUCCEEDED", "Event A must be retained, not rejected");

    // Both exist in journal
    const docB = await mockObsColl.findOne({ observationId: "obs_task_t600_v5_1" });
    const docA = await mockObsColl.findOne({ observationId: "obs_task_t600_v4_1" });
    assert.ok(docB);
    assert.ok(docA);

    // Cursor preserves high-water mark
    const profile = await behavioralRepo.getProfile(userId);
    assert.equal(profile.sourceCursors["task:t600"], 5001);
  });
});

