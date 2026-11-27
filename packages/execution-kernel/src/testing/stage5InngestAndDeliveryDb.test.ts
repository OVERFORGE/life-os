import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { OutboxEventModel } from "../../../../apps/web/server/db/models/OutboxEventModel";
import { UserDeliveryJournalModel } from "../../../../apps/web/server/db/models/UserDeliveryJournalModel";
import { UserDeliverySequenceModel } from "../../../../apps/web/server/db/models/UserDeliverySequenceModel";
import { ConsumerProcessingLedgerModel } from "../../../../apps/web/server/db/models/ConsumerProcessingLedgerModel";
import { PartitionLeaseModel } from "../../../../apps/web/server/db/models/PartitionLeaseModel";
import { DailyLog } from "../../../../apps/web/server/db/models/DailyLog";
import { upsertDailyLogWithOutbox } from "../../../../apps/web/features/daily-log/services/dailyLogEngine";
import {
  registerOutboxInngestHook,
  shouldRunLocalOutboxFallback,
} from "../../../../apps/web/server/inngest/outboxHook";
import { bootstrapInngestHooks } from "../../../../apps/web/server/inngest/bootstrapHooks";
import { inngest } from "../../../../apps/web/lib/inngest/client";
import { OutboxStorageService } from "../events/persistence/OutboxStorageService";
import { runOutboxDispatchBatch } from "../events/dispatch/OutboxWorkerService";
import { UserDeliverySequencer } from "../events/delivery/UserDeliverySequencer";
import { IWireDeliveryFrame } from "../events/contracts/DeliveryContracts";
import { DurableMemoryJobQueue } from "../memory/DurableMemoryJobQueue";

describe("Stage 5 Increment 5.3: Inngest Outbox Dispatch, Boot Hooks & Delivery Sequencer", () => {
  before(async () => {
    await connectIsolatedTestDB({ dbName: "life-os-stage5-3-test" });
    await Promise.all([
      OutboxEventModel.syncIndexes(),
      UserDeliveryJournalModel.syncIndexes(),
      UserDeliverySequenceModel.syncIndexes(),
      ConsumerProcessingLedgerModel.syncIndexes(),
      PartitionLeaseModel.syncIndexes(),
      DailyLog.syncIndexes(),
    ]);
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    await Promise.all([
      OutboxEventModel.deleteMany({}),
      UserDeliveryJournalModel.deleteMany({}),
      UserDeliverySequenceModel.deleteMany({}),
      ConsumerProcessingLedgerModel.deleteMany({}),
      PartitionLeaseModel.deleteMany({}),
      DailyLog.deleteMany({}),
    ]);
  });

  it("5.3-01: bootstrapInngestHooks registers outbox + memory hooks and forwards userId on lifeos/outbox.dispatched", async () => {
    const sentBatches: any[] = [];
    const originalSend = inngest.send.bind(inngest);
    (inngest as any).send = async (payload: any) => {
      sentBatches.push(payload);
      return { ids: ["mock_inngest_id"] };
    };

    const prevNodeEnv = process.env.NODE_ENV;
    const prevFallback = process.env.LIFEOS_LOCAL_OUTBOX_FALLBACK;
    const prevInngestKey = process.env.INNGEST_EVENT_KEY;
    (process.env as any).NODE_ENV = "test";
    delete process.env.LIFEOS_LOCAL_OUTBOX_FALLBACK;
    delete process.env.INNGEST_EVENT_KEY;

    try {
      bootstrapInngestHooks();
      // Calling twice must remain idempotent and not throw
      bootstrapInngestHooks();

      // Memory hook must be wired on DurableMemoryJobQueue
      const memoryQueue: any = DurableMemoryJobQueue.getInstance();
      assert.ok(memoryQueue.eventDispatcher, "Expected memory hook dispatcher to be registered");

      const userId = new mongoose.Types.ObjectId().toString();
      await upsertDailyLogWithOutbox({
        userId,
        date: "2026-11-26",
        sections: { mental: { energy: 8 } },
        options: { clientMutationId: "mut_5_3_01", source: "test_5_3_01" },
      });

      assert.ok(sentBatches.length >= 1, "Expected post-commit hook to call inngest.send");
      const flatEvents = sentBatches.flat();
      const dispatched = flatEvents.find((e) => e.name === "lifeos/outbox.dispatched");
      assert.ok(dispatched, "Expected lifeos/outbox.dispatched event");
      assert.equal(dispatched.data.userId, userId);
      assert.equal(dispatched.data.type, "domain.daily_log.updated");
    } finally {
      (inngest as any).send = originalSend;
      (process.env as any).NODE_ENV = prevNodeEnv;
      if (prevFallback !== undefined) process.env.LIFEOS_LOCAL_OUTBOX_FALLBACK = prevFallback;
      if (prevInngestKey !== undefined) process.env.INNGEST_EVENT_KEY = prevInngestKey;
    }
  });

  it("5.3-02: runOutboxDispatchBatch sequences under lease, emits frames, skips legacy cutoff, and recovers partial journal crash", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const emittedFrames: IWireDeliveryFrame[] = [];

    // 1. Insert a legacy pre-Stage-5 DELIVERED event without deliverySeq before cutoff
    await OutboxEventModel.create({
      eventId: "evt_legacy_pre_stage5",
      userId,
      category: "DOMAIN_EVENT",
      type: "domain.daily_log.updated",
      aggregateId: "legacy_agg",
      aggregateType: "dailylog",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1,
      occurredAt: new Date("2025-01-01T00:00:00.000Z"),
      correlationId: "corr_legacy",
      source: "legacy",
      payload: { logId: "legacy_agg", userId, date: "2025-01-01", updatedAt: "2025-01-01T00:00:00.000Z" },
      deliveryStatus: "DELIVERED",
      deliverySeq: null,
      nextAttemptAt: new Date(0),
    });

    // 2. Commit a fresh Stage 5 DailyLog mutation
    await upsertDailyLogWithOutbox({
      userId,
      date: "2026-11-26",
      sections: { mental: { mood: 7, energy: 7 } },
      options: { clientMutationId: "mut_5_3_02", source: "test_5_3_02" },
    });

    const report = await runOutboxDispatchBatch(20, {
      userId,
      legacyCutoffAt: new Date("2026-11-26T00:00:00.000Z"),
      onEmitFrame: async (uid, frame) => {
        assert.equal(uid, userId);
        emittedFrames.push(frame);
      },
    });

    assert.ok(report.succeededCount >= 1, "Expected at least 1 event dispatched");
    assert.equal(emittedFrames.length, 1, "Expected exactly 1 new frame emitted (legacy skipped)");
    assert.equal(emittedFrames[0].deliverySeq, 1);

    const legacyAfter = await OutboxEventModel.findOne({ eventId: "evt_legacy_pre_stage5" }).lean();
    assert.equal(legacyAfter?.deliverySeq, null, "Legacy pre-Stage-5 event must not be sequenced");

    const journals = await UserDeliveryJournalModel.find({ userId }).sort({ deliverySeq: 1 }).lean();
    assert.equal(journals.length, 1);
    assert.equal(journals[0].status, "PUBLISHED");
    assert.equal(journals[0].deliverySeq, 1);

    // 3. Simulate partial-failure retry: journal COMMITTED exists at deliverySeq 2, but OutboxEvent.deliverySeq is still null
    const crashEventId = "evt_crash_recovery_5_3_02";
    await OutboxEventModel.create({
      eventId: crashEventId,
      userId,
      category: "DOMAIN_EVENT",
      type: "domain.daily_log.updated",
      aggregateId: "crash_agg",
      aggregateType: "dailylog",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 2002,
      occurredAt: new Date("2026-11-26T12:00:00.000Z"),
      correlationId: "corr_crash",
      source: "test_5_3_02",
      payload: { logId: "crash_agg", userId, date: "2026-11-26", updatedAt: new Date().toISOString() },
      deliveryStatus: "DELIVERED",
      deliverySeq: null,
      nextAttemptAt: new Date(),
    });
    await UserDeliverySequenceModel.updateOne({ userId }, { $set: { currentSequence: 2 } });
    await UserDeliveryJournalModel.create({
      userId,
      deliverySeq: 2,
      eventId: crashEventId,
      eventType: "domain.daily_log.updated",
      aggregateId: "crash_agg",
      aggregateType: "dailylog",
      occurredAt: new Date("2026-11-26T12:00:00.000Z"),
      invalidationTags: ["daily-log", "dashboard", "world"],
      status: "COMMITTED",
      leaseGeneration: 1,
    });

    const sequencer = new UserDeliverySequencer();
    const recoveryFrames: IWireDeliveryFrame[] = [];
    const seqResult = await sequencer.sequenceAndPublishUserBatch(userId, "recovery_worker", {
      minOccurredAt: new Date("2026-11-26T00:00:00.000Z"),
      onEmitFrame: async (frame) => {
        recoveryFrames.push(frame);
      },
    });

    assert.equal(seqResult.success, true);
    assert.equal(seqResult.recoveredCount, 1);
    assert.equal(seqResult.sequencedCount, 0, "Must not allocate a duplicate sequence");
    assert.equal(recoveryFrames.length, 1);
    assert.equal(recoveryFrames[0].deliverySeq, 2);

    const repairedOutbox = await OutboxEventModel.findOne({ eventId: crashEventId }).lean();
    assert.equal(repairedOutbox?.deliverySeq, 2, "OutboxEvent.deliverySeq must be repaired to 2");

    const allJournals = await UserDeliveryJournalModel.find({ userId }).sort({ deliverySeq: 1 }).lean();
    assert.equal(allJournals.length, 2);
    assert.equal(allJournals[1].status, "PUBLISHED");
  });

  it("5.3-03: D3 local-dev outbox fallback enforces all 6 guards and never runs in production/serverless", async () => {
    // Production guard
    assert.equal(
      shouldRunLocalOutboxFallback({
        NODE_ENV: "production",
        LIFEOS_LOCAL_OUTBOX_FALLBACK: "true",
      }),
      false
    );

    // Serverless guards
    assert.equal(
      shouldRunLocalOutboxFallback({
        NODE_ENV: "development",
        VERCEL: "1",
        LIFEOS_LOCAL_OUTBOX_FALLBACK: "true",
      }),
      false
    );
    assert.equal(
      shouldRunLocalOutboxFallback({
        NODE_ENV: "development",
        AWS_LAMBDA_FUNCTION_NAME: "fn",
        LIFEOS_LOCAL_OUTBOX_FALLBACK: "true",
      }),
      false
    );
    assert.equal(
      shouldRunLocalOutboxFallback({
        NODE_ENV: "development",
        K_SERVICE: "svc",
        LIFEOS_LOCAL_OUTBOX_FALLBACK: "true",
      }),
      false
    );

    // Opt-in flag guard
    assert.equal(
      shouldRunLocalOutboxFallback({
        NODE_ENV: "development",
      }),
      false
    );
    assert.equal(
      shouldRunLocalOutboxFallback({
        NODE_ENV: "development",
        LIFEOS_LOCAL_OUTBOX_FALLBACK: "false",
      }),
      false
    );

    // INNGEST_EVENT_KEY guard
    assert.equal(
      shouldRunLocalOutboxFallback({
        NODE_ENV: "development",
        LIFEOS_LOCAL_OUTBOX_FALLBACK: "true",
        INNGEST_EVENT_KEY: "real-key",
      }),
      false
    );

    // Valid local-dev opt-in
    assert.equal(
      shouldRunLocalOutboxFallback({
        NODE_ENV: "development",
        LIFEOS_LOCAL_OUTBOX_FALLBACK: "true",
      }),
      true
    );

    // Verify local-dev fallback drains cleanly when enabled without duplicating if run alongside batch
    const prevNodeEnv = process.env.NODE_ENV;
    const prevFallback = process.env.LIFEOS_LOCAL_OUTBOX_FALLBACK;
    const prevInngestKey = process.env.INNGEST_EVENT_KEY;
    (process.env as any).NODE_ENV = "development";
    process.env.LIFEOS_LOCAL_OUTBOX_FALLBACK = "true";
    delete process.env.INNGEST_EVENT_KEY;

    try {
      registerOutboxInngestHook();
      const userId = new mongoose.Types.ObjectId().toString();
      await upsertDailyLogWithOutbox({
        userId,
        date: "2026-11-26",
        sections: { mental: { energy: 9 } },
        options: { clientMutationId: "mut_5_3_03", source: "test_5_3_03" },
      });

      // Wait briefly for the non-blocking Promise.resolve().then(...) fallback
      await new Promise((r) => setTimeout(r, 400));
      // Also run a concurrent/subsequent batch to verify idempotency
      await runOutboxDispatchBatch(10, { userId });

      const journals = await UserDeliveryJournalModel.find({ userId }).lean();
      assert.equal(journals.length, 1, "Fallback + sweeper/batch must not duplicate journal entries");
      assert.equal(journals[0].status, "PUBLISHED");
    } finally {
      (process.env as any).NODE_ENV = prevNodeEnv;
      if (prevFallback !== undefined) {
        process.env.LIFEOS_LOCAL_OUTBOX_FALLBACK = prevFallback;
      } else {
        delete process.env.LIFEOS_LOCAL_OUTBOX_FALLBACK;
      }
      if (prevInngestKey !== undefined) {
        process.env.INNGEST_EVENT_KEY = prevInngestKey;
      }
      // Keep OutboxStorageService singleton clean
      assert.ok(OutboxStorageService.getInstance());
    }
  });
});
