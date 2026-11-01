/**
 * step1GoalIntegration.test.ts
 * 
 * Step 1 Verification Suite: Goal Mutation Integration (WP2)
 * Tests:
 * 1. goalEngine.createGoal: Version 1, L1/L2 receipt, domain.goal.created event
 * 2. goalEngine.updateGoal: Version bump, outbox event, ConcurrencyConflictError on version mismatch (409)
 * 3. goalEngine.completeGoal: Completed status, version bump, domain.goal.completed event
 * 4. goalEngine.deleteGoal: Soft archival exclusively (status: "archived", archivedAt), domain.goal.deleted event, NO deleteOne
 * 5. handleUpdateGoal & handleDeleteGoal: Kernel dispatch handlers invoking goalEngine
 * 6. GoalIntelligenceConsumer: Subscription to domain.goal.deleted and archival of GoalStats
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createGoal,
  updateGoal,
  completeGoal,
  deleteGoal,
} from "../../../../apps/web/features/goals/engine/goalEngine";
import { handleUpdateGoal } from "../dispatch/executionHandlers/handleUpdateGoal";
import { handleDeleteGoal } from "../dispatch/executionHandlers/handleDeleteGoal";
import { GoalIntelligenceConsumer } from "../events/consumers/GoalIntelligenceConsumer";
import { OutboxStorageService, ConcurrencyConflictError } from "../events/persistence/OutboxStorageService";
import { matchesMongoQuery } from "./helpers/mockMongoMatcher";

class MockMongoCollection<T extends Record<string, any>> {
  public docs: Map<string, T> = new Map();

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
      lean: () => queryObj,
      then: (resolve: any, reject: any) => Promise.resolve(results).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(results).catch(reject),
    };
    return queryObj;
  }

  async findOne(query: Record<string, any>): Promise<T | null> {
    for (const doc of this.docs.values()) {
      if (matchesMongoQuery(doc, query)) {
        return JSON.parse(JSON.stringify(doc));
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

describe("Step 1: Goal Mutation Integration (Dual Boundary)", () => {
  let mockGoalModel: MockMongoCollection<any>;
  let mockOutboxModel: MockMongoCollection<any>;
  let mockReceiptModel: MockMongoCollection<any>;
  let mockGoalStatsModel: MockMongoCollection<any>;
  let outboxService: OutboxStorageService;

  beforeEach(() => {
    mockGoalModel = new MockMongoCollection();
    mockOutboxModel = new MockMongoCollection();
    mockReceiptModel = new MockMongoCollection();
    mockGoalStatsModel = new MockMongoCollection();

    outboxService = new OutboxStorageService({
      outboxModel: mockOutboxModel,
      receiptModel: mockReceiptModel,
    });
  });

  it("G-01: createGoal creates document with version 1, receipt, and domain.goal.created event", async () => {
    const res = await createGoal(
      "user_123",
      {
        title: "Master Quantum Physics",
        type: "performance",
        milestones: [{ milestoneId: "m1", title: "Finish Griffith" }],
      },
      {
        outboxService,
        goalModel: mockGoalModel,
      }
    );

    assert.ok(res.goal);
    assert.equal(res.goal.title, "Master Quantum Physics");
    assert.equal(res.goal.version, 1);
    assert.equal(res.goal.mutationEpoch, 0);
    assert.equal(res.goal.status, "active");

    // Verify aggregate saved in collection
    const saved = await mockGoalModel.findById(res.goal._id);
    assert.ok(saved);
    assert.equal(saved.version, 1);
    assert.equal(saved.recentMutationReceipts.length, 1);

    // Verify outbox event created
    assert.equal(res.events.length, 1);
    assert.equal(res.events[0].type, "domain.goal.created");
    assert.equal(res.events[0].deliveryStatus, "PENDING");
  });

  it("G-02: updateGoal performs fenced version bump and catches concurrency conflicts (409)", async () => {
    const created = await createGoal(
      "user_123",
      { title: "Original Goal" },
      { outboxService, goalModel: mockGoalModel }
    );

    // Successful update with expectedVersion: 1
    const updated = await updateGoal(
      "user_123",
      created.goal._id,
      { title: "Updated Goal Title" },
      1,
      {
        outboxService,
        goalModel: mockGoalModel,
      }
    );

    assert.equal(updated.success, true);
    assert.equal(updated.goal.title, "Updated Goal Title");
    assert.equal(updated.goal.version, 2);
    assert.equal(updated.events![0].type, "domain.goal.updated");

    // Concurrent conflict: trying to update again with stale expectedVersion: 1
    const conflictRes = await updateGoal(
      "user_123",
      created.goal._id,
      { title: "Stale Conflict Title" },
      1,
      {
        outboxService,
        goalModel: mockGoalModel,
      }
    );
    assert.equal(conflictRes.success, false);
    assert.equal(conflictRes.statusCode, 409);
    assert.equal(conflictRes.code, "AGGREGATE_CONFLICT");
  });

  it("G-03: completeGoal advances version to completed and emits domain.goal.completed", async () => {
    const created = await createGoal(
      "user_123",
      { title: "Finish Thesis" },
      { outboxService, goalModel: mockGoalModel }
    );

    const completed = await completeGoal(
      "user_123",
      created.goal._id,
      1,
      {
        outboxService,
        goalModel: mockGoalModel,
      }
    );

    assert.equal(completed.success, true);
    assert.equal(completed.goal.status, "completed");
    assert.equal(completed.goal.version, 2);
    assert.equal(completed.events![0].type, "domain.goal.completed");
  });

  it("G-04: deleteGoal enforces soft archival exclusively (status: archived, archivedAt) with NO deleteOne", async () => {
    const created = await createGoal(
      "user_123",
      { title: "Goal to Archive" },
      { outboxService, goalModel: mockGoalModel }
    );

    const deleted = await deleteGoal(
      "user_123",
      created.goal._id,
      1,
      {
        outboxService,
        goalModel: mockGoalModel,
      }
    );

    assert.equal(deleted.success, true);
    assert.equal(deleted.goal.status, "archived");
    assert.ok(deleted.goal.archivedAt);
    assert.equal(deleted.goal.version, 2);
    assert.equal(deleted.events![0].type, "domain.goal.deleted");

    // Verify document STILL exists in database
    const inDb = await mockGoalModel.findById(created.goal._id);
    assert.ok(inDb, "Document must not be deleted via deleteOne");
    assert.equal(inDb.status, "archived");
  });

  it("G-05: handleUpdateGoal kernel handler successfully invokes goalEngine", async () => {
    const created = await createGoal(
      "user_123",
      { title: "Kernel Goal Test" },
      { outboxService, goalModel: mockGoalModel }
    );

    const result = await handleUpdateGoal(
      {
        goalId: created.goal._id,
        title: "Renamed by Kernel",
        expectedVersion: 1,
      },
      "user_123",
      {
        outboxService,
        goalModel: mockGoalModel,
      }
    );

    assert.equal(result.success, true);
    assert.equal(result.goal.title, "Renamed by Kernel");
    assert.equal(result.newVersion, 2);
  });

  it("G-06: handleDeleteGoal kernel handler invokes soft archival deleteGoal", async () => {
    const created = await createGoal(
      "user_123",
      { title: "Kernel Delete Test" },
      { outboxService, goalModel: mockGoalModel }
    );

    const result = await handleDeleteGoal(
      {
        goalId: created.goal._id,
      },
      "user_123",
      {
        outboxService,
        goalModel: mockGoalModel,
      }
    );

    assert.equal(result.success, true);
    assert.ok((result as any).data?.archivedAt);

    const inDb = await mockGoalModel.findById(created.goal._id);
    assert.ok(inDb);
    assert.equal(inDb.status, "archived");
  });

  it("G-07: GoalIntelligenceConsumer archives GoalStats on domain.goal.deleted", async () => {
    const goalId = "goal_stats_archival_test";
    await mockGoalStatsModel.create({
      _id: `stats_${goalId}`,
      goalId,
      userId: "user_123",
      progress: 0.5,
      status: "active",
      derivedFromCausalSequence: 100,
    });

    const consumer = new GoalIntelligenceConsumer({
      goalStatsModel: mockGoalStatsModel,
      goalModel: mockGoalModel,
    });

    const envelope: any = {
      eventId: "evt_del_01",
      userId: "user_123",
      category: "DOMAIN_EVENT",
      type: "domain.goal.deleted",
      aggregateId: goalId,
      aggregateType: "Goal",
      aggregateVersion: 2,
      eventOrdinal: 1,
      causalSequence: 200,
      occurredAt: new Date(),
      payload: { goalId },
    };

    const res = await consumer.process(envelope, 1);
    assert.equal(res.status, "SUCCEEDED");

    const updatedStats = await mockGoalStatsModel.findOne({ goalId });
    assert.ok(updatedStats);
    assert.equal(updatedStats.status, "archived");
    assert.ok(updatedStats.archivedAt);
  });
});
