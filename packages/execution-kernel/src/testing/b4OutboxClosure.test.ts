import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createTask, updateTask, deleteTask } from "../../../../apps/web/features/tasks/engine/taskEngine";
import { handleCreateGoal } from "../dispatch/executionHandlers/handleCreateGoal";
import { handleDeleteGoal } from "../dispatch/executionHandlers/handleDeleteGoal";
import { OutboxStorageService } from "../events/persistence/OutboxStorageService";

class MockMemoryCollection<T extends Record<string, any>> {
  public docs: Map<string, T> = new Map();

  find(query: Record<string, any> = {}): any {
    let results: any[] = [];
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) {
        results.push(JSON.parse(JSON.stringify(doc)));
      }
    }
    const queryObj = {
      select: () => queryObj,
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
      ...cloned,
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

  async deleteOne(filter: Record<string, any>): Promise<{ deletedCount: number }> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.docs.delete(id);
        return { deletedCount: 1 };
      }
    }
    return { deletedCount: 0 };
  }

  async deleteMany(filter: Record<string, any>): Promise<{ deletedCount: number }> {
    let count = 0;
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.docs.delete(id);
        count++;
      }
    }
    return { deletedCount: count };
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
      if (v instanceof RegExp) {
        if (!v.test(String(doc[k]))) return false;
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

describe("Milestone B4 — Loop 2: Domain Adapter & Route Outbox Closure", () => {
  let mockOutboxColl: MockMemoryCollection<any>;
  let mockReceiptColl: MockMemoryCollection<any>;
  let mockTaskColl: MockMemoryCollection<any>;
  let mockGoalColl: MockMemoryCollection<any>;
  let outboxService: OutboxStorageService;
  const testUserId = "user_b4_loop2_test";

  beforeEach(() => {
    mockOutboxColl = new MockMemoryCollection();
    mockReceiptColl = new MockMemoryCollection();
    mockTaskColl = new MockMemoryCollection();
    mockGoalColl = new MockMemoryCollection();

    outboxService = new OutboxStorageService({
      outboxModel: mockOutboxColl,
      receiptModel: mockReceiptColl,
    });
  });

  it("B4-L2-01: createTask publishes transactional task.created outbox event and records durable receipt", async () => {
    const res = await createTask(
      testUserId,
      {
        title: "Design APO-CLAE Architecture",
        dueDate: "2026-11-01",
        priority: "high",
      },
      undefined,
      mockTaskColl,
      outboxService
    );

    assert.equal(res.success, true);
    assert.ok(res.task);
    assert.equal(res.task.version, 1);
    const taskId = String(res.task._id);

    // Verify Outbox Event
    const outboxEvents = await mockOutboxColl.find({
      aggregateId: taskId,
      aggregateType: "task",
      type: "domain.task.created",
    });

    assert.equal(outboxEvents.length, 1);
    const event = outboxEvents[0];
    assert.equal(event.deliveryStatus, "PENDING");
    assert.equal(event.aggregateVersion, 1);
    assert.equal(event.causalSequence, 1001);
    assert.equal(event.payload.title, "Design APO-CLAE Architecture");
    assert.equal(event.payload.priority, "high");

    // Verify Durable L2 Mutation Receipt
    const receipts = await mockReceiptColl.find({
      aggregateId: taskId,
      userId: testUserId,
      version: 1,
    });
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].status, "COMMITTED");
  });

  it("B4-L2-02: updateTask advances version and publishes task.updated event", async () => {
    const createRes = await createTask(
      testUserId,
      {
        title: "Original Task Title",
        dueDate: "2026-11-01",
        priority: "medium",
      },
      undefined,
      mockTaskColl,
      outboxService
    );
    const taskId = String(createRes.task!._id);

    const updateRes = await updateTask(
      testUserId,
      taskId,
      {
        title: "Updated Task Title",
        priority: "high",
      },
      mockTaskColl,
      outboxService
    );

    assert.equal(updateRes.success, true);
    assert.ok(updateRes.task);
    assert.equal(updateRes.task.version, 2);
    assert.equal(updateRes.task.title, "Updated Task Title");
    assert.equal(updateRes.task.priority, "high");

    // Verify Outbox Event
    const outboxEvents = await mockOutboxColl.find({
      aggregateId: taskId,
      type: "domain.task.updated",
    });
    assert.equal(outboxEvents.length, 1);
    const event = outboxEvents[0];
    assert.equal(event.deliveryStatus, "PENDING");
    assert.equal(event.aggregateVersion, 2);
    assert.equal(event.causalSequence, 2001);
    assert.equal(event.payload.title, "Updated Task Title");

    // Verify L2 Mutation Receipt
    const receipt = await mockReceiptColl.findOne({
      aggregateId: taskId,
      version: 2,
    });
    assert.ok(receipt);
    assert.equal(receipt.status, "COMMITTED");
  });

  it("B4-L2-03: deleteTask publishes task.deleted event with incremented version", async () => {
    const createRes = await createTask(
      testUserId,
      {
        title: "Task To Delete",
        dueDate: "2026-11-01",
      },
      undefined,
      mockTaskColl,
      outboxService
    );
    const taskId = String(createRes.task!._id);

    const deleteRes = await deleteTask(testUserId, taskId, mockTaskColl, outboxService);
    assert.equal(deleteRes.success, true);

    const deletedTask = await mockTaskColl.findById(taskId);
    assert.ok(deletedTask);
    assert.equal(deletedTask.status, "deleted");
    assert.equal(deletedTask.version, 2);

    // Verify Outbox Event
    const outboxEvents = await mockOutboxColl.find({
      aggregateId: taskId,
      type: "domain.task.deleted",
    });
    assert.equal(outboxEvents.length, 1);
    const event = outboxEvents[0];
    assert.equal(event.aggregateVersion, 2);
    assert.equal(event.causalSequence, 2001);
  });

  it("B4-L2-04: handleCreateGoal and handleDeleteGoal publish goal lifecycle outbox events", async () => {
    const createGoalRes = await handleCreateGoal(
      {
        title: "Master Autonomous Systems",
        type: "performance",
        cadence: "daily",
      },
      testUserId,
      mockGoalColl,
      outboxService
    );

    assert.equal(createGoalRes.success, true);
    const goalId = createGoalRes.goalId;

    // Verify Goal Created Outbox Event
    const createEvents = await mockOutboxColl.find({
      aggregateId: goalId,
      type: "domain.goal.created",
    });
    assert.equal(createEvents.length, 1);
    assert.equal(createEvents[0].deliveryStatus, "PENDING");
    assert.equal(createEvents[0].aggregateVersion, 1);
    assert.equal(createEvents[0].causalSequence, 1001);
    assert.equal(createEvents[0].payload.title, "Master Autonomous Systems");

    // Delete Goal
    const deleteGoalRes = await handleDeleteGoal({ goalId }, testUserId, mockGoalColl, outboxService);
    assert.equal(deleteGoalRes.success, true);

    // Verify Goal Deleted Outbox Event
    const deleteEvents = await mockOutboxColl.find({
      aggregateId: goalId,
      type: "domain.goal.deleted",
    });
    assert.equal(deleteEvents.length, 1);
    assert.equal(deleteEvents[0].deliveryStatus, "PENDING");
    assert.equal(deleteEvents[0].aggregateVersion, 2);
    assert.equal(deleteEvents[0].causalSequence, 2001);
  });
});
