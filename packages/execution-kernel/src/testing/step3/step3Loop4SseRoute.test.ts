import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SSEConnectionManager } from "../../../../../apps/web/server/services/SSEConnectionManager";

describe("Step 3 Loop 4: Standalone SSE Server & Transport Governance", () => {
  let connManager: SSEConnectionManager;

  beforeEach(() => {
    connManager = SSEConnectionManager.getInstance();
    connManager.reset();
  });

  it("must enforce max 3 active streams per user", () => {
    const mockController: any = {
      enqueue: () => {},
      close: () => {},
    };

    const res1 = connManager.registerConnection("user_1", "127.0.0.1", mockController);
    assert.equal(res1.allowed, true);
    assert.ok(res1.streamId);

    const res2 = connManager.registerConnection("user_1", "127.0.0.1", mockController);
    assert.equal(res2.allowed, true);

    const res3 = connManager.registerConnection("user_1", "127.0.0.1", mockController);
    assert.equal(res3.allowed, true);

    // 4th stream for the same user must be rejected with 429
    const res4 = connManager.registerConnection("user_1", "127.0.0.1", mockController);
    assert.equal(res4.allowed, false);
    assert.equal(res4.statusCode, 429);
    assert.match(res4.reason!, /USER_STREAM_QUOTA_EXCEEDED/);

    // Another user can still register
    const resUser2 = connManager.registerConnection("user_2", "127.0.0.2", mockController);
    assert.equal(resUser2.allowed, true);
  });

  it("must enforce IP reconnection rate limit (10 per minute)", () => {
    const mockController: any = { enqueue: () => {}, close: () => {} };
    const ip = "192.168.1.100";

    for (let i = 0; i < 10; i++) {
      assert.equal(connManager.checkRateLimit(ip), true, `Attempt ${i + 1} should be allowed`);
    }

    // 11th attempt within the minute must be blocked
    assert.equal(connManager.checkRateLimit(ip), false, "11th attempt must be rate-limited");
  });

  it("must broadcast invalidation frames to all active streams for a user", () => {
    const enqueued1: any[] = [];
    const enqueued2: any[] = [];

    const ctrl1: any = { enqueue: (chunk: any) => enqueued1.push(chunk), close: () => {} };
    const ctrl2: any = { enqueue: (chunk: any) => enqueued2.push(chunk), close: () => {} };

    connManager.registerConnection("u_broadcast", "10.0.0.1", ctrl1);
    connManager.registerConnection("u_broadcast", "10.0.0.2", ctrl2);

    const frame: any = {
      eventId: "evt_task_1",
      eventType: "domain.task.completed",
      aggregateId: "task_123",
      aggregateType: "task",
      deliverySeq: 105,
      seqConn: 1,
      occurredAt: Date.now(),
      invalidationTags: ["tasks", "dashboard"],
    };

    const sent = connManager.broadcastToUser("u_broadcast", frame);
    assert.equal(sent, 2, "Must send to both active user connections");

    assert.equal(enqueued1.length, 1);
    assert.equal(enqueued2.length, 1);

    const text1 = new TextDecoder().decode(enqueued1[0]);
    assert.match(text1, /id: 105/);
    assert.match(text1, /"tags":\["tasks","dashboard"\]/);
  });

  it("must terminate slow consumers exceeding buffer watermark (50 frames)", () => {
    let wasClosed = false;
    const ctrl: any = {
      enqueue: () => {},
      close: () => {
        wasClosed = true;
      },
    };

    const reg = connManager.registerConnection("u_slow", "10.0.0.5", ctrl);
    assert.equal(reg.allowed, true);

    const frame: any = {
      eventId: "e",
      eventType: "domain.task.created",
      aggregateId: "a",
      aggregateType: "task",
      deliverySeq: 1,
      invalidationTags: ["tasks"],
    };

    // Send 50 frames to trigger slow consumer threshold
    for (let i = 0; i < 50; i++) {
      connManager.broadcastToUser("u_slow", frame);
    }

    assert.equal(wasClosed, false);

    // 51st frame must detect unacknowledged threshold and close slow socket
    connManager.broadcastToUser("u_slow", frame);
    assert.equal(wasClosed, true, "Slow consumer socket must be closed");
    assert.equal(connManager.getUserStreamCount("u_slow"), 0);
  });

  it("must generate 1024-byte comment flush padding", () => {
    const padding = connManager.getInitialFlushPadding();
    assert.ok(padding.startsWith(": LifeOS SSE Stream Connected"));
    assert.ok(padding.endsWith("\n\n"));
    assert.equal(padding.length >= 1024, true, "Padding must be at least 1024 bytes");
  });
});

