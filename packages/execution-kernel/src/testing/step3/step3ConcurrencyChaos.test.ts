import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UserDeliverySequencer } from "../../events/delivery/UserDeliverySequencer";
import { PublicationEligibilityGate } from "../../events/delivery/PublicationEligibilityGate";

describe("Step 3 Loop 7: Concurrency Chaos & Distributed Failure Battery", () => {
  it("worker pause-resume race: stale worker must be fenced out when lease expires", async () => {
    let leaseGen = 1;
    let activeWorker = "worker_A";
    let leaseExpires = Date.now() + 50; // 50ms lease

    const mockLeaseManager: any = {
      acquirePartitionLease: async (
        workerId: string,
        _userId?: string,
        _domain?: string,
        _partition?: string,
        leaseDurationMs?: number
      ) => {
        const now = Date.now();
        if (now < leaseExpires && activeWorker !== workerId) {
          return { acquired: false };
        }
        activeWorker = workerId;
        leaseGen++;
        leaseExpires = now + (leaseDurationMs ?? 5000);
        return {
          acquired: true,
          lease: { leaseGeneration: leaseGen, expiresAt: leaseExpires },
        };
      },
      releasePartitionLease: async () => {},
    };

    const sequencer = new UserDeliverySequencer({
      leaseManager: mockLeaseManager,
      sequenceModel: {
        findOneAndUpdate: async () => ({ currentSequence: 10 }),
        findOne: () => ({ lean: async () => ({ currentSequence: 10 }) }),
      },
      journalModel: {
        find: () => ({ sort: () => ({ lean: async () => [] }), lean: async () => [] }),
        insertMany: async () => {},
        updateOne: async () => {},
      },
      outboxModel: {
        find: () => ({ limit: () => ({ lean: async () => [] }) }),
        updateOne: async () => {},
      },
      gate: { evaluateEligibility: async () => ({ eligible: true }) } as any,
    });

    // 1. Worker A acquires lease
    const reportA = await sequencer.sequenceAndPublishUserBatch("u1", "worker_A", { leaseDurationMs: 50 });
    assert.equal(reportA.success, true);

    // 2. Worker A pauses for 60ms (lease expires)
    await new Promise((r) => setTimeout(r, 60));

    // 3. Worker B acquires lease
    const reportB = await sequencer.sequenceAndPublishUserBatch("u1", "worker_B", { leaseDurationMs: 5000 });
    assert.equal(reportB.success, true);
    assert.equal(activeWorker, "worker_B");

    // 4. Worker A resumes and attempts to sequence again; must be rejected because Worker B holds active lease
    const reportAStale = await sequencer.sequenceAndPublishUserBatch("u1", "worker_A");
    assert.equal(reportAStale.success, false);
    assert.equal(reportAStale.reason, "LEASE_HELD_BY_ANOTHER_WORKER");
  });

  it("crash after journal persistence before wire push: recovery worker flushes COMMITTED records", async () => {
    const journal: any[] = [
      {
        _id: "j_unpushed",
        userId: "u_crash",
        deliverySeq: 55,
        eventId: "e_55",
        eventType: "domain.goal.created",
        aggregateId: "g_1",
        aggregateType: "goal",
        occurredAt: new Date(5000),
        status: "COMMITTED",
        invalidationTags: ["goals", "dashboard"],
      },
    ];

    const mockJournalModel = {
      find: (filter: any) => ({
        sort: () => ({ lean: async () => journal.filter((j) => !filter.status || j.status === filter.status) }),
        lean: async () => journal.filter((j) => !filter.status || j.status === filter.status),
      }),
      insertMany: async () => {},
      updateOne: async (f: any, u: any) => {
        if (journal[0]) Object.assign(journal[0], u.$set);
      },
    };

    const sequencer = new UserDeliverySequencer({
      leaseManager: {
        acquirePartitionLease: async () => ({ acquired: true, lease: { leaseGeneration: 1 } }),
        releasePartitionLease: async () => {},
      } as any,
      sequenceModel: {
        findOneAndUpdate: async () => ({ currentSequence: 55 }),
        findOne: () => ({ lean: async () => ({ currentSequence: 55 }) }),
      },
      journalModel: mockJournalModel,
      outboxModel: {
        find: () => ({ limit: () => ({ lean: async () => [] }) }),
        updateOne: async () => {},
      },
      gate: { evaluateEligibility: async () => ({ eligible: true }) } as any,
    });

    const emitted: any[] = [];
    const report = await sequencer.sequenceAndPublishUserBatch("u_crash", "worker_recovery", {
      onEmitFrame: async (f) => {
        emitted.push(f);
      },
    });

    assert.equal(report.success, true);
    assert.equal(report.recoveredCount, 1);
    assert.equal(journal[0].status, "PUBLISHED");
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].deliverySeq, 55);
  });

  it("duplicate delivery attempt: unique index prevents duplicate journal entries", async () => {
    const journalSet = new Set<string>();

    const mockJournalModel = {
      find: () => ({ sort: () => ({ lean: async () => [] }), lean: async () => [] }),
      insertMany: async (entries: any[]) => {
        for (const e of entries) {
          const key = `${e.userId}:${e.eventId}`;
          if (journalSet.has(key)) {
            const err: any = new Error("E11000 duplicate key error");
            err.code = 11000;
            throw err;
          }
          journalSet.add(key);
        }
      },
      updateOne: async () => {},
    };

    const sequencer = new UserDeliverySequencer({
      leaseManager: {
        acquirePartitionLease: async () => ({ acquired: true, lease: { leaseGeneration: 1 } }),
        releasePartitionLease: async () => {},
      } as any,
      sequenceModel: {
        findOneAndUpdate: async () => ({ currentSequence: 1 }),
        findOne: () => ({ lean: async () => ({ currentSequence: 1 }) }),
      },
      journalModel: mockJournalModel,
      outboxModel: {
        find: () => ({
          limit: () => ({
            lean: async () => [
              {
                _id: "o1",
                eventId: "evt_dup",
                userId: "u1",
                type: "domain.task.created",
                aggregateId: "t1",
                aggregateType: "task",
                deliveryStatus: "DELIVERED",
              },
            ],
          }),
        }),
        updateOne: async () => {},
      },
      gate: { evaluateEligibility: async () => ({ eligible: true }) } as any,
    });

    // First attempt succeeds
    const rep1 = await sequencer.sequenceAndPublishUserBatch("u1", "w1");
    assert.equal(rep1.success, true);

    // Duplicate attempt for the same event throws duplicate key error and aborts cleanly
    const rep2 = await sequencer.sequenceAndPublishUserBatch("u1", "w1");
    assert.equal(rep2.success, false);
    assert.match(rep2.reason!, /E11000 duplicate key/);
  });
});
