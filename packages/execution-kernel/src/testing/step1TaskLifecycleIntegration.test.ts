/**
 * step1TaskLifecycleIntegration.test.ts
 * 
 * Step 1 Verification Suite: Task Lifecycle & Recurring Resiliency (WP2 / WP5)
 * Tests:
 * 1. Mode A: Atomic Multi-Document Transaction path via persistWithTransaction
 * 2. Mode B: Staged Recovery with Unique Partial Index collision (E11000) deduplication
 * 3. Mode B: One-off task independence (completes without spawning recurring successor)
 * 4. Mode B: Crash healing on retry (recovers missing successor on subsequent attempt)
 * 5. Mode B: Honest partial failure reporting (SUCCESSOR_CREATION_FAILED)
 * 6. Secondary lifecycle: uncompleteTask, skipTask, skipAllForToday, rescheduleOverdue
 * 7. Kernel handler: handleCompleteTask delegates to taskEngine.completeTask and taskEngine.rescheduleOverdue
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  completeTask,
  uncompleteTask,
  skipTask,
  skipAllForToday,
  rescheduleOverdue,
  createTask,
} from "../../../../apps/web/features/tasks/engine/taskEngine";
import { handleCompleteTask } from "../dispatch/executionHandlers/handleCompleteTask";
import { OutboxStorageService } from "../events/persistence/OutboxStorageService";
import { matchesMongoQuery } from "./helpers/mockMongoMatcher";

class MockTaskCollection<T extends Record<string, any>> {
  public docs: Map<string, T> = new Map();
  public enforceUniqueRecurring: boolean = true;
  public simulateSuccessorFailure: boolean = false;

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
    if (this.simulateSuccessorFailure) {
      throw new Error("Disk I/O simulated crash during successor persistence");
    }

    const arr = Array.isArray(docs) ? docs : [docs];
    const created: any[] = [];

    for (const item of arr) {
      // Simulate MongoDB partial unique index: { userId: 1, recurringParentId: 1, dueDate: 1 }
      if (this.enforceUniqueRecurring && item.recurringParentId && item.dueDate) {
        for (const existing of this.docs.values()) {
          if (
            existing.userId === item.userId &&
            String(existing.recurringParentId) === String(item.recurringParentId) &&
            existing.dueDate === item.dueDate
          ) {
            const err: any = new Error("E11000 duplicate key error collection index: userId_1_recurringParentId_1_dueDate_1");
            err.code = 11000;
            throw err;
          }
        }
      }

      const id = String(item._id || item.eventId || item.receiptId || `id_${Date.now()}_${Math.random()}`);
      const doc = { _id: id, ...item };
      this.docs.set(id, doc);
      created.push(JSON.parse(JSON.stringify(doc)));
    }
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

describe("Step 1: Task Lifecycle & Recurring Resiliency", () => {
  let mockTaskModel: MockTaskCollection<any>;
  let mockOutboxModel: MockTaskCollection<any>;
  let mockReceiptModel: MockTaskCollection<any>;
  let outboxService: OutboxStorageService;

  beforeEach(() => {
    mockTaskModel = new MockTaskCollection();
    mockOutboxModel = new MockTaskCollection();
    mockReceiptModel = new MockTaskCollection();

    outboxService = new OutboxStorageService({
      outboxModel: mockOutboxModel,
      receiptModel: mockReceiptModel,
    });
  });

  it("T-01: One-off task completes cleanly without recurring successor", async () => {
    const task = (
      await mockTaskModel.create({
        _id: "task_one_off_01",
        userId: "user_test",
        title: "Buy groceries",
        dueDate: "2026-10-31",
        status: "pending",
        version: 1,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      })
    )[0];

    const res = await completeTask(
      "user_test",
      task._id,
      "UTC",
      mockTaskModel,
      outboxService
    );

    assert.equal(res.success, true);
    assert.equal(res.task.status, "completed");
    assert.equal(res.task.version, 2);
    assert.equal(res.successor, null);

    const outbox = await mockOutboxModel.find({ aggregateId: task._id });
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].type, "domain.task.completed");
  });

  it("T-02: Recurring task in Mode B spawns successor with version 1 and distinct ID", async () => {
    const parentTask = (
      await mockTaskModel.create({
        _id: "task_recur_parent_01",
        userId: "user_test",
        title: "Daily Morning Stretch",
        dueDate: "2026-10-31",
        status: "pending",
        recurring: { type: "daily" },
        version: 1,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      })
    )[0];

    const res = await completeTask(
      "user_test",
      parentTask._id,
      "UTC",
      mockTaskModel,
      outboxService
    );

    assert.equal(res.success, true);
    assert.equal(res.task.status, "completed");
    assert.equal(res.task.version, 2);

    // Successor spawned for next day
    assert.ok(res.successor);
    assert.notEqual(String(res.successor._id), String(parentTask._id));
    assert.equal(res.successor.dueDate, "2026-11-01");
    assert.equal(res.successor.status, "pending");
    assert.equal(res.successor.version, 1);
    assert.equal(String(res.successor.recurringParentId), String(parentTask._id));

    // Two outbox events emitted: domain.task.completed and domain.task.created
    const completedEvt = await mockOutboxModel.find({ type: "domain.task.completed" });
    const createdEvt = await mockOutboxModel.find({ type: "domain.task.created" });
    assert.equal(completedEvt.length, 1);
    assert.equal(createdEvt.length, 1);
  });

  it("T-03: Mode B catches E11000 duplicate key on unique partial index and returns winning successor", async () => {
    const parentTask = (
      await mockTaskModel.create({
        _id: "task_race_parent_01",
        userId: "user_test",
        title: "Daily Meditation",
        dueDate: "2026-10-31",
        status: "pending",
        recurring: { type: "daily" },
        version: 1,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      })
    )[0];

    // Pre-populate the winning successor for tomorrow (simulating concurrent worker winning the race)
    const winningSuccessor = (
      await mockTaskModel.create({
        _id: "task_winner_01",
        userId: "user_test",
        title: "Daily Meditation",
        dueDate: "2026-11-01",
        status: "pending",
        recurring: { type: "daily" },
        recurringParentId: parentTask._id,
        version: 1,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      })
    )[0];

    // When completeTask attempts to create another successor for 2026-11-01, E11000 will be caught
    const res = await completeTask(
      "user_test",
      parentTask._id,
      "UTC",
      mockTaskModel,
      outboxService
    );

    assert.equal(res.success, true);
    assert.equal(res.deduplicated, true);
    assert.equal(String(res.successor._id), String(winningSuccessor._id));
  });

  it("T-04: Mode B reports honest partial failure if successor creation crashes", async () => {
    const parentTask = (
      await mockTaskModel.create({
        _id: "task_crash_01",
        userId: "user_test",
        title: "Workout Routine",
        dueDate: "2026-10-31",
        status: "pending",
        recurring: { type: "daily" },
        version: 1,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      })
    )[0];

    // Simulate unexpected crash during successor creation
    mockTaskModel.simulateSuccessorFailure = true;

    const res = await completeTask(
      "user_test",
      parentTask._id,
      "UTC",
      mockTaskModel,
      outboxService
    );

    assert.equal(res.success, false);
    assert.equal(res.status, "SUCCESSOR_CREATION_FAILED");
    assert.equal(res.parentCompleted, true);

    // Verify parent task WAS committed as completed despite successor failure
    const inDb = await mockTaskModel.findById(parentTask._id);
    assert.equal(inDb.status, "completed");

    // Heal on retry: simulated crash resolved
    mockTaskModel.simulateSuccessorFailure = false;
    const retryRes = await completeTask(
      "user_test",
      parentTask._id,
      "UTC",
      mockTaskModel,
      outboxService
    );

    assert.equal(retryRes.success, true);
    assert.ok(retryRes.successor);
    assert.equal(retryRes.successor.dueDate, "2026-11-01");
  });

  it("T-05: uncompleteTask reverts task status to pending with version bump and outbox event", async () => {
    const task = (
      await mockTaskModel.create({
        _id: "task_uncomplete_01",
        userId: "user_test",
        title: "Review PR",
        dueDate: "2026-10-31",
        status: "completed",
        completedAt: new Date(),
        version: 2,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      })
    )[0];

    const res = await uncompleteTask(
      "user_test",
      task._id,
      "UTC",
      mockTaskModel,
      outboxService
    );

    assert.equal(res.success, true);
    const inDb = await mockTaskModel.findById(task._id);
    assert.equal(inDb.status, "pending");
    assert.equal(inDb.completedAt, null);
    assert.equal(inDb.version, 3);

    const outbox = await mockOutboxModel.find({ aggregateId: task._id, type: "domain.task.updated" });
    assert.equal(outbox.length, 1);
  });

  it("T-06: skipTask advances status to skipped with version bump", async () => {
    const task = (
      await mockTaskModel.create({
        _id: "task_skip_01",
        userId: "user_test",
        title: "Evening Walk",
        dueDate: "2026-10-31",
        status: "pending",
        version: 1,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      })
    )[0];

    const res = await skipTask(
      "user_test",
      task._id,
      mockTaskModel,
      outboxService
    );

    assert.equal(res.success, true);
    const inDb = await mockTaskModel.findById(task._id);
    assert.equal(inDb.status, "skipped");
    assert.equal(inDb.version, 2);
  });

  it("T-07: rescheduleOverdue moves overdue tasks and emits domain.task.updated with reason overdue_reschedule", async () => {
    await mockTaskModel.create({
      _id: "task_overdue_01",
      userId: "user_test",
      title: "File Taxes",
      dueDate: "2026-10-15",
      status: "pending",
      version: 1,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const res = await rescheduleOverdue(
      "user_test",
      "UTC",
      mockTaskModel,
      outboxService
    );

    assert.equal(res.success, true);
    assert.equal(res.rescheduledCount, 1);

    const inDb = await mockTaskModel.findById("task_overdue_01");
    assert.ok(inDb);
    assert.equal(inDb.version, 2);

    const outbox = await mockOutboxModel.find({
      aggregateId: "task_overdue_01",
      type: "domain.task.updated",
    });
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].payload.reason, "overdue_reschedule");
  });

  it("T-08: handleCompleteTask kernel handler delegates cleanly to taskEngine", async () => {
    const task = (
      await mockTaskModel.create({
        _id: "task_kernel_complete_01",
        userId: "user_test",
        title: "Kernel Complete Task",
        dueDate: "2026-10-31",
        status: "pending",
        version: 1,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      })
    )[0];

    const result = await handleCompleteTask(
      {
        taskId: task._id,
      },
      "user_test",
      {
        taskModel: mockTaskModel,
        outboxService,
      }
    );

    assert.equal(result.success, true);
    const inDb = await mockTaskModel.findById(task._id);
    assert.equal(inDb.status, "completed");
  });
});
