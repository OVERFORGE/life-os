/**
 * loop6WorldModelConvergence.test.ts
 * 
 * Step 2 Loop 6 Test Battery:
 * - Ledger-Verified Read-Your-Writes Convergence Barrier
 * - Zero false positive convergence on dead-lettered or terminal-failed events
 * - Timeout handling without false success
 * - Cache eviction upon convergence
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WorldModelBridge } from "../../worldv2/WorldModelBridge";

describe("Step 2 — Loop 6: Personal World Model Convergence Barrier & Cache Fencing", () => {
  it("Scenario 1: awaitConvergence succeeds when target event is DELIVERED and evicts cached projection", async () => {
    let outboxDoc = {
      _id: "evt_target_1",
      userId: "user_1",
      deliveryStatus: "DELIVERED",
    };

    const mockOutboxModel = {
      findOne: async (query: any) => {
        if (query.userId === "user_1") return outboxDoc;
        return null;
      },
    };

    const bridge = new WorldModelBridge(undefined as any, mockOutboxModel);

    // Seed cache
    (bridge as any).cache.set("user_1", {
      projection: { userId: "user_1", stale: true },
      cachedAt: Date.now(),
      expiresAt: Date.now() + 60000,
    });

    const res = await bridge.awaitConvergence("user_1", {
      targetEventId: "evt_target_1",
      timeoutMs: 500,
      pollIntervalMs: 20,
    });

    assert.equal(res.converged, true);
    assert.equal(res.status, "CONVERGED");
    assert.equal((bridge as any).cache.has("user_1"), false, "Cache must be evicted upon convergence");
  });

  it("Scenario 2: awaitConvergence returns CONVERGENCE_FAILED when target event reaches DEAD_LETTER (no false success)", async () => {
    const outboxDoc = {
      _id: "evt_dead",
      userId: "user_1",
      deliveryStatus: "DEAD_LETTER",
      failureReason: "Max retries exceeded on GoalIntelligenceConsumer",
    };

    const mockOutboxModel = {
      findOne: async () => outboxDoc,
    };

    const bridge = new WorldModelBridge(undefined as any, mockOutboxModel);

    const res = await bridge.awaitConvergence("user_1", {
      targetEventId: "evt_dead",
      timeoutMs: 500,
      pollIntervalMs: 20,
    });

    assert.equal(res.converged, false, "Must NOT report false positive convergence");
    assert.equal(res.status, "CONVERGENCE_FAILED");
    assert.match(res.failureReason || "", /dead-lettered|Max retries/);
  });

  it("Scenario 3: awaitConvergence returns CONVERGENCE_FAILED when a consumer ledger record is FAILED_TERMINAL", async () => {
    const outboxDoc = {
      _id: "evt_term",
      userId: "user_1",
      deliveryStatus: "PROCESSING",
    };

    const mockOutboxModel = {
      findOne: async () => outboxDoc,
    };

    const mockLedgerModel = {
      find: async () => [
        {
          userId: "user_1",
          eventId: "evt_term",
          consumerName: "GoalIntelligenceConsumer",
          status: "FAILED_TERMINAL",
          errorDetails: "Corrupted goal state",
        },
      ],
    };

    const bridge = new WorldModelBridge(undefined as any, mockOutboxModel, mockLedgerModel);

    const res = await bridge.awaitConvergence("user_1", {
      targetEventId: "evt_term",
      timeoutMs: 500,
      pollIntervalMs: 20,
    });

    assert.equal(res.converged, false);
    assert.equal(res.status, "CONVERGENCE_FAILED");
    assert.match(res.failureReason || "", /Corrupted goal state|terminal failure/);
  });

  it("Scenario 4: awaitConvergence returns TIMEOUT when target event remains pending past timeout", async () => {
    const outboxDoc = {
      _id: "evt_stuck",
      userId: "user_1",
      deliveryStatus: "PENDING",
    };

    const mockOutboxModel = {
      findOne: async () => outboxDoc,
    };

    const bridge = new WorldModelBridge(undefined as any, mockOutboxModel);

    const res = await bridge.awaitConvergence("user_1", {
      targetEventId: "evt_stuck",
      timeoutMs: 100, // Short timeout
      pollIntervalMs: 20,
    });

    assert.equal(res.converged, false);
    assert.equal(res.status, "TIMEOUT");
  });
});
