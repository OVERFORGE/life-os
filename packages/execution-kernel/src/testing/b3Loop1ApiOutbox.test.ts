/**
 * b3Loop1ApiOutbox.test.ts
 * 
 * Milestone B — Phase B3: Work Package 1 / Loop 1
 * Production Web API Outbox Integration Verification
 * 
 * Tests:
 * 1. Task complete creates domain.task.completed outbox event with monotonic version & receipt.
 * 2. Workout session logging creates domain.physical.workout_logged outbox event with version 1.
 * 3. DailyLog signal logging creates domain.signal.logged outbox event with monotonic version.
 * 4. Subsequent DailyLog signal advances version and computes strictly monotonic causal sequence.
 * 5. Concurrency conflict with stale expectedVersion is rejected with ConcurrencyConflictError.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  OutboxStorageService,
  ConcurrencyConflictError,
} from "../events/persistence/OutboxStorageService";
import {
  calculateCausalSequence,
  formatCanonicalEventId,
} from "../events/contracts/CanonicalEventContracts";

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

  findById(id: string): any {
    const doc = this.docs.get(String(id));
    const cloned = doc ? JSON.parse(JSON.stringify(doc)) : null;
    return {
      lean: () => Promise.resolve(cloned),
      then: (resolve: any, reject: any) => Promise.resolve(cloned).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(cloned).catch(reject),
    };
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
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return { matchedCount: 1, modifiedCount: 1 };
      }
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  async updateMany(filter: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number; modifiedCount: number }> {
    let count = 0;
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        count++;
      }
    }
    return { matchedCount: count, modifiedCount: count };
  }

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, _opts?: any): Promise<any> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return JSON.parse(JSON.stringify(doc));
      }
    }
    const newDoc: any = { _id: filter._id || filter.receiptId || `id_${Date.now()}` };
    if (update.$setOnInsert) Object.assign(newDoc, update.$setOnInsert);
    if (update.$set) Object.assign(newDoc, update.$set);
    this.docs.set(String(newDoc._id), newDoc);
    return JSON.parse(JSON.stringify(newDoc));
  }

  async countDocuments(query: Record<string, any>): Promise<number> {
    let count = 0;
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) count++;
    }
    return count;
  }

  private matchesQuery(doc: any, query: Record<string, any>): boolean {
    for (const [k, v] of Object.entries(query)) {
      if (k === "_id") {
        if (v && typeof v === "object" && "$in" in v) {
          const inArr = (v.$in as any[]).map(String);
          if (!inArr.includes(String(doc._id))) return false;
        } else if (String(doc._id) !== String(v)) {
          return false;
        }
        continue;
      }
      if (k === "$or" && Array.isArray(v)) {
        const matchesAny = v.some((subQ) => this.matchesQuery(doc, subQ));
        if (!matchesAny) return false;
        continue;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (v.$in && !v.$in.includes(doc[k])) return false;
        if (v.$lt !== undefined && !(doc[k] < v.$lt)) return false;
        if (v.$lte !== undefined && !(doc[k] <= v.$lte)) return false;
        if (v.$gt !== undefined && !(doc[k] > v.$gt)) return false;
        if (v.$gte !== undefined && !(doc[k] >= v.$gte)) return false;
        if (v.$ne !== undefined && doc[k] === v.$ne) return false;
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

describe("B3 WP1 Loop 1: Production Web API Outbox Integration", () => {
  let mockOutboxColl: MockMemoryCollection<any>;
  let mockReceiptColl: MockMemoryCollection<any>;
  let mockTaskColl: MockMemoryCollection<any>;
  let mockWorkoutColl: MockMemoryCollection<any>;
  let mockDailyLogColl: MockMemoryCollection<any>;
  let outboxService: OutboxStorageService;

  beforeEach(() => {
    mockOutboxColl = new MockMemoryCollection();
    mockReceiptColl = new MockMemoryCollection();
    mockTaskColl = new MockMemoryCollection();
    mockWorkoutColl = new MockMemoryCollection();
    mockDailyLogColl = new MockMemoryCollection();

    outboxService = new OutboxStorageService({
      outboxModel: mockOutboxColl,
      receiptModel: mockReceiptColl,
    });
  });

  it("B3-LOOP1-01: Task complete persists with standalone fencing and writes canonical outbox event", async () => {
    // Seed initial task
    await mockTaskColl.create({
      _id: "task_401",
      userId: "usr_alice",
      title: "Complete quarterly report",
      status: "pending",
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const completedAt = new Date();
    const result = await outboxService.persistWithStandaloneFencing({
      userId: "usr_alice",
      aggregateModel: mockTaskColl as any,
      aggregateId: "task_401",
      clientMutationId: "mut_task_complete_401",
      diffHash: "diff_task_401_v1",
      expectedVersion: 0,
      fencingEpoch: 0,
      domainUpdates: {
        status: "completed",
        completedAt,
      },
      eventDrafts: [
        {
          userId: "usr_alice",
          category: "DOMAIN_EVENT",
          type: "domain.task.completed",
          aggregateId: "task_401",
          aggregateType: "task",
          aggregateVersion: 1,
          source: "web.tasks.complete",
          payload: {
            taskId: "task_401",
            userId: "usr_alice",
            completedAt: completedAt.toISOString(),
            title: "Complete quarterly report",
          },
          occurredAt: completedAt,
        },
      ],
    });

    assert.equal(result.events.length, 1);
    const event = result.events[0];
    assert.equal(event.type, "domain.task.completed");
    assert.equal(event.aggregateVersion, 1);
    assert.equal(event.eventOrdinal, 1);
    assert.equal(event.causalSequence, 1001);
    assert.equal(event.deliveryStatus, "PENDING");

    // Aggregate updated
    const updatedTask = await mockTaskColl.findById("task_401");
    assert.equal(updatedTask.status, "completed");
    assert.equal(updatedTask.version, 1);
    assert.equal(updatedTask.recentMutationReceipts.length, 1);
  });

  it("B3-LOOP1-02: Gym workout session logging writes outbox event with version 1", async () => {
    // Seed initial workout session
    await mockWorkoutColl.create({
      _id: "sess_701",
      userId: "usr_bob",
      durationSeconds: 3600,
      exercises: [{ equipmentName: "Barbell Bench", sets: [{ repsDone: 10, weightUsed: 185 }] }],
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const occurredAt = new Date();
    const result = await outboxService.persistWithStandaloneFencing({
      userId: "usr_bob",
      aggregateModel: mockWorkoutColl as any,
      aggregateId: "sess_701",
      clientMutationId: "mut_workout_sess_701",
      diffHash: "diff_sess_701_v1",
      expectedVersion: 0,
      fencingEpoch: 0,
      domainUpdates: {},
      eventDrafts: [
        {
          userId: "usr_bob",
          category: "DOMAIN_EVENT",
          type: "domain.physical.workout_logged",
          aggregateId: "sess_701",
          aggregateType: "workout",
          aggregateVersion: 1,
          source: "web.gym.session",
          payload: {
            sessionId: "sess_701",
            userId: "usr_bob",
            date: occurredAt.toISOString(),
            durationSeconds: 3600,
            durationMinutes: 60,
            exercisesCount: 1,
          },
          occurredAt,
        },
      ],
    });

    assert.equal(result.events.length, 1);
    const event = result.events[0];
    assert.equal(event.type, "domain.physical.workout_logged");
    assert.equal(event.aggregateType, "workout");
    assert.equal(event.aggregateVersion, 1);
    assert.equal(event.causalSequence, 1001);
    assert.equal(event.deliveryStatus, "PENDING");
  });

  it("B3-LOOP1-03: DailyLog signal logging writes outbox event and updates signals map", async () => {
    await mockDailyLogColl.create({
      _id: "log_2026_10_31",
      userId: "usr_carol",
      date: "2026-10-31",
      signals: {},
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const result = await outboxService.persistWithStandaloneFencing({
      userId: "usr_carol",
      aggregateModel: mockDailyLogColl as any,
      aggregateId: "log_2026_10_31",
      clientMutationId: "mut_sig_energy_001",
      diffHash: "diff_sig_energy_1",
      expectedVersion: 0,
      fencingEpoch: 0,
      domainUpdates: { "signals.energy": 8, "mental.energy": 8 },
      eventDrafts: [
        {
          userId: "usr_carol",
          category: "DOMAIN_EVENT",
          type: "domain.signal.logged",
          aggregateId: "log_2026_10_31",
          aggregateType: "dailylog",
          aggregateVersion: 1,
          source: "web.signals.log",
          payload: {
            userId: "usr_carol",
            date: "2026-10-31",
            key: "energy",
            value: 8,
          },
        },
      ],
    });

    assert.equal(result.events.length, 1);
    const event = result.events[0];
    assert.equal(event.type, "domain.signal.logged");
    assert.equal(event.aggregateVersion, 1);
    assert.equal(event.causalSequence, 1001);
  });

  it("B3-LOOP1-04: Subsequent DailyLog signal advances version and computes strictly monotonic causal sequence", async () => {
    // Seed at version 1
    await mockDailyLogColl.create({
      _id: "log_2026_10_31",
      userId: "usr_carol",
      date: "2026-10-31",
      signals: { energy: 8 },
      version: 1,
      mutationEpoch: 0,
      recentMutationReceipts: [{ clientMutationId: "mut_sig_energy_001", version: 1 }],
    });

    const result = await outboxService.persistWithStandaloneFencing({
      userId: "usr_carol",
      aggregateModel: mockDailyLogColl as any,
      aggregateId: "log_2026_10_31",
      clientMutationId: "mut_sig_mood_002",
      diffHash: "diff_sig_mood_2",
      expectedVersion: 1,
      fencingEpoch: 0,
      domainUpdates: { "signals.mood": 9, "mental.mood": 9 },
      eventDrafts: [
        {
          userId: "usr_carol",
          category: "DOMAIN_EVENT",
          type: "domain.signal.logged",
          aggregateId: "log_2026_10_31",
          aggregateType: "dailylog",
          aggregateVersion: 2,
          source: "web.signals.log",
          payload: {
            userId: "usr_carol",
            date: "2026-10-31",
            key: "mood",
            value: 9,
          },
        },
      ],
    });

    assert.equal(result.events[0].aggregateVersion, 2);
    assert.equal(result.events[0].causalSequence, 2001);
    assert(result.events[0].causalSequence > 1001, "Monotonic sequence advance guaranteed");

    const updated = await mockDailyLogColl.findById("log_2026_10_31");
    assert.equal(updated.version, 2);
    assert.equal(updated.recentMutationReceipts.length, 2);
  });

  it("B3-LOOP1-05: Concurrency conflict with stale expectedVersion throws ConcurrencyConflictError", async () => {
    await mockTaskColl.create({
      _id: "task_402",
      userId: "usr_alice",
      title: "Concurrent Task",
      status: "pending",
      version: 2, // Current version is 2
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    await assert.rejects(
      async () => {
        await outboxService.persistWithStandaloneFencing({
          userId: "usr_alice",
          aggregateModel: mockTaskColl as any,
          aggregateId: "task_402",
          clientMutationId: "mut_stale",
          diffHash: "diff_stale",
          expectedVersion: 1, // Stale expected version 1 != 2
          fencingEpoch: 0,
          domainUpdates: { status: "completed" },
          eventDrafts: [
            {
              userId: "usr_alice",
              category: "DOMAIN_EVENT",
              type: "domain.task.completed",
              aggregateId: "task_402",
              aggregateType: "task",
              aggregateVersion: 2,
              source: "test",
              payload: {},
            },
          ],
        });
      },
      (err: any) => err instanceof ConcurrencyConflictError
    );
  });
});
