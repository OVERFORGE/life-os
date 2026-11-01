import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PublicationEligibilityGate } from "../../events/delivery/PublicationEligibilityGate";
import { UserDeliverySequencer } from "../../events/delivery/UserDeliverySequencer";
import { SSEConnectionManager } from "../../../../../apps/web/server/services/SSEConnectionManager";
import { TabSyncCoordinator } from "../../../../../apps/web/features/runtime/services/TabSyncCoordinator";

describe("Step 3 Loop 7: End-to-End Reactive Connectivity Pipeline", () => {
  it("must execute full pipeline from mutation convergence to client invalidation", async () => {
    // 1. Setup in-memory stores
    const userId = "user_e2e_1";
    const eventId = "evt_task_e2e_101";

    const mockLedgers = [
      { userId, eventId, consumerName: "ExecutionGraphConsumer", status: "SUCCEEDED" },
      { userId, eventId, consumerName: "GoalIntelligenceConsumer", status: "SUCCEEDED" },
      { userId, eventId, consumerName: "CadenceLearningConsumer", status: "SUCCEEDED" },
      { userId, eventId, consumerName: "BehavioralIntelligenceConsumer", status: "SUCCEEDED" },
    ];

    const mockOutbox = [
      {
        _id: "out_e2e_1",
        eventId,
        userId,
        type: "domain.task.completed",
        aggregateId: "task_e2e_1",
        aggregateType: "task",
        deliveryStatus: "DELIVERED",
        occurredAt: new Date(1000),
      },
    ];

    const journal: any[] = [];
    const sequences = new Map<string, number>();

    // 2. Publication Eligibility Gate check
    const gate = new PublicationEligibilityGate({
      ledgerModel: {
        find: () => ({ lean: async () => mockLedgers }),
      },
    });

    const eligibility = await gate.evaluateEligibility(mockOutbox[0]);
    assert.equal(eligibility.eligible, true, "Mutation must be cleared by Publication Eligibility Gate");

    // 3. User Delivery Sequencer & Journaling
    const mockLeaseManager: any = {
      acquirePartitionLease: async (_w: any, _u: any, _t: any, _i: any, dur: number) => ({
        acquired: true,
        lease: { leaseGeneration: 1, expiresAt: Date.now() + dur },
      }),
      releasePartitionLease: async () => {},
    };

    const mockSequenceModel = {
      findOneAndUpdate: async () => {
        sequences.set(userId, 1);
        return { userId, currentSequence: 1 };
      },
      findOne: () => ({
        lean: async () => ({ userId, currentSequence: sequences.get(userId) || 1 }),
      }),
    };

    const mockJournalModel = {
      find: (filter: any) => ({
        sort: () => ({
          lean: async () => journal.filter((j) => j.userId === filter.userId),
        }),
        lean: async () => journal.filter((j) => j.userId === filter.userId),
      }),
      insertMany: async (entries: any[]) => journal.push(...entries),
      updateOne: async (_f: any, u: any) => {
        if (journal[0]) Object.assign(journal[0], u.$set);
      },
    };

    const mockOutboxModel = {
      find: () => ({
        limit: () => ({
          lean: async () => mockOutbox.filter((o) => (o as any).deliverySeq == null),
        }),
      }),
      updateOne: async (_f: any, u: any) => {
        Object.assign(mockOutbox[0], u.$set);
      },
    };

    const sequencer = new UserDeliverySequencer({
      leaseManager: mockLeaseManager,
      sequenceModel: mockSequenceModel,
      journalModel: mockJournalModel,
      outboxModel: mockOutboxModel,
      gate,
    });

    const sseManager = SSEConnectionManager.getInstance();
    sseManager.reset();

    // 4. Register client SSE connection
    const clientReceivedChunks: any[] = [];
    const mockController: any = {
      enqueue: (chunk: any) => clientReceivedChunks.push(chunk),
      close: () => {},
    };

    const reg = sseManager.registerConnection(userId, "127.0.0.1", mockController);
    assert.equal(reg.allowed, true);

    // 5. Sequence and publish batch
    const report = await sequencer.sequenceAndPublishUserBatch(userId, "worker_e2e", {
      onEmitFrame: async (frame) => {
        sseManager.broadcastToUser(userId, frame);
      },
    });

    assert.equal(report.success, true);
    assert.equal(report.sequencedCount, 1);
    assert.equal(journal.length, 1);
    assert.equal(journal[0].deliverySeq, 1);
    assert.equal(journal[0].status, "PUBLISHED");

    // 6. Verify client onmessage receive
    assert.equal(clientReceivedChunks.length, 1);
    const frameText = new TextDecoder().decode(clientReceivedChunks[0]);
    assert.match(frameText, /id: 1/);
    assert.match(frameText, /"tags":\["tasks","dashboard","goals","learning"\]/);

    // 7. Verify cross-tab coordination distribution
    const coordinator = new TabSyncCoordinator({
      customLocks: null,
      customBroadcastChannel: class MockBC {
        public onmessage: any;
        public postMessage() {}
        public close() {}
      },
    });

    await coordinator.initialize();
    assert.equal(coordinator.isLeader(), true);

    let clientInvalCalled = false;
    coordinator.onInvalidation((tags, seq) => {
      assert.ok(tags.includes("tasks"));
      assert.equal(seq, 1);
      clientInvalCalled = true;
    });

    coordinator.broadcastInvalidation(["tasks", "dashboard"], 1);
    assert.equal(clientInvalCalled, true, "Client invalidation handler must be triggered");

    coordinator.destroy();
  });
});

