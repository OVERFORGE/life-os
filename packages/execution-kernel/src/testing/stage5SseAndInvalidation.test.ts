import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { SSEConnectionManager } from "../../../../apps/web/server/services/SSEConnectionManager";
import { CANONICAL_DELIVERY_REGISTRY } from "../events/delivery/CanonicalDeliveryRegistry";
import { CanonicalTagToQueryMap } from "../../../../apps/web/lib/queryKeys";
import { createInvalidationCoalescer } from "../../../../apps/web/features/runtime/hooks/useReactiveInvalidation";
import { UserDeliveryJournalModel } from "../../../../apps/web/server/db/models/UserDeliveryJournalModel";
import { UserDeliverySequenceModel } from "../../../../apps/web/server/db/models/UserDeliverySequenceModel";
import { UserDeliverySequencer } from "../events/delivery/UserDeliverySequencer";
import { IWireDeliveryFrame } from "../events/contracts/DeliveryContracts";

function createMockController() {
  const chunks: string[] = [];
  let closed = false;
  const decoder = new TextDecoder();
  const controller = {
    enqueue(chunk: Uint8Array) {
      chunks.push(decoder.decode(chunk));
    },
    close() {
      closed = true;
    },
  } as unknown as ReadableStreamDefaultController;
  return {
    controller,
    chunks,
    isClosed: () => closed,
  };
}

function makeFrame(seq: number, tags: string[] = ["dashboard"]): IWireDeliveryFrame {
  return {
    eventId: `evt_${seq}`,
    eventType: "domain.daily_log.updated",
    aggregateId: `agg_${seq}`,
    aggregateType: "dailylog",
    deliverySeq: seq,
    seqConn: 0,
    occurredAt: Date.now(),
    invalidationTags: tags,
  };
}

describe("Stage 5 Increment 5.4: Live SSE Push, Cross-Process Journal Bridge & Invalidation", () => {
  before(async () => {
    await connectIsolatedTestDB({ dbName: "life-os-stage5-4-test" });
    await Promise.all([
      UserDeliveryJournalModel.syncIndexes(),
      UserDeliverySequenceModel.syncIndexes(),
    ]);
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    SSEConnectionManager.getInstance().reset();
    await Promise.all([
      UserDeliveryJournalModel.deleteMany({}),
      UserDeliverySequenceModel.deleteMany({}),
    ]);
  });

  it("5.4-01: SSEConnectionManager deduplicates deliverySeq <= highWaterSeq and verifyReplayInterval replays missed frames", async () => {
    const connManager = SSEConnectionManager.getInstance();
    const userId = new mongoose.Types.ObjectId().toString();
    const mock = createMockController();

    const reg = connManager.registerConnection(userId, "10.0.0.1", mock.controller);
    assert.equal(reg.allowed, true);
    const streamId = reg.streamId!;

    // Advance highWaterSeq to 2 (e.g., from replay)
    connManager.advanceStreamHighWaterSeq(userId, streamId, 2);

    // Duplicate seq 1 and 2 must be suppressed
    assert.equal(connManager.broadcastToUser(userId, makeFrame(1)), 0);
    assert.equal(connManager.broadcastToUser(userId, makeFrame(2)), 0);
    assert.equal(mock.chunks.length, 0);

    // Seq 3 must emit once, and a repeat of seq 3 must be suppressed
    assert.equal(connManager.broadcastToUser(userId, makeFrame(3)), 1);
    assert.equal(connManager.broadcastToUser(userId, makeFrame(3)), 0);
    assert.equal(mock.chunks.length, 1);
    assert.ok(mock.chunks[0].includes('"deliverySeq":3'));

    // Verify reconnect replay interval from Last-Event-ID = 1 returns [2, 3]
    await UserDeliverySequenceModel.create({ userId, currentSequence: 3 });
    await UserDeliveryJournalModel.insertMany([
      {
        userId,
        deliverySeq: 1,
        eventId: "evt_1",
        eventType: "domain.daily_log.updated",
        aggregateId: "a1",
        aggregateType: "dailylog",
        occurredAt: new Date(),
        invalidationTags: ["daily-log"],
        status: "PUBLISHED",
      },
      {
        userId,
        deliverySeq: 2,
        eventId: "evt_2",
        eventType: "domain.daily_log.updated",
        aggregateId: "a2",
        aggregateType: "dailylog",
        occurredAt: new Date(),
        invalidationTags: ["daily-log"],
        status: "PUBLISHED",
      },
      {
        userId,
        deliverySeq: 3,
        eventId: "evt_3",
        eventType: "domain.daily_log.updated",
        aggregateId: "a3",
        aggregateType: "dailylog",
        occurredAt: new Date(),
        invalidationTags: ["daily-log"],
        status: "PUBLISHED",
      },
    ]);

    const sequencer = new UserDeliverySequencer();
    const replay = await sequencer.verifyReplayInterval(userId, 1);
    assert.equal(replay.complete, true);
    assert.equal(replay.resyncRequired, false);
    assert.deepEqual(
      replay.records?.map((r: any) => r.deliverySeq),
      [2, 3]
    );
  });

  it("5.4-02: Preserves max-3 streams/user (429), 10/min IP rate limit (429), and 50-frame slow-consumer close", () => {
    const connManager = SSEConnectionManager.getInstance();
    const userId = "user_quota_test";

    // Max 3 streams per user
    for (let i = 0; i < 3; i++) {
      const m = createMockController();
      const res = connManager.registerConnection(userId, `10.0.1.${i + 1}`, m.controller);
      assert.equal(res.allowed, true);
    }
    const fourth = connManager.registerConnection(userId, "10.0.1.99", createMockController().controller);
    assert.equal(fourth.allowed, false);
    assert.equal(fourth.statusCode, 429);

    // 10/min IP rate limit
    const rateIp = "192.168.10.50";
    for (let i = 0; i < 10; i++) {
      const res = connManager.registerConnection(`user_rate_${i}`, rateIp, createMockController().controller);
      assert.equal(res.allowed, true);
    }
    const eleventh = connManager.registerConnection("user_rate_11", rateIp, createMockController().controller);
    assert.equal(eleventh.allowed, false);
    assert.equal(eleventh.statusCode, 429);

    // 50-frame slow consumer close
    const slowMock = createMockController();
    const slowReg = connManager.registerConnection("user_slow", "10.0.2.1", slowMock.controller);
    assert.equal(slowReg.allowed, true);
    for (let seq = 1; seq <= 50; seq++) {
      assert.equal(connManager.broadcastToUser("user_slow", makeFrame(seq)), 1);
    }
    // 51st frame triggers slow-consumer termination
    assert.equal(connManager.broadcastToUser("user_slow", makeFrame(51)), 0);
    assert.equal(slowMock.isClosed(), true);
    assert.equal(connManager.getUserStreamCount("user_slow"), 0);
  });

  it("5.4-03: Every CanonicalTag in CANONICAL_DELIVERY_REGISTRY resolves in CanonicalTagToQueryMap and coalescer respects scope & dispose", async () => {
    const registryTags = new Set<string>();
    for (const def of Object.values(CANONICAL_DELIVERY_REGISTRY)) {
      for (const tag of def.invalidationTags) {
        registryTags.add(tag);
      }
    }

    for (const tag of registryTags) {
      const mapped = (CanonicalTagToQueryMap as Record<string, readonly string[]>)[tag];
      assert.ok(Array.isArray(mapped) && mapped.length > 0, `Missing CanonicalTagToQueryMap entry for '${tag}'`);
    }

    // Coalescing, tag filtering, user scoping & dispose
    let callCount = 0;
    const coalescer = createInvalidationCoalescer({
      tags: ["nutrition", "daily-log"],
      userId: "user_A",
      debounceMs: 30,
      onInvalidate: () => {
        callCount++;
      },
    });

    // Different user must be ignored
    coalescer.handleInvalidateEvent({ tags: ["nutrition"], userId: "user_B", deliverySeq: 1 });
    // Unrelated tag must be ignored
    coalescer.handleInvalidateEvent({ tags: ["tasks"], userId: "user_A", deliverySeq: 2 });

    await new Promise((r) => setTimeout(r, 60));
    assert.equal(callCount, 0);

    // Burst of matching events within debounce window must coalesce into 1 call
    coalescer.handleInvalidateEvent({ tags: ["nutrition"], userId: "user_A", deliverySeq: 3 });
    coalescer.handleInvalidateEvent({ tags: ["daily-log"], userId: "user_A", deliverySeq: 4 });
    coalescer.handleInvalidateEvent({ tags: ["nutrition", "dashboard"], userId: "user_A", deliverySeq: 5 });

    await new Promise((r) => setTimeout(r, 80));
    assert.equal(callCount, 1, "Rapid burst must coalesce into a single refresh");

    // Dispose cancels pending timers
    coalescer.handleInvalidateEvent({ tags: ["nutrition"], userId: "user_A", deliverySeq: 6 });
    coalescer.dispose();
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(callCount, 1, "Disposed coalescer must not fire after unmount");
  });
});
