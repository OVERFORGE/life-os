import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { UserDeliverySequencer } from "../../events/delivery/UserDeliverySequencer";
import { PublicationEligibilityGate } from "../../events/delivery/PublicationEligibilityGate";

describe("Step 3 Loop 3: Leased User Delivery Journaling & Replay Completeness", () => {
  let sequences: Map<string, number>;
  let journal: any[];
  let outbox: any[];
  let activeLeases: Map<string, any>;

  const mockLeaseManager: any = {
    acquirePartitionLease: async (
      workerId: string,
      userId: string,
      aggregateType: string,
      aggregateId: string,
      leaseDurationMs: number
    ) => {
      const partitionKey = `${userId}:${aggregateType}:${aggregateId}`;
      const existing = activeLeases.get(partitionKey);
      const now = Date.now();

      if (existing && existing.status === "ACTIVE" && existing.expiresAt > now) {
        if (existing.workerId !== workerId) {
          return { acquired: false };
        }
      }

      const leaseGen = (existing?.leaseGeneration || 0) + 1;
      const lease = {
        partitionKey,
        workerId,
        status: "ACTIVE",
        leaseGeneration: leaseGen,
        expiresAt: now + leaseDurationMs,
      };
      activeLeases.set(partitionKey, lease);
      return { acquired: true, lease };
    },
    releasePartitionLease: async (partitionKey: string, workerId: string) => {
      const existing = activeLeases.get(partitionKey);
      if (existing && existing.workerId === workerId) {
        existing.status = "RELEASED";
      }
    },
  };

  const mockSequenceModel = {
    findOneAndUpdate: async (filter: { userId: string }, update: any) => {
      const current = sequences.get(filter.userId) || 0;
      const inc = update.$inc?.currentSequence || 0;
      const newSeq = current + inc;
      sequences.set(filter.userId, newSeq);
      return { userId: filter.userId, currentSequence: newSeq };
    },
    findOne: (filter: { userId: string }) => ({
      lean: async () => {
        const current = sequences.get(filter.userId) || 0;
        return { userId: filter.userId, currentSequence: current };
      },
    }),
  };

  const mockJournalModel = {
    find: (filter: any) => {
      let results = journal.filter((j) => j.userId === filter.userId);
      if (filter.status) {
        results = results.filter((j) => j.status === filter.status);
      }
      if (filter.deliverySeq) {
        if (filter.deliverySeq.$gt !== undefined) {
          results = results.filter((j) => j.deliverySeq > filter.deliverySeq.$gt);
        }
        if (filter.deliverySeq.$lte !== undefined) {
          results = results.filter((j) => j.deliverySeq <= filter.deliverySeq.$lte);
        }
      }
      return {
        sort: () => ({
          lean: async () => [...results].sort((a, b) => a.deliverySeq - b.deliverySeq),
        }),
        lean: async () => results,
      };
    },
    insertMany: async (entries: any[]) => {
      journal.push(...entries);
    },
    create: async (entry: any) => {
      journal.push(entry);
    },
    updateOne: async (filter: any, update: any) => {
      for (const j of journal) {
        let match = true;
        if (filter._id && j._id !== filter._id) match = false;
        if (filter.userId && j.userId !== filter.userId) match = false;
        if (filter.deliverySeq && j.deliverySeq !== filter.deliverySeq) match = false;
        if (match) {
          if (update.$set) {
            Object.assign(j, update.$set);
          }
        }
      }
    },
  };

  const mockOutboxModel = {
    find: (filter: any) => {
      let results = outbox.filter((o) => o.userId === filter.userId);
      if (filter.deliveryStatus) {
        results = results.filter((o) => o.deliveryStatus === filter.deliveryStatus);
      }
      results = results.filter((o) => o.deliverySeq == null);
      return {
        limit: (n: number) => ({
          lean: async () => results.slice(0, n),
        }),
      };
    },
    updateOne: async (filter: any, update: any) => {
      for (const o of outbox) {
        if (o._id === filter._id) {
          if (update.$set) {
            Object.assign(o, update.$set);
          }
        }
      }
    },
  };

  // Mock Gate: approves all DELIVERED events for simplicity of sequencer unit testing
  const mockGate = {
    evaluateEligibility: async (event: any) => ({
      eligible: event.deliveryStatus === "DELIVERED",
    }),
  } as unknown as PublicationEligibilityGate;

  beforeEach(() => {
    sequences = new Map();
    journal = [];
    outbox = [];
    activeLeases = new Map();
  });

  it("must sequence and persist events monotonically in batch", async () => {
    const sequencer = new UserDeliverySequencer({
      leaseManager: mockLeaseManager,
      sequenceModel: mockSequenceModel,
      journalModel: mockJournalModel,
      outboxModel: mockOutboxModel,
      gate: mockGate,
    });

    outbox.push(
      { _id: "out_1", eventId: "evt_1", userId: "u1", type: "domain.task.created", aggregateId: "t1", aggregateType: "task", deliveryStatus: "DELIVERED", occurredAt: new Date(1000) },
      { _id: "out_2", eventId: "evt_2", userId: "u1", type: "domain.task.completed", aggregateId: "t1", aggregateType: "task", deliveryStatus: "DELIVERED", occurredAt: new Date(2000) }
    );

    const emittedFrames: any[] = [];
    const report = await sequencer.sequenceAndPublishUserBatch("u1", "worker_A", {
      onEmitFrame: async (frame) => {
        emittedFrames.push(frame);
      },
    });

    assert.equal(report.success, true);
    assert.equal(report.sequencedCount, 2);
    assert.equal(report.startSequence, 1);
    assert.equal(report.endSequence, 2);

    // Verify journal persistence
    assert.equal(journal.length, 2);
    assert.equal(journal[0].deliverySeq, 1);
    assert.equal(journal[0].status, "PUBLISHED");
    assert.equal(journal[1].deliverySeq, 2);
    assert.equal(journal[1].status, "PUBLISHED");

    // Verify emitted frame wire order
    assert.equal(emittedFrames.length, 2);
    assert.equal(emittedFrames[0].deliverySeq, 1);
    assert.equal(emittedFrames[1].deliverySeq, 2);
  });

  it("must block concurrent worker while lease is held (eliminating pause-reorder race)", async () => {
    const sequencer = new UserDeliverySequencer({
      leaseManager: mockLeaseManager,
      sequenceModel: mockSequenceModel,
      journalModel: mockJournalModel,
      outboxModel: mockOutboxModel,
      gate: mockGate,
    });

    outbox.push(
      { _id: "out_1", eventId: "evt_1", userId: "u1", type: "domain.task.created", aggregateId: "t1", aggregateType: "task", deliveryStatus: "DELIVERED" }
    );

    // Worker A acquires lease
    await mockLeaseManager.acquirePartitionLease("worker_A", "u1", "delivery", "stream", 5000);

    // Worker B attempts to sequence for the same user concurrently
    const reportB = await sequencer.sequenceAndPublishUserBatch("u1", "worker_B");

    assert.equal(reportB.success, false);
    assert.equal(reportB.reason, "LEASE_HELD_BY_ANOTHER_WORKER");
    assert.equal(reportB.sequencedCount, 0);
  });

  it("must recover and publish unpushed COMMITTED journal entries after crash", async () => {
    const sequencer = new UserDeliverySequencer({
      leaseManager: mockLeaseManager,
      sequenceModel: mockSequenceModel,
      journalModel: mockJournalModel,
      outboxModel: mockOutboxModel,
      gate: mockGate,
    });

    // Simulate journal record left in COMMITTED state from previous crashed worker
    journal.push({
      _id: "j_crash_1",
      userId: "u1",
      deliverySeq: 101,
      eventId: "evt_crash",
      eventType: "domain.task.created",
      aggregateId: "t1",
      aggregateType: "task",
      occurredAt: new Date(1000),
      status: "COMMITTED",
      invalidationTags: ["tasks"],
    });

    sequences.set("u1", 101);

    const emittedFrames: any[] = [];
    const report = await sequencer.sequenceAndPublishUserBatch("u1", "worker_recovery", {
      onEmitFrame: async (f) => {
        emittedFrames.push(f);
      },
    });

    assert.equal(report.success, true);
    assert.equal(report.recoveredCount, 1);
    assert.equal(journal[0].status, "PUBLISHED");
    assert.equal(emittedFrames.length, 1);
    assert.equal(emittedFrames[0].deliverySeq, 101);
  });

  it("verifyReplayInterval: must satisfy 5-point theorem for exact interval", async () => {
    const sequencer = new UserDeliverySequencer({
      leaseManager: mockLeaseManager,
      sequenceModel: mockSequenceModel,
      journalModel: mockJournalModel,
      outboxModel: mockOutboxModel,
      gate: mockGate,
      maxReplayBuffer: 50,
    });

    sequences.set("u1", 103);
    journal.push(
      { userId: "u1", deliverySeq: 101, eventId: "e1" },
      { userId: "u1", deliverySeq: 102, eventId: "e2" },
      { userId: "u1", deliverySeq: 103, eventId: "e3" }
    );

    // Client requests replay from lastAckSeq: 100 to currentSeq: 103 (delta: 3)
    const res = await sequencer.verifyReplayInterval("u1", 100);

    assert.equal(res.complete, true);
    assert.equal(res.resyncRequired, false);
    assert.equal(res.delta, 3);
    assert.equal(res.records?.length, 3);
    assert.equal(res.records![0].deliverySeq, 101);
    assert.equal(res.records![2].deliverySeq, 103);
  });

  it("verifyReplayInterval: must require resync on sequence gap or missing record", async () => {
    const sequencer = new UserDeliverySequencer({
      leaseManager: mockLeaseManager,
      sequenceModel: mockSequenceModel,
      journalModel: mockJournalModel,
      outboxModel: mockOutboxModel,
      gate: mockGate,
      maxReplayBuffer: 50,
    });

    sequences.set("u1", 103);
    // Gap: 102 is missing!
    journal.push(
      { userId: "u1", deliverySeq: 101, eventId: "e1" },
      { userId: "u1", deliverySeq: 103, eventId: "e3" }
    );

    const res = await sequencer.verifyReplayInterval("u1", 100);

    assert.equal(res.complete, false);
    assert.equal(res.resyncRequired, true);
    assert.match(res.reason!, /CARDINALITY_MISMATCH/);
  });

  it("verifyReplayInterval: must require resync when replay buffer is exceeded (> 50)", async () => {
    const sequencer = new UserDeliverySequencer({
      leaseManager: mockLeaseManager,
      sequenceModel: mockSequenceModel,
      journalModel: mockJournalModel,
      outboxModel: mockOutboxModel,
      gate: mockGate,
      maxReplayBuffer: 50,
    });

    sequences.set("u1", 200);
    const res = await sequencer.verifyReplayInterval("u1", 100); // delta = 100 > 50

    assert.equal(res.complete, false);
    assert.equal(res.resyncRequired, true);
    assert.equal(res.reason, "REPLAY_BUFFER_EXCEEDED");
  });

  it("verifyReplayInterval: must require resync on cursor regression (lastAckSeq > currentSeq)", async () => {
    const sequencer = new UserDeliverySequencer({
      leaseManager: mockLeaseManager,
      sequenceModel: mockSequenceModel,
      journalModel: mockJournalModel,
      outboxModel: mockOutboxModel,
      gate: mockGate,
    });

    sequences.set("u1", 100);
    const res = await sequencer.verifyReplayInterval("u1", 150); // client says 150, server is at 100

    assert.equal(res.complete, false);
    assert.equal(res.resyncRequired, true);
    assert.equal(res.reason, "SEQUENCE_REGRESSION");
  });

  it("verifyReplayInterval: must return complete with delta 0 when client is up to date", async () => {
    const sequencer = new UserDeliverySequencer({
      leaseManager: mockLeaseManager,
      sequenceModel: mockSequenceModel,
      journalModel: mockJournalModel,
      outboxModel: mockOutboxModel,
      gate: mockGate,
    });

    sequences.set("u1", 100);
    const res = await sequencer.verifyReplayInterval("u1", 100);

    assert.equal(res.complete, true);
    assert.equal(res.resyncRequired, false);
    assert.equal(res.delta, 0);
    assert.equal(res.records?.length, 0);
  });
});

