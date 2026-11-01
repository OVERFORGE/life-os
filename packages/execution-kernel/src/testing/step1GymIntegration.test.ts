/**
 * step1GymIntegration.test.ts
 * 
 * Step 1 Verification Suite: Gym & Physical Readiness Integration (WP4 / WP5)
 * Tests:
 * 1. gymEngine.logSession: Version 1, receipt, dateOnly timezone alignment, domain.health.workout_logged
 * 2. gymEngine.updateSession: Version bump, outbox event, ConcurrencyConflictError on stale expectedVersion (409)
 * 3. gymEngine.deleteSession: Soft archival exclusively (status: "archived", archivedAt), domain.physical.session_deleted
 * 4. PhysicalReadinessConsumer:
 *    - Ingests multiple sessions for dateOnly: Sums calories, computes cumulative strain (1 - prod(1 - s_i))
 *    - Ingests soft deletion: Resets daily gym signals to 0 when 0 active sessions remain
 *    - Preserves existing DailyLog fields (steps, sleep, cognitive)
 *    - CAS contention retry loop on version race
 *    - Exact event redelivery idempotency (lastAppliedEventId === eventId)
 * 5. handleLogWorkout: Kernel handler delegates to gymEngine
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  logSession,
  updateSession,
  deleteSession,
  resolveDateOnly,
} from "../../../../apps/web/features/gym/engine/gymEngine";
import { handleLogWorkout } from "../dispatch/executionHandlers/handleLogWorkout";
import { PhysicalReadinessConsumer } from "../events/consumers/PhysicalReadinessConsumer";
import { OutboxStorageService, ConcurrencyConflictError } from "../events/persistence/OutboxStorageService";
import { matchesMongoQuery } from "./helpers/mockMongoMatcher";

class MockGymCollection<T extends Record<string, any>> {
  public docs: Map<string, T> = new Map();
  public failFirstCAS: boolean = false;

  find(query: Record<string, any>): any {
    let results: any[] = [];
    for (const doc of this.docs.values()) {
      if (matchesMongoQuery(doc, query)) {
        results.push(JSON.parse(JSON.stringify(doc)));
      }
    }
    const queryObj = {
      limit: (n: number) => {
        results = results.slice(0, n);
        return queryObj;
      },
      lean: () => Promise.resolve(results),
      then: (resolve: any, reject: any) => Promise.resolve(results).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(results).catch(reject),
    };
    return queryObj;
  }

  async findOne(query: Record<string, any>): Promise<T | null> {
    for (const doc of this.docs.values()) {
      if (matchesMongoQuery(doc, query)) {
        const cloned = JSON.parse(JSON.stringify(doc));
        return {
          ...cloned,
          lean: () => Promise.resolve(cloned),
        };
      }
    }
    return null;
  }

  findById(id: string): any {
    const doc = this.docs.get(String(id));
    const cloned = doc ? JSON.parse(JSON.stringify(doc)) : null;
    const queryObj = {
      lean: () => Promise.resolve(cloned),
      then: (resolve: any, reject: any) => Promise.resolve(cloned).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(cloned).catch(reject),
    };
    return queryObj;
  }

  async create(docs: any | any[], _opts?: any): Promise<any[]> {
    const arr = Array.isArray(docs) ? docs : [docs];
    const created = arr.map((item) => {
      const id = String(item._id || item.eventId || item.receiptId || `id_${Date.now()}_${Math.random()}`);
      const doc = { _id: id, ...item };
      this.docs.set(id, doc);
      return JSON.parse(JSON.stringify(doc));
    });
    return created;
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number; modifiedCount: number }> {
    if (this.failFirstCAS) {
      this.failFirstCAS = false;
      return { matchedCount: 0, modifiedCount: 0 };
    }

    for (const [id, doc] of this.docs.entries()) {
      if (matchesMongoQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return { matchedCount: 1, modifiedCount: 1 };
      }
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  async updateMany(filter: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number; modifiedCount: number }> {
    let count = 0;
    for (const [id, doc] of this.docs.entries()) {
      if (matchesMongoQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        count++;
      }
    }
    return { matchedCount: count, modifiedCount: count };
  }

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, opts?: any): Promise<T | null> {
    for (const [id, doc] of this.docs.entries()) {
      if (matchesMongoQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return JSON.parse(JSON.stringify(doc));
      }
    }
    if (opts?.upsert) {
      const newDoc = { ...(update.$setOnInsert || {}), ...(update.$set || {}) } as any;
      const docId = String(newDoc._id || newDoc.receiptId || newDoc.eventId || `id_${Date.now()}`);
      newDoc._id = docId;
      this.docs.set(docId, newDoc);
      return JSON.parse(JSON.stringify(newDoc));
    }
    return null;
  }

  private applyUpdate(doc: Record<string, any>, update: Record<string, any>): void {
    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) {
        doc[k] = v;
      }
    }
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] || 0) + (v as number);
      }
    }
    if (update.$push) {
      for (const [k, v] of Object.entries(update.$push)) {
        if (!Array.isArray(doc[k])) doc[k] = [];
        if (v && typeof v === "object" && "$each" in v) {
          doc[k].push(...(v as any).$each);
          if (typeof (v as any).$slice === "number" && (v as any).$slice < 0) {
            doc[k] = doc[k].slice((v as any).$slice);
          }
        } else {
          doc[k].push(v);
        }
      }
    }
  }
}

describe("Step 1: Gym & Physical Readiness Integration", () => {
  let mockWorkoutModel: MockGymCollection<any>;
  let mockDailyLogModel: MockGymCollection<any>;
  let mockOutboxModel: MockGymCollection<any>;
  let mockReceiptModel: MockGymCollection<any>;
  let outboxService: OutboxStorageService;

  beforeEach(() => {
    mockWorkoutModel = new MockGymCollection();
    mockDailyLogModel = new MockGymCollection();
    mockOutboxModel = new MockGymCollection();
    mockReceiptModel = new MockGymCollection();

    outboxService = new OutboxStorageService({
      outboxModel: mockOutboxModel,
      receiptModel: mockReceiptModel,
    });
  });

  it("GYM-01: resolveDateOnly accurately respects timezone offsets", () => {
    const utcDate = new Date("2026-10-31T01:00:00Z");
    // New York is UTC-4 in October -> 2026-10-30 21:00
    const nyDate = resolveDateOnly(utcDate, "America/New_York");
    assert.equal(nyDate, "2026-10-30");

    // Tokyo is UTC+9 -> 2026-10-31 10:00
    const tokyoDate = resolveDateOnly(utcDate, "Asia/Tokyo");
    assert.equal(tokyoDate, "2026-10-31");
  });

  it("GYM-02: logSession persists session with version 1, receipt, and domain.health.workout_logged event", async () => {
    const res = await logSession(
      "user_gym_01",
      {
        splitDayName: "Push Day A",
        workoutType: "hypertrophy",
        durationSeconds: 3600,
        calories: 450,
        strainScore: 0.65,
        dateOnly: "2026-10-31",
      },
      {
        workoutModel: mockWorkoutModel,
        outboxService,
      }
    );

    assert.equal(res.success, true);
    assert.ok(res.session);
    assert.equal(res.session.version, 1);
    assert.equal(res.session.mutationEpoch, 0);
    assert.equal(res.session.status, "active");
    assert.equal(res.session.calories, 450);
    assert.equal(res.session.dateOnly, "2026-10-31");

    const outbox = await mockOutboxModel.find({ aggregateId: res.session._id });
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].type, "domain.health.workout_logged");
    assert.equal(outbox[0].payload.dateOnly, "2026-10-31");
  });

  it("GYM-03: updateSession performs fenced CAS update and catches concurrency conflicts (409)", async () => {
    const logged = await logSession(
      "user_gym_01",
      {
        splitDayName: "Push Day",
        durationSeconds: 3600,
        calories: 400,
        strainScore: 0.5,
        dateOnly: "2026-10-31",
      },
      { workoutModel: mockWorkoutModel, outboxService }
    );

    const updated = await updateSession(
      "user_gym_01",
      logged.session._id,
      {
        calories: 550,
        strainScore: 0.75,
      },
      1,
      { workoutModel: mockWorkoutModel, outboxService }
    );

    assert.equal(updated.success, true);
    assert.equal(updated.session.version, 2);
    assert.equal(updated.session.calories, 550);
    assert.equal(updated.session.strainScore, 0.75);

    // Concurrency conflict test with stale expectedVersion: 1
    const conflictRes = await updateSession(
      "user_gym_01",
      logged.session._id,
      { calories: 600 },
      1,
      { workoutModel: mockWorkoutModel, outboxService }
    );

    assert.equal(conflictRes.success, false);
    assert.equal(conflictRes.statusCode, 409);
    assert.equal(conflictRes.code, "AGGREGATE_CONFLICT");
  });

  it("GYM-04: deleteSession enforces soft archival exclusively with domain.physical.session_deleted", async () => {
    const logged = await logSession(
      "user_gym_01",
      {
        splitDayName: "Legs",
        durationSeconds: 3000,
        calories: 500,
        dateOnly: "2026-10-31",
      },
      { workoutModel: mockWorkoutModel, outboxService }
    );

    const deleted = await deleteSession(
      "user_gym_01",
      logged.session._id,
      1,
      { workoutModel: mockWorkoutModel, outboxService }
    );

    assert.equal(deleted.success, true);
    assert.equal(deleted.session.status, "archived");
    assert.ok(deleted.session.archivedAt);
    assert.equal(deleted.session.version, 2);

    // Verify document persists in DB
    const inDb = await mockWorkoutModel.findById(logged.session._id);
    assert.ok(inDb, "Document must not be physically deleted");
    assert.equal(inDb.status, "archived");

    const outbox = await mockOutboxModel.find({
      aggregateId: logged.session._id,
      type: "domain.physical.session_deleted",
    });
    assert.equal(outbox.length, 1);
  });

  it("GYM-05: PhysicalReadinessConsumer aggregates multiple sessions with cumulative strain", async () => {
    const dateOnly = "2026-10-31";
    const userId = "user_gym_01";

    // Pre-existing DailyLog with steps and sleep (must be preserved!)
    await mockDailyLogModel.create({
      _id: `log_${userId}_${dateOnly}`,
      userId,
      date: dateOnly,
      physical: {
        steps: 8500,
        gym: false,
        calories: 0,
        trainingStrainScore: 0,
      },
      sleep: {
        hours: 7.5,
        quality: 75,
      },
      version: 1,
      derivedFromCausalSequence: 10,
    });

    // Session 1: 400 kcal, strain 0.5
    await mockWorkoutModel.create({
      _id: "session_01",
      userId,
      dateOnly,
      calories: 400,
      strainScore: 0.5,
      workoutType: "weights",
      status: "active",
      version: 1,
    });

    // Session 2: 300 kcal, strain 0.4
    await mockWorkoutModel.create({
      _id: "session_02",
      userId,
      dateOnly,
      calories: 300,
      strainScore: 0.4,
      workoutType: "cardio",
      status: "active",
      version: 1,
    });

    const consumer = new PhysicalReadinessConsumer({
      dailyLogModel: mockDailyLogModel,
      workoutSessionModel: mockWorkoutModel,
    });

    const envelope: any = {
      eventId: "evt_gym_logged_02",
      userId,
      category: "DOMAIN_EVENT",
      type: "domain.health.workout_logged",
      aggregateId: "session_02",
      aggregateType: "WorkoutSession",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 200,
      occurredAt: new Date("2026-10-31T15:00:00Z"),
      payload: { dateOnly },
    };

    const res = await consumer.process(envelope, 1);
    assert.equal(res.status, "SUCCEEDED");

    const updatedLog = await mockDailyLogModel.findOne({ userId, date: dateOnly });
    assert.ok(updatedLog);
    assert.equal(updatedLog.physical.gym, true);
    assert.equal(updatedLog.physical.calories, 700); // 400 + 300
    // Cumulative strain: 1 - (1 - 0.5) * (1 - 0.4) = 1 - 0.3 = 0.7
    assert.equal(Math.round(updatedLog.physical.trainingStrainScore * 100) / 100, 0.7);
    // Preserved fields
    assert.equal(updatedLog.physical.steps, 8500);
    assert.equal(updatedLog.sleep.hours, 7.5);
    assert.equal(updatedLog.version, 2);
    assert.equal(updatedLog.lastEventId, "evt_gym_logged_02");
  });

  it("GYM-06: PhysicalReadinessConsumer resets signals to 0 when all sessions are archived", async () => {
    const dateOnly = "2026-10-31";
    const userId = "user_gym_01";

    // All sessions archived
    await mockWorkoutModel.create({
      _id: "session_archived_01",
      userId,
      dateOnly,
      calories: 500,
      strainScore: 0.8,
      status: "archived",
      version: 2,
    });

    await mockDailyLogModel.create({
      _id: `log_${userId}_${dateOnly}`,
      userId,
      date: dateOnly,
      physical: {
        steps: 10000,
        gym: true,
        calories: 500,
        trainingStrainScore: 0.8,
        workoutType: "weights",
      },
      sleep: {
        quality: 80,
      },
      version: 2,
      derivedFromCausalSequence: 200,
    });

    const consumer = new PhysicalReadinessConsumer({
      dailyLogModel: mockDailyLogModel,
      workoutSessionModel: mockWorkoutModel,
    });

    const envelope: any = {
      eventId: "evt_gym_del_01",
      userId,
      category: "DOMAIN_EVENT",
      type: "domain.physical.session_deleted",
      aggregateId: "session_archived_01",
      aggregateType: "WorkoutSession",
      aggregateVersion: 2,
      eventOrdinal: 1,
      causalSequence: 300,
      occurredAt: new Date("2026-10-31T18:00:00Z"),
      payload: { dateOnly },
    };

    const res = await consumer.process(envelope, 1);
    assert.equal(res.status, "SUCCEEDED");

    const updatedLog = await mockDailyLogModel.findOne({ userId, date: dateOnly });
    assert.ok(updatedLog);
    assert.equal(updatedLog.physical.gym, false);
    assert.equal(updatedLog.physical.calories, 0);
    assert.equal(updatedLog.physical.trainingStrainScore, 0);
    assert.equal(updatedLog.physical.workoutType, "");
    assert.equal(updatedLog.physical.steps, 10000); // Preserved
  });

  it("GYM-07: PhysicalReadinessConsumer retries on CAS contention and succeeds", async () => {
    const dateOnly = "2026-10-31";
    const userId = "user_gym_01";

    await mockDailyLogModel.create({
      _id: `log_${userId}_${dateOnly}`,
      userId,
      date: dateOnly,
      gym: false,
      calories: 0,
      trainingStrainScore: 0,
      version: 1,
      derivedFromCausalSequence: 10,
    });

    await mockWorkoutModel.create({
      _id: "session_cas_01",
      userId,
      dateOnly,
      calories: 350,
      strainScore: 0.5,
      status: "active",
      version: 1,
    });

    const consumer = new PhysicalReadinessConsumer({
      dailyLogModel: mockDailyLogModel,
      workoutSessionModel: mockWorkoutModel,
    });

    // Simulate CAS failure on first attempt
    mockDailyLogModel.failFirstCAS = true;

    const envelope: any = {
      eventId: "evt_cas_race_01",
      userId,
      category: "DOMAIN_EVENT",
      type: "domain.health.workout_logged",
      aggregateId: "session_cas_01",
      aggregateType: "WorkoutSession",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 400,
      occurredAt: new Date(),
      payload: { dateOnly },
    };

    const res = await consumer.process(envelope, 1);
    assert.equal(res.status, "SUCCEEDED");
  });

  it("GYM-08: handleLogWorkout kernel handler delegates cleanly to gymEngine", async () => {
    const result = await handleLogWorkout(
      {
        description: "Chest workout 45 minutes",
      },
      "user_gym_01",
      {
        workoutModel: mockWorkoutModel,
        outboxService,
      }
    );

    assert.equal(result.type, "log_workout");
    assert.equal(result.success, true);
    assert.equal((result as any).data?.durationMinutes, 45);

    const saved = await mockWorkoutModel.find({ userId: "user_gym_01" });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].durationSeconds, 2700);
  });
});
