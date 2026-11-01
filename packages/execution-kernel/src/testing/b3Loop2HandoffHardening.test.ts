/**
 * b3Loop2HandoffHardening.test.ts
 * 
 * Milestone B — Phase B3: Work Package 1 / Loop 2
 * Sequence Boundary Enforcement, WMSCP Tri-State Guard & Mock Normalization
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCausalSequence,
  formatCanonicalEventId,
} from "../events/contracts/CanonicalEventContracts";
import { WorldModelBridge } from "../worldv2/WorldModelBridge";

class MockOutboxCollection {
  private docs: any[] = [];

  constructor(initialDocs: any[] = []) {
    this.docs = initialDocs;
  }

  async countDocuments(query: Record<string, any>): Promise<number> {
    const statuses = query?.deliveryStatus?.$in || [];
    return this.docs.filter((d) => d.userId === query.userId && statuses.includes(d.deliveryStatus)).length;
  }
}

describe("B3 WP1 Loop 2: Sequence Boundary & WMSCP Guard", () => {
  it("B3-LOOP2-01: calculateCausalSequence asserts strict boundary [0, 999] on eventOrdinal", () => {
    // Valid cases
    assert.equal(calculateCausalSequence(0, 0), 0);
    assert.equal(calculateCausalSequence(1, 1), 1001);
    assert.equal(calculateCausalSequence(5, 42), 5042);
    assert.equal(calculateCausalSequence(10, 999), 10999);

    // Negative eventOrdinal
    assert.throws(
      () => calculateCausalSequence(1, -1),
      /eventOrdinal must be an integer in range \[0, 999\]/
    );

    // eventOrdinal >= 1000
    assert.throws(
      () => calculateCausalSequence(1, 1000),
      /eventOrdinal must be an integer in range \[0, 999\]/
    );
    assert.throws(
      () => calculateCausalSequence(1, 1500),
      /eventOrdinal must be an integer in range \[0, 999\]/
    );

    // Non-integer eventOrdinal
    assert.throws(
      () => calculateCausalSequence(1, 1.5),
      /eventOrdinal must be an integer in range \[0, 999\]/
    );

    // Negative aggregateVersion
    assert.throws(
      () => calculateCausalSequence(-1, 0),
      /aggregateVersion must be a non-negative integer/
    );

    // Non-integer aggregateVersion
    assert.throws(
      () => calculateCausalSequence(2.5, 0),
      /aggregateVersion must be a non-negative integer/
    );
  });

  it("B3-LOOP2-02: WorldModelBridge getInFlightStatus returns PERSISTENCE_UNAVAILABLE when disconnected in < 5ms", async () => {
    const bridge = new WorldModelBridge();
    // Default model without connection
    const start = process.hrtime.bigint();
    const status = await bridge.getInFlightStatus("user_offline_test");
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    assert.equal(status, "PERSISTENCE_UNAVAILABLE");
    assert(durationMs < 5.0, `Disconnection check must execute in < 5ms, took ${durationMs}ms`);
  });

  it("B3-LOOP2-03: WorldModelBridge getInFlightStatus accurately classifies ACTIVE_PROPAGATION vs SETTLED with active outbox", async () => {
    const mockOutbox = new MockOutboxCollection([
      { userId: "usr_active", deliveryStatus: "PENDING" },
      { userId: "usr_settled", deliveryStatus: "DELIVERED" },
    ]);

    const bridge = new WorldModelBridge(undefined, mockOutbox);

    const activeStatus = await bridge.getInFlightStatus("usr_active");
    assert.equal(activeStatus, "ACTIVE_PROPAGATION");

    const settledStatus = await bridge.getInFlightStatus("usr_settled");
    assert.equal(settledStatus, "SETTLED");
  });
});

