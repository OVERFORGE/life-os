import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SurfacePresenceManager } from "../surface/SurfacePresenceManager";

class MockMemoryCollection<T extends Record<string, any>> {
  public docs: Map<string, T> = new Map();

  find(query: Record<string, any> = {}): any {
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
      then: (resolve: any, reject: any) => Promise.resolve(results).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(results).catch(reject),
    };
    return queryObj;
  }

  findOne(query: Record<string, any>): any {
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) {
        const cloned = JSON.parse(JSON.stringify(doc));
        return {
          ...cloned,
          lean: () => Promise.resolve(cloned),
          then: (res: any, rej: any) => Promise.resolve(cloned).then(res, rej),
        };
      }
    }
    return null;
  }

  async create(docs: any | any[], _opts?: any): Promise<any[]> {
    const arr = Array.isArray(docs) ? docs : [docs];
    const created = arr.map((item) => {
      const id = String(item._id || item.eventId || `${item.userId}_${item.surfaceId}` || `id_${Date.now()}`);
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

  private matchesQuery(doc: any, query: Record<string, any>): boolean {
    for (const [k, v] of Object.entries(query)) {
      if (k === "_id" || k === "userId" || k === "surfaceId" || k === "deliveryStatus") {
        if (String(doc[k]) !== String(v)) return false;
        continue;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (v.$gt !== undefined && !(doc[k] > v.$gt)) return false;
        if (v.$gte !== undefined && !(doc[k] >= v.$gte)) return false;
        if (v.$lt !== undefined && !(doc[k] < v.$lt)) return false;
        if (v.$lte !== undefined && !(doc[k] <= v.$lte)) return false;
        continue;
      }
      if (doc[k] !== v) return false;
    }
    return true;
  }

  private applyUpdate(doc: any, update: Record<string, any>): void {
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$push) {
      for (const [k, val] of Object.entries(update.$push)) {
        if (!doc[k]) doc[k] = [];
        doc[k].push(val);
      }
    }
    if (update.$pull) {
      for (const [k, condition] of Object.entries(update.$pull)) {
        if (Array.isArray(doc[k])) {
          doc[k] = doc[k].filter((item: any) => {
            const cond = condition as any;
            if (cond.causalSequence && cond.causalSequence.$lte !== undefined) {
              return !(item.causalSequence <= cond.causalSequence.$lte);
            }
            return true;
          });
        }
      }
    }
  }
}

describe("Milestone B4 — Loop 7: Reactive Multi-Surface Stream & Monotonic Replay", () => {
  let mockReceiptColl: MockMemoryCollection<any>;
  let mockOutboxColl: MockMemoryCollection<any>;
  let presenceManager: SurfacePresenceManager;
  const testUserId = "usr_b4_stream_test";
  const testSurfaceId = "web_client_primary";

  beforeEach(() => {
    mockReceiptColl = new MockMemoryCollection();
    mockOutboxColl = new MockMemoryCollection();
    presenceManager = new SurfacePresenceManager({
      receiptModel: mockReceiptColl,
      outboxModel: mockOutboxColl,
    });
  });

  it("B4-L7-01: SurfaceDeliveryReceipt initializes with cursor 0 and records dispatches", async () => {
    const receipt = await presenceManager.getOrCreateReceipt(testUserId, testSurfaceId);
    assert.equal(receipt.lastAcknowledgedSeq, 0);
    assert.equal(receipt.unacknowledgedEvents.length, 0);

    // Record dispatch of event 1001
    await presenceManager.recordDispatch(testUserId, testSurfaceId, {
      eventId: "evt_1001",
      causalSequence: 1001,
      type: "domain.task.created",
    });

    const updated = await mockReceiptColl.findOne({ userId: testUserId, surfaceId: testSurfaceId });
    assert.equal(updated.unacknowledgedEvents.length, 1);
    assert.equal(updated.unacknowledgedEvents[0].causalSequence, 1001);
  });

  it("B4-L7-02: Acknowledge advances monotonic cursor and trims unacknowledged buffer", async () => {
    await presenceManager.recordDispatch(testUserId, testSurfaceId, {
      eventId: "evt_1001",
      causalSequence: 1001,
      type: "domain.task.created",
    });
    await presenceManager.recordDispatch(testUserId, testSurfaceId, {
      eventId: "evt_2001",
      causalSequence: 2001,
      type: "domain.task.updated",
    });

    const ackResult = await presenceManager.acknowledge(testUserId, testSurfaceId, 1001);
    assert.equal(ackResult.previousSeq, 0);
    assert.equal(ackResult.newSeq, 1001);

    const doc = await mockReceiptColl.findOne({ userId: testUserId, surfaceId: testSurfaceId });
    assert.equal(doc.lastAcknowledgedSeq, 1001);
    assert.equal(doc.unacknowledgedEvents.length, 1);
    assert.equal(doc.unacknowledgedEvents[0].causalSequence, 2001);
  });

  it("B4-L7-03: Monotonicity invariant: acknowledge cannot regress cursor with stale sequence", async () => {
    await presenceManager.acknowledge(testUserId, testSurfaceId, 5000);

    // Stale acknowledgment arriving out of order
    const staleAck = await presenceManager.acknowledge(testUserId, testSurfaceId, 3000);
    assert.equal(staleAck.previousSeq, 5000);
    assert.equal(staleAck.newSeq, 5000); // Unchanged!

    const doc = await mockReceiptColl.findOne({ userId: testUserId, surfaceId: testSurfaceId });
    assert.equal(doc.lastAcknowledgedSeq, 5000);
  });

  it("B4-L7-04: Reconnection replay queries committed events since lastAcknowledgedSeq in strictly ascending order", async () => {
    // Seed outbox events
    await mockOutboxColl.create([
      { userId: testUserId, eventId: "e1", causalSequence: 1001, type: "domain.task.created", deliveryStatus: "COMMITTED" },
      { userId: testUserId, eventId: "e2", causalSequence: 2001, type: "domain.task.updated", deliveryStatus: "COMMITTED" },
      { userId: testUserId, eventId: "e3", causalSequence: 3001, type: "domain.task.completed", deliveryStatus: "COMMITTED" },
    ]);

    // Surface acknowledged up to 1001
    await presenceManager.acknowledge(testUserId, testSurfaceId, 1001);

    // Replay on reconnect
    const replayEvents = await presenceManager.getReplayEvents(testUserId, testSurfaceId);
    assert.equal(replayEvents.length, 2);
    assert.equal(replayEvents[0].causalSequence, 2001);
    assert.equal(replayEvents[1].causalSequence, 3001);
  });

  it("B4-L7-05: Reconnection replay with explicit sinceSeq query parameter", async () => {
    await mockOutboxColl.create([
      { userId: testUserId, eventId: "e10", causalSequence: 1001, type: "domain.task.created", deliveryStatus: "COMMITTED" },
      { userId: testUserId, eventId: "e20", causalSequence: 2001, type: "domain.task.updated", deliveryStatus: "COMMITTED" },
      { userId: testUserId, eventId: "e30", causalSequence: 3001, type: "domain.task.completed", deliveryStatus: "COMMITTED" },
    ]);

    // Explicit request from client with sinceSeq = 2001
    const replayEvents = await presenceManager.getReplayEvents(testUserId, testSurfaceId, 2001);
    assert.equal(replayEvents.length, 1);
    assert.equal(replayEvents[0].causalSequence, 3001);
  });

  it("B4-L7-06: SSE message formatting complies with standard SSE specification", () => {
    const event = {
      causalSequence: 2001,
      type: "domain.task.updated",
      payload: { taskId: "task_1", title: "New Title" },
    };

    const sseFormatted = presenceManager.formatSSEMessage(event);
    assert.ok(sseFormatted.includes("id: 2001\n"));
    assert.ok(sseFormatted.includes("event: domain.task.updated\n"));
    assert.ok(sseFormatted.includes(`data: ${JSON.stringify(event)}\n\n`));
  });
});

