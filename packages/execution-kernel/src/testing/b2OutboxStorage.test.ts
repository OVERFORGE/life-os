/**
 * b2OutboxStorage.test.ts
 * 
 * Loop 2 (WP1) Verification Suite:
 * - Mode B Standalone DIMIP (Two-Phase Intent Fencing with Monotonic Mutation Epoch Fencing)
 * - Concurrency conflict detection on aggregate version mismatch
 * - FencedOutError on delayed request collision after sweeper epoch advance
 * - Monotonic in-document receipt array ring buffer (capped at 50)
 * - Standalone DIMIP Recovery Sweeper (resolving V2.4 Correction A):
 *   * Case 1: Positive commit evidence in MutationReceiptModel -> Promote to PENDING
 *   * Case 1B: Positive commit evidence in aggregate ring buffer -> Reconstruct receipt & Promote
 *   * Case 2: Positive non-commit proof via atomic epoch burn -> Mark ABORTED & fence delayed requests
 *   * Case 3: Indeterminate outcome -> Quarantine to DEAD_LETTER (NEVER mark ABORTED on version alone)
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  OutboxStorageService,
  ConcurrencyConflictError,
  FencedOutError,
  AggregateNotFoundError,
} from "../events/persistence/OutboxStorageService";
import { matchesMongoQuery } from "./helpers/mockMongoMatcher";

// Lightweight, high-speed in-memory store simulating MongoDB collection operations with exact atomic semantics
class MockMongoCollection<T extends Record<string, any>> {
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
      then: (resolve: any, reject: any) => {
        return Promise.resolve(results).then(resolve, reject);
      },
      catch: (reject: any) => {
        return Promise.resolve(results).catch(reject);
      },
    };
    return queryObj;
  }

  async findOne(query: Record<string, any>): Promise<T | null> {
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) {
        return JSON.parse(JSON.stringify(doc));
      }
    }
    return null;
  }

  findById(id: string): any {
    const doc = this.docs.get(id);
    const cloned = doc ? JSON.parse(JSON.stringify(doc)) : null;
    const queryObj = {
      lean: () => Promise.resolve(cloned),
      then: (resolve: any, reject: any) => {
        return Promise.resolve(cloned).then(resolve, reject);
      },
      catch: (reject: any) => {
        return Promise.resolve(cloned).catch(reject);
      },
    };
    return queryObj;
  }

  async create(docs: any | any[], _opts?: any): Promise<any[]> {
    const arr = Array.isArray(docs) ? docs : [docs];
    const created = arr.map((item) => {
      const id = item._id || item.eventId || item.receiptId || `id_${Date.now()}_${Math.random()}`;
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

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, opts?: any): Promise<T | null> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return JSON.parse(JSON.stringify(doc));
      }
    }
    if (opts?.upsert) {
      const newDoc = { ...(update.$setOnInsert || {}), ...(update.$set || {}) } as any;
      const docId = newDoc._id || newDoc.receiptId || newDoc.eventId || `id_${Date.now()}`;
      newDoc._id = docId;
      this.docs.set(docId, newDoc);
      return JSON.parse(JSON.stringify(newDoc));
    }
    return null;
  }

  private matchesQuery(doc: Record<string, any>, query: Record<string, any>): boolean {
    return matchesMongoQuery(doc, query);
  }

  private applyUpdate(doc: Record<string, any>, update: Record<string, any>): void {
    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) {
        doc[k] = v;
      }
    }
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] ?? 0) + (v as number);
      }
    }
    if (update.$push) {
      for (const [k, v] of Object.entries(update.$push)) {
        if (!doc[k]) doc[k] = [];
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

describe("LOOP 2 (WP1): Outbox Storage & Standalone DIMIP Recovery Fencing", () => {
  let mockOutboxColl: MockMongoCollection<any>;
  let mockReceiptColl: MockMongoCollection<any>;
  let mockAggregateColl: MockMongoCollection<any>;
  let storageService: OutboxStorageService;

  beforeEach(() => {
    mockOutboxColl = new MockMongoCollection();
    mockReceiptColl = new MockMongoCollection();
    mockAggregateColl = new MockMongoCollection();

    storageService = new OutboxStorageService({
      outboxModel: mockOutboxColl,
      receiptModel: mockReceiptColl,
    });
  });

  it("OUTBOX-01: Mode B Standalone DIMIP persistWithStandaloneFencing succeeds end-to-end", async () => {
    // Seed initial aggregate: task at version 1, epoch 0
    await mockAggregateColl.create({
      _id: "task_100",
      userId: "usr_alice",
      title: "Initial Task",
      status: "pending",
      version: 1,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const result = await storageService.persistWithStandaloneFencing({
      userId: "usr_alice",
      aggregateModel: mockAggregateColl as any,
      aggregateId: "task_100",
      clientMutationId: "mut_req_001",
      diffHash: "diff_abc123",
      expectedVersion: 1,
      fencingEpoch: 0,
      domainUpdates: { status: "completed", completedAt: new Date() },
      eventDrafts: [
        {
          userId: "usr_alice",
          category: "DOMAIN_EVENT",
          type: "domain.task.completed",
          aggregateId: "task_100",
          aggregateType: "task",
          aggregateVersion: 2,
          eventOrdinal: 1,
          source: "task_executor",
          payload: { taskId: "task_100", status: "completed" },
        },
      ],
    });

    // 1. Domain aggregate version advanced to 2
    const updatedTask = await mockAggregateColl.findById("task_100");
    assert.equal(updatedTask.version, 2);
    assert.equal(updatedTask.status, "completed");
    assert.equal(updatedTask.recentMutationReceipts.length, 1);
    assert.equal(updatedTask.recentMutationReceipts[0].clientMutationId, "mut_req_001");

    // 2. Durable MutationReceiptModel record created
    assert.ok(result.receipt);
    assert.equal(result.receipt.status, "COMMITTED");
    assert.equal(result.receipt.clientMutationId, "mut_req_001");

    // 3. Outbox event promoted to PENDING
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].deliveryStatus, "PENDING");
    assert.equal(result.events[0].eventId, "evt_task_task_100_v2_1_domain_task_completed");
    assert.equal(result.events[0].causalSequence, 2001);
  });

  it("OUTBOX-02: Concurrency conflict detected when expectedVersion does not match", async () => {
    await mockAggregateColl.create({
      _id: "task_200",
      userId: "usr_alice",
      version: 3, // Already at version 3
      mutationEpoch: 0,
    });

    await assert.rejects(
      async () => {
        await storageService.persistWithStandaloneFencing({
          userId: "usr_alice",
          aggregateModel: mockAggregateColl as any,
          aggregateId: "task_200",
          clientMutationId: "mut_req_stale",
          diffHash: "diff_stale",
          expectedVersion: 2, // Caller expects version 2 (stale!)
          fencingEpoch: 0,
          domainUpdates: { status: "completed" },
          eventDrafts: [],
        });
      },
      (err: any) => {
        assert.ok(err instanceof ConcurrencyConflictError);
        assert.match(err.message, /Concurrency conflict/);
        return true;
      }
    );
  });

  it("OUTBOX-03: FencedOutError raised when recovery sweeper increments mutationEpoch", async () => {
    // Aggregate epoch was burned by sweeper to 1
    await mockAggregateColl.create({
      _id: "task_300",
      userId: "usr_alice",
      version: 1,
      mutationEpoch: 1, // Epoch advanced by recovery sweeper!
    });

    // Delayed request arrives with stale epoch 0
    await assert.rejects(
      async () => {
        await storageService.persistWithStandaloneFencing({
          userId: "usr_alice",
          aggregateModel: mockAggregateColl as any,
          aggregateId: "task_300",
          clientMutationId: "mut_req_delayed",
          diffHash: "diff_delayed",
          expectedVersion: 1,
          fencingEpoch: 0, // Request was prepared before sweeper burned epoch
          domainUpdates: { status: "completed" },
          eventDrafts: [],
        });
      },
      (err: any) => {
        assert.ok(err instanceof FencedOutError);
        assert.match(err.message, /Mutation fenced out/);
        return true;
      }
    );
  });

  it("OUTBOX-04: In-document recentMutationReceipts retains ring buffer capped at 50", async () => {
    await mockAggregateColl.create({
      _id: "task_400",
      userId: "usr_alice",
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    // Run 55 consecutive mutations
    for (let i = 0; i < 55; i++) {
      await storageService.persistWithStandaloneFencing({
        userId: "usr_alice",
        aggregateModel: mockAggregateColl as any,
        aggregateId: "task_400",
        clientMutationId: `mut_seq_${i}`,
        diffHash: `hash_${i}`,
        expectedVersion: i,
        fencingEpoch: 0,
        domainUpdates: { step: i },
        eventDrafts: [],
      });
    }

    const taskDoc = await mockAggregateColl.findById("task_400");
    assert.equal(taskDoc.version, 55);
    assert.equal(taskDoc.recentMutationReceipts.length, 50, "Ring buffer must strictly cap at 50 entries");
    assert.equal(taskDoc.recentMutationReceipts[0].clientMutationId, "mut_seq_5", "Oldest 5 entries must be evicted");
    assert.equal(taskDoc.recentMutationReceipts[49].clientMutationId, "mut_seq_54", "Latest entry must be present");
  });

  it("OUTBOX-05 (Correction A - Case 1): Sweeper detects positive commit in MutationReceiptModel and promotes to PENDING", async () => {
    // 1. Stuck outbox intent in PENDING_COMMIT
    const pastDate = new Date(Date.now() - 10000); // 10s ago (exceeds 5s grace period)
    await mockOutboxColl.create({
      _id: "evt_pending_case1",
      eventId: "evt_task_t1_v2_1_completed",
      userId: "usr_alice",
      aggregateId: "t1",
      aggregateType: "task",
      deliveryStatus: "PENDING_COMMIT",
      recordedAt: pastDate,
      mutationIntent: {
        clientMutationId: "mut_c1",
        expectedVersion: 1,
        fencingEpoch: 0,
        diffHash: "hash_c1",
      },
    });

    // 2. Positive commit evidence exists in durable receipt collection
    await mockReceiptColl.create({
      receiptId: "usr_alice:t1:mut_c1",
      aggregateId: "t1",
      clientMutationId: "mut_c1",
      status: "COMMITTED",
    });

    const result = await storageService.reconcilePendingIntents({
      gracePeriodMs: 5000,
    });

    assert.equal(result.scannedCount, 1);
    assert.equal(result.promotedCount, 1);
    assert.equal(result.abortedCount, 0);

    const promoted = await mockOutboxColl.findById("evt_pending_case1");
    assert.equal(promoted.deliveryStatus, "PENDING");
  });

  it("OUTBOX-06 (Correction A - Case 1B): Sweeper detects commit in aggregate ring buffer and reconstructs durable receipt", async () => {
    const pastDate = new Date(Date.now() - 10000);
    await mockOutboxColl.create({
      _id: "evt_pending_case1b",
      eventId: "evt_task_t2_v2_1_completed",
      userId: "usr_alice",
      aggregateId: "t2",
      aggregateType: "task",
      deliveryStatus: "PENDING_COMMIT",
      recordedAt: pastDate,
      mutationIntent: {
        clientMutationId: "mut_c1b",
        expectedVersion: 1,
        fencingEpoch: 0,
        diffHash: "hash_c1b",
      },
    });

    // Receipt is MISSING from durable MutationReceiptModel (e.g. process crashed before Step 3)
    // But present in aggregate ring buffer:
    await mockAggregateColl.create({
      _id: "t2",
      userId: "usr_alice",
      version: 2,
      mutationEpoch: 0,
      recentMutationReceipts: [
        { clientMutationId: "mut_c1b", version: 2, appliedAt: new Date() },
      ],
    });

    const result = await storageService.reconcilePendingIntents({
      gracePeriodMs: 5000,
      aggregateModelResolver: () => mockAggregateColl as any,
    });

    assert.equal(result.promotedCount, 1);

    // Outbox event promoted to PENDING
    const promoted = await mockOutboxColl.findById("evt_pending_case1b");
    assert.equal(promoted.deliveryStatus, "PENDING");

    // Durable receipt reconstructed in MutationReceiptModel
    const durableReceipt = await mockReceiptColl.findOne({
      aggregateId: "t2",
      clientMutationId: "mut_c1b",
    });
    assert.ok(durableReceipt);
    assert.equal(durableReceipt.status, "COMMITTED");
  });

  it("OUTBOX-07 (Correction A - Case 2): Sweeper proves non-commit via atomic epoch burn, marks ABORTED, and fences delayed requests", async () => {
    const pastDate = new Date(Date.now() - 10000);
    await mockOutboxColl.create({
      _id: "evt_pending_case2",
      eventId: "evt_task_t3_v2_1_completed",
      userId: "usr_alice",
      aggregateId: "t3",
      aggregateType: "task",
      deliveryStatus: "PENDING_COMMIT",
      recordedAt: pastDate,
      mutationIntent: {
        clientMutationId: "mut_c2",
        expectedVersion: 1,
        fencingEpoch: 0,
        diffHash: "hash_c2",
      },
    });

    // Aggregate is still at version 1, epoch 0 (mutation never committed)
    await mockAggregateColl.create({
      _id: "t3",
      userId: "usr_alice",
      version: 1,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const result = await storageService.reconcilePendingIntents({
      gracePeriodMs: 5000,
      aggregateModelResolver: () => mockAggregateColl as any,
    });

    assert.equal(result.abortedCount, 1);

    // 1. Outbox event marked ABORTED
    const abortedEvent = await mockOutboxColl.findById("evt_pending_case2");
    assert.equal(abortedEvent.deliveryStatus, "ABORTED");

    // 2. Aggregate epoch was atomically burned from 0 to 1
    const aggregateDoc = await mockAggregateColl.findById("t3");
    assert.equal(aggregateDoc.mutationEpoch, 1, "Sweeper must have incremented mutationEpoch");

    // 3. ABORTED_BY_RECOVERY receipt recorded
    const receipt = await mockReceiptColl.findOne({
      aggregateId: "t3",
      clientMutationId: "mut_c2",
    });
    assert.ok(receipt);
    assert.equal(receipt.status, "ABORTED_BY_RECOVERY");

    // 4. Delayed request attempting to commit now is fenced out
    await assert.rejects(
      async () => {
        await storageService.persistWithStandaloneFencing({
          userId: "usr_alice",
          aggregateModel: mockAggregateColl as any,
          aggregateId: "t3",
          clientMutationId: "mut_c2",
          diffHash: "hash_c2",
          expectedVersion: 1,
          fencingEpoch: 0, // Original epoch 0 is now stale!
          domainUpdates: { status: "completed" },
          eventDrafts: [],
        });
      },
      (err: any) => {
        assert.ok(err instanceof FencedOutError);
        return true;
      }
    );
  });

  it("OUTBOX-08 (Correction A - Case 3): Sweeper NEVER marks ABORTED on version alone; quarantines indeterminate outcome to DEAD_LETTER", async () => {
    const pastDate = new Date(Date.now() - 10000);
    await mockOutboxColl.create({
      _id: "evt_pending_case3",
      eventId: "evt_task_t4_v3_1_completed",
      userId: "usr_alice",
      aggregateId: "t4",
      aggregateType: "task",
      deliveryStatus: "PENDING_COMMIT",
      recordedAt: pastDate,
      mutationIntent: {
        clientMutationId: "mut_c3_old",
        expectedVersion: 2,
        fencingEpoch: 0,
        diffHash: "hash_c3",
      },
    });

    // Aggregate version has advanced to 5, and the recentMutationReceipts ring buffer does not contain mut_c3_old
    // (Receipt might have rotated off after 50 mutations, or intent was abandoned)
    await mockAggregateColl.create({
      _id: "t4",
      userId: "usr_alice",
      version: 5, // Advanced past expectedVersion 2
      mutationEpoch: 0,
      recentMutationReceipts: [
        { clientMutationId: "mut_c4", version: 4 },
        { clientMutationId: "mut_c5", version: 5 },
      ],
    });

    const result = await storageService.reconcilePendingIntents({
      gracePeriodMs: 5000,
      aggregateModelResolver: () => mockAggregateColl as any,
    });

    assert.equal(result.abortedCount, 0, "Must NEVER mark as ABORTED on version change alone!");
    assert.equal(result.quarantinedCount, 1, "Must quarantine unprovable intent to DEAD_LETTER");

    const quarantinedEvent = await mockOutboxColl.findById("evt_pending_case3");
    assert.equal(quarantinedEvent.deliveryStatus, "DEAD_LETTER");
    assert.match(
      quarantinedEvent.failureReason,
      /STANDALONE_INTENT_OUTCOME_INDETERMINATE/,
      "Must label reason as STANDALONE_INTENT_OUTCOME_INDETERMINATE"
    );
  });
});
