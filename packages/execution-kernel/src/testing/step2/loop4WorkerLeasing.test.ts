/**
 * loop4WorkerLeasing.test.ts
 * 
 * Step 2 Loop 4 Test Battery:
 * - Seed-or-Acquire partition lease protocol (zero E11000 duplicate key errors)
 * - Clock-based lease expiry evaluation
 * - Monotonic fenced acknowledgment against stalled workers
 * - Dead-letter replay with Paired Consumer Processing Ledger reset
 * - Sibling consumer preservation during replay
 * - Tenant isolation on dead-letter replay
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorkerLeaseManager } from "../../events/dispatch/WorkerLeaseManager";
import { ConsumerRegistry, ICanonicalConsumer } from "../../events/consumers/ConsumerRegistry";
import { ICanonicalEventEnvelope } from "../../events/contracts/CanonicalEventContracts";

describe("Step 2 — Loop 4: Worker Leasing and Dead-Letter Recovery", () => {
  it("Scenario 1: Seed-or-Acquire protocol locks partition and fences concurrent worker without throwing E11000", async () => {
    const partitions = new Map<string, any>();

    const mockPartitionModel = {
      findOne: async (query: any) => partitions.get(query.partitionKey) || null,
      exists: async (query: any) => partitions.has(query.partitionKey),
      findOneAndUpdate: async (query: any, update: any) => {
        const existing = partitions.get(query.partitionKey);
        if (existing) {
          const isReleased = existing.status === "RELEASED";
          const isExpired = existing.leaseExpiresAt && existing.leaseExpiresAt.getTime() < Date.now();
          if (isReleased || isExpired) {
            const updated = {
              ...existing,
              ...update.$set,
              leaseGeneration: existing.leaseGeneration + (update.$inc?.leaseGeneration || 1),
            };
            partitions.set(query.partitionKey, updated);
            return updated;
          }
        }
        return null;
      },
      create: async (doc: any) => {
        if (partitions.has(doc.partitionKey)) {
          const err: any = new Error("E11000 duplicate key error collection");
          err.code = 11000;
          throw err;
        }
        partitions.set(doc.partitionKey, doc);
        return doc;
      },
      updateOne: async (query: any, update: any) => {
        const existing = partitions.get(query.partitionKey);
        if (existing && existing.leasedByWorkerId === query.leasedByWorkerId) {
          partitions.set(query.partitionKey, { ...existing, ...update.$set });
          return { matchedCount: 1 };
        }
        return { matchedCount: 0 };
      },
    };

    const leaseManager = new WorkerLeaseManager({
      partitionModel: mockPartitionModel,
    });

    // Worker 1 acquires partition
    const res1 = await leaseManager.acquirePartitionLease("worker_1", "user_1", "task", "task_100", 15000);
    assert.equal(res1.acquired, true, "Worker 1 must acquire partition lease");

    // Worker 2 attempts to acquire the exact same partition concurrently
    const res2 = await leaseManager.acquirePartitionLease("worker_2", "user_1", "task", "task_100", 15000);
    assert.equal(res2.acquired, false, "Worker 2 must be cleanly locked out without throwing duplicate key error");

    // Worker 1 releases partition
    const released = await leaseManager.releasePartitionLease("user_1:task:task_100", "worker_1", 1);
    assert.equal(released, true);

    // Worker 2 can now acquire the released partition
    const res3 = await leaseManager.acquirePartitionLease("worker_2", "user_1", "task", "task_100", 15000);
    assert.equal(res3.acquired, true, "Worker 2 must acquire now that partition is released");
  });

  it("Scenario 2: Clock-based expiry allows re-acquisition of stalled partition without TTL delay", async () => {
    const expiredDate = new Date(Date.now() - 5000); // Expired 5 seconds ago
    const partitions = new Map<string, any>([
      [
        "user_1:goal:goal_stalled",
        {
          partitionKey: "user_1:goal:goal_stalled",
          userId: "user_1",
          aggregateType: "goal",
          aggregateId: "goal_stalled",
          leasedByWorkerId: "worker_dead",
          status: "ACTIVE",
          leaseExpiresAt: expiredDate,
          leaseGeneration: 2,
        },
      ],
    ]);

    const mockPartitionModel = {
      findOneAndUpdate: async (query: any, update: any) => {
        const existing = partitions.get(query.partitionKey);
        if (existing) {
          const isExpired = existing.leaseExpiresAt.getTime() < Date.now();
          if (isExpired) {
            const updated = {
              ...existing,
              ...update.$set,
              leaseGeneration: existing.leaseGeneration + (update.$inc?.leaseGeneration || 1),
            };
            partitions.set(query.partitionKey, updated);
            return updated;
          }
        }
        return null;
      },
      exists: async () => true,
    };

    const leaseManager = new WorkerLeaseManager({
      partitionModel: mockPartitionModel,
    });

    const res = await leaseManager.acquirePartitionLease("worker_healthy", "user_1", "goal", "goal_stalled", 15000);
    assert.equal(res.acquired, true, "Expired partition lease must be acquired immediately");
    assert.equal(res.lease.leasedByWorkerId, "worker_healthy");
    assert.equal(res.lease.leaseGeneration, 3, "Generation must advance monotonically");
  });

  it("Scenario 3: Monotonic fenced acknowledgment prevents stalled worker from committing", async () => {
    let outboxDoc = {
      _id: "evt_123",
      deliveryStatus: "PROCESSING",
      leasedByWorkerId: "worker_2", // Re-leased by worker 2 at generation 2
      leaseGeneration: 2,
    };

    const mockOutboxModel = {
      updateOne: async (filter: any, update: any) => {
        if (
          filter._id === outboxDoc._id &&
          filter.leasedByWorkerId === outboxDoc.leasedByWorkerId &&
          filter.leaseGeneration === outboxDoc.leaseGeneration
        ) {
          outboxDoc = { ...outboxDoc, ...update.$set };
          return { matchedCount: 1 };
        }
        return { matchedCount: 0 };
      },
    };

    const leaseManager = new WorkerLeaseManager({
      outboxModel: mockOutboxModel,
    });

    // Stalled worker 1 tries to acknowledge completion using generation 1
    const ackWorker1 = await leaseManager.acknowledgeCompletion("evt_123", "worker_1", 1);
    assert.equal(ackWorker1, false, "Stalled worker 1 must be fenced out (matchedCount: 0)");

    // Legitimate worker 2 acknowledges completion using generation 2
    const ackWorker2 = await leaseManager.acknowledgeCompletion("evt_123", "worker_2", 2);
    assert.equal(ackWorker2, true, "Worker 2 must successfully acknowledge");
    assert.equal(outboxDoc.deliveryStatus, "DELIVERED");
  });

  it("Scenario 4: Dead-Letter replay resets failed consumers to PENDING_RETRY while preserving SUCCEEDED consumers", async () => {
    let outboxDoc = {
      _id: "evt_dlq_1",
      userId: "user_1",
      deliveryStatus: "DEAD_LETTER",
      attempts: 5,
      failureReason: "Downstream consumer crashed",
      leaseGeneration: 5,
    };

    const ledgers = new Map<string, any>([
      [
        "user_1:ConsumerA:evt_dlq_1",
        { ledgerKey: "user_1:ConsumerA:evt_dlq_1", userId: "user_1", consumerName: "ConsumerA", eventId: "evt_dlq_1", status: "SUCCEEDED" },
      ],
      [
        "user_1:ConsumerB:evt_dlq_1",
        { ledgerKey: "user_1:ConsumerB:evt_dlq_1", userId: "user_1", consumerName: "ConsumerB", eventId: "evt_dlq_1", status: "FAILED_TERMINAL" },
      ],
    ]);

    const mockOutboxModel = {
      findOneAndUpdate: async (filter: any, update: any) => {
        if (filter._id === outboxDoc._id && filter.userId === outboxDoc.userId && filter.deliveryStatus === "DEAD_LETTER") {
          outboxDoc = {
            ...outboxDoc,
            ...update.$set,
            leaseGeneration: outboxDoc.leaseGeneration + (update.$inc?.leaseGeneration || 1),
          };
          return outboxDoc;
        }
        return null;
      },
    };

    const mockLedgerModel = {
      findOne: async (query: any) => ledgers.get(query.ledgerKey) || null,
      updateMany: async (filter: any, update: any) => {
        for (const [key, doc] of ledgers.entries()) {
          if (doc.eventId === filter.eventId && doc.userId === filter.userId && filter.status.$in.includes(doc.status)) {
            ledgers.set(key, { ...doc, ...update.$set });
          }
        }
        return { modifiedCount: 1 };
      },
      findOneAndUpdate: async (query: any, update: any) => {
        const existing = ledgers.get(query.ledgerKey) || {};
        const updated = { ...existing, ...update.$set };
        ledgers.set(query.ledgerKey, updated);
        return updated;
      },
    };

    const leaseManager = new WorkerLeaseManager({
      outboxModel: mockOutboxModel,
      ledgerModel: mockLedgerModel,
    });

    const replayRes = await leaseManager.replayDeadLetter("evt_dlq_1", "user_1");
    assert.equal(replayRes.replayed, true);
    assert.equal(outboxDoc.deliveryStatus, "PENDING", "Outbox status must reset to PENDING");
    assert.equal(outboxDoc.attempts, 0, "Attempts must reset to 0");

    // Verify Consumer A remains SUCCEEDED while Consumer B was reset to PENDING_RETRY
    const ledgerA = ledgers.get("user_1:ConsumerA:evt_dlq_1");
    const ledgerB = ledgers.get("user_1:ConsumerB:evt_dlq_1");
    assert.equal(ledgerA.status, "SUCCEEDED", "Succeeded sibling consumer must NOT be reset");
    assert.equal(ledgerB.status, "PENDING_RETRY", "Failed sibling consumer must be reset to PENDING_RETRY");

    // Test ConsumerRegistry redispatch with Partial Acknowledgment
    const registry = new ConsumerRegistry({ ledgerModel: mockLedgerModel });

    let consumerAExecuted = false;
    let consumerBExecuted = false;

    const consumerA: ICanonicalConsumer = {
      name: "ConsumerA",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["domain.test.event"],
      process: async () => { consumerAExecuted = true; return { status: "SUCCEEDED" }; },
    };

    const consumerB: ICanonicalConsumer = {
      name: "ConsumerB",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["domain.test.event"],
      process: async () => { consumerBExecuted = true; return { status: "SUCCEEDED" }; },
    };

    registry.register(consumerA);
    registry.register(consumerB);

    const testEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_dlq_1",
      occurredAt: Date.now() as any,
      userId: "user_1",
      category: "DOMAIN_EVENT",
      type: "domain.test.event",
      aggregateId: "agg_1",
      aggregateType: "task",
      aggregateVersion: 1,
      causalSequence: 1000,
      source: "Test",
      payload: {},
    } as any;

    const dispatchRes = await registry.dispatch(testEnvelope, 6);
    assert.equal(dispatchRes.success, true);
    assert.equal(consumerAExecuted, false, "Consumer A was already SUCCEEDED and must be skipped");
    assert.equal(consumerBExecuted, true, "Consumer B was PENDING_RETRY and must execute");
    assert.ok(dispatchRes.skippedConsumers.includes("ConsumerA"));
    assert.ok(dispatchRes.processedConsumers.includes("ConsumerB"));
  });

  it("Scenario 5: Tenant isolation prevents cross-user dead-letter replay", async () => {
    const mockOutboxModel = {
      findOneAndUpdate: async () => null, // Filter { userId: "user_B" } does not match user A document
    };

    const leaseManager = new WorkerLeaseManager({
      outboxModel: mockOutboxModel,
    });

    const res = await leaseManager.replayDeadLetter("evt_user_A", "user_B");
    assert.equal(res.replayed, false);
    assert.match(res.error || "", /tenant mismatch/i);
  });
});
