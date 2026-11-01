/**
 * b2WorkerLeasing.test.ts
 * 
 * Loop 3 (WP2) Verification Suite:
 * - Atomic CAS worker lease acquisition
 * - Expired lease reclamation by competing workers
 * - Monotonic generation fencing: stalled worker cannot acknowledge after reassignment
 * - Heartbeat lease renewal
 * - CausalSequence ordered dispatch per aggregate
 * - Exponential backoff retry and DEAD_LETTER quarantine after maxAttempts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { WorkerLeaseManager } from "../events/dispatch/WorkerLeaseManager";
import { DurableOutboxDispatcher } from "../events/dispatch/DurableOutboxDispatcher";
import { matchesMongoQuery } from "./helpers/mockMongoMatcher";

class MockOutboxCollection {
  public docs: Map<string, any> = new Map();

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

  async findById(id: string): Promise<any> {
    const doc = this.docs.get(id);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  async create(docs: any | any[]): Promise<any[]> {
    const arr = Array.isArray(docs) ? docs : [docs];
    const created = arr.map((item) => {
      const id = item._id || item.eventId || `id_${Date.now()}_${Math.random()}`;
      const doc = { _id: id, ...item };
      this.docs.set(id, doc);
      return JSON.parse(JSON.stringify(doc));
    });
    return created;
  }

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, opts?: any): Promise<any | null> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return JSON.parse(JSON.stringify(doc));
      }
    }
    return null;
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
  }
}

describe("LOOP 3 (WP2): Durable Outbox Dispatcher & Monotonic Fencing Engine", () => {
  let mockOutbox: MockOutboxCollection;
  let leaseManager: WorkerLeaseManager;

  beforeEach(() => {
    mockOutbox = new MockOutboxCollection();
    leaseManager = new WorkerLeaseManager({ outboxModel: mockOutbox });
  });

  it("LEASE-01: Atomic CAS lease acquisition reserves pending events and increments leaseGeneration", async () => {
    await mockOutbox.create({
      _id: "evt_001",
      deliveryStatus: "PENDING",
      nextAttemptAt: new Date(Date.now() - 1000),
      leaseGeneration: 0,
      attempts: 0,
    });

    const acquired = await leaseManager.acquireLeases("worker_alpha", 10, 15000);
    assert.equal(acquired.length, 1);
    assert.equal(acquired[0]._id, "evt_001");
    assert.equal(acquired[0].deliveryStatus, "PROCESSING");
    assert.equal(acquired[0].leasedByWorkerId, "worker_alpha");
    assert.equal(acquired[0].leaseGeneration, 1);
    assert.equal(acquired[0].attempts, 1);
    assert.ok(new Date(acquired[0].leaseExpiresAt!).getTime() > Date.now());

    // Competing worker cannot acquire same event while active
    const secondAcquire = await leaseManager.acquireLeases("worker_beta", 10, 15000);
    assert.equal(secondAcquire.length, 0, "Active lease cannot be acquired by another worker");
  });

  it("LEASE-02: Expired lease is reclaimed by another worker after leaseExpiresAt has elapsed", async () => {
    // Event was leased by worker_alpha, but expired 5 seconds ago
    await mockOutbox.create({
      _id: "evt_002",
      deliveryStatus: "PROCESSING",
      leasedByWorkerId: "worker_alpha",
      leaseExpiresAt: new Date(Date.now() - 5000), // EXPIRED!
      leaseGeneration: 1,
      attempts: 1,
    });

    const acquired = await leaseManager.acquireLeases("worker_beta", 10, 15000);
    assert.equal(acquired.length, 1);
    assert.equal(acquired[0]._id, "evt_002");
    assert.equal(acquired[0].deliveryStatus, "PROCESSING");
    assert.equal(acquired[0].leasedByWorkerId, "worker_beta");
    assert.equal(acquired[0].leaseGeneration, 2, "Lease generation must increment to 2");
    assert.equal(acquired[0].attempts, 2);
  });

  it("LEASE-03: Stalled worker is fenced out when attempting acknowledgment after reassignment", async () => {
    // 1. Worker Alpha acquires event (gen 1)
    await mockOutbox.create({
      _id: "evt_003",
      deliveryStatus: "PENDING",
      nextAttemptAt: new Date(Date.now() - 1000),
      leaseGeneration: 0,
      attempts: 0,
    });

    const acquiredA = await leaseManager.acquireLeases("worker_alpha", 1, 1000); // 1s lease
    assert.equal(acquiredA[0].leaseGeneration, 1);

    // 2. Simulate Worker Alpha stalling: lease expires
    const doc = mockOutbox.docs.get("evt_003");
    doc.leaseExpiresAt = new Date(Date.now() - 5000);

    // 3. Worker Beta acquires the expired event (gen 2)
    const acquiredB = await leaseManager.acquireLeases("worker_beta", 1, 15000);
    assert.equal(acquiredB.length, 1);
    assert.equal(acquiredB[0].leaseGeneration, 2);

    // 4. Stalled Worker Alpha wakes up and attempts to acknowledge completion with its stale generation 1
    const ackA = await leaseManager.acknowledgeCompletion("evt_003", "worker_alpha", 1);
    assert.equal(ackA, false, "Stalled worker MUST be fenced out (matchedCount: 0)");

    // Event is still in PROCESSING under Worker Beta
    const freshDoc = await mockOutbox.findById("evt_003");
    assert.equal(freshDoc.deliveryStatus, "PROCESSING");
    assert.equal(freshDoc.leasedByWorkerId, "worker_beta");

    // 5. Worker Beta acknowledges with generation 2: succeeds!
    const ackB = await leaseManager.acknowledgeCompletion("evt_003", "worker_beta", 2);
    assert.equal(ackB, true);

    const deliveredDoc = await mockOutbox.findById("evt_003");
    assert.equal(deliveredDoc.deliveryStatus, "DELIVERED");
  });

  it("LEASE-04: Heartbeat renewLease extends lease expiration while preserving generation", async () => {
    await mockOutbox.create({
      _id: "evt_004",
      deliveryStatus: "PENDING",
      nextAttemptAt: new Date(Date.now() - 1000),
      leaseGeneration: 0,
      attempts: 0,
    });

    const [event] = await leaseManager.acquireLeases("worker_alpha", 1, 5000);
    const initialExpiry = new Date(event.leaseExpiresAt!).getTime();

    // Renew lease by 30 seconds
    const renewed = await leaseManager.renewLease("evt_004", "worker_alpha", 1, 30000);
    assert.equal(renewed, true);

    const updated = await mockOutbox.findById("evt_004");
    const renewedExpiry = new Date(updated.leaseExpiresAt!).getTime();
    assert.ok(renewedExpiry > initialExpiry, "Lease expiration must be extended");
    assert.equal(updated.leaseGeneration, 1, "Heartbeat renewal preserves lease generation");
  });

  it("LEASE-05: DurableOutboxDispatcher processes events in monotonic causalSequence order", async () => {
    // Seed events out of order for same aggregate
    await mockOutbox.create([
      {
        _id: "evt_agg1_v2_2",
        aggregateId: "task_999",
        causalSequence: 2002, // Ordinal 2
        deliveryStatus: "PENDING",
        nextAttemptAt: new Date(Date.now() - 1000),
        leaseGeneration: 0,
        attempts: 0,
      },
      {
        _id: "evt_agg1_v2_1",
        aggregateId: "task_999",
        causalSequence: 2001, // Ordinal 1 (must be processed FIRST)
        deliveryStatus: "PENDING",
        nextAttemptAt: new Date(Date.now() - 1000),
        leaseGeneration: 0,
        attempts: 0,
      },
    ]);

    const executionOrder: number[] = [];
    const dispatcher = new DurableOutboxDispatcher({
      workerId: "worker_dispatcher_test",
      leaseManager,
      consumerHandler: async (event) => {
        executionOrder.push(event.causalSequence);
        return { success: true };
      },
    });

    const cycleReport = await dispatcher.executeCycle();
    assert.equal(cycleReport.leasedCount, 2);
    assert.equal(cycleReport.succeededCount, 2);
    assert.deepEqual(executionOrder, [2001, 2002], "Events for same aggregate MUST execute in monotonic causalSequence order");
  });

  it("LEASE-06: Exponential retry backoff on consumer failure and quarantine to DEAD_LETTER after maxAttempts", async () => {
    await mockOutbox.create({
      _id: "evt_failing",
      deliveryStatus: "PENDING",
      nextAttemptAt: new Date(Date.now() - 1000),
      leaseGeneration: 0,
      attempts: 4, // 4 prior attempts, next failure hits maxAttempts (5)
    });

    const dispatcher = new DurableOutboxDispatcher({
      workerId: "worker_failing_test",
      maxAttempts: 5,
      leaseManager,
      consumerHandler: async () => {
        return { success: false, error: "Permanent poison pill payload" };
      },
    });

    const report = await dispatcher.executeCycle();
    assert.equal(report.leasedCount, 1);
    assert.equal(report.deadLetterCount, 1, "5th attempt failure must quarantine to DEAD_LETTER");

    const deadEvent = await mockOutbox.findById("evt_failing");
    assert.equal(deadEvent.deliveryStatus, "DEAD_LETTER");
    assert.equal(deadEvent.failureReason, "Permanent poison pill payload");
  });
});
