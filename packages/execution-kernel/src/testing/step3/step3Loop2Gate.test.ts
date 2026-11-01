import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PublicationEligibilityGate } from "../../events/delivery/PublicationEligibilityGate";

describe("Step 3 Loop 2: Publication Eligibility Gate & Consumer Ledger Interceptor", () => {
  const mockLedgers: any[] = [];

  const mockLedgerModel = {
    find: (filter: { userId: string; eventId: string }) => {
      const results = mockLedgers.filter(
        (l) => l.userId === filter.userId && l.eventId === filter.eventId
      );
      return {
        lean: async () => results,
      };
    },
  };

  const gate = new PublicationEligibilityGate({ ledgerModel: mockLedgerModel });

  it("must reject events missing eventId or userId", async () => {
    const res1 = await gate.evaluateEligibility({ type: "domain.task.completed" });
    assert.equal(res1.eligible, false);
    assert.match(res1.reason!, /missing required eventId or userId/);
  });

  it("must reject unregistered canonical events with zero fallback", async () => {
    const res = await gate.evaluateEligibility({
      eventId: "evt_1",
      userId: "user_1",
      type: "unregistered.custom.event",
      deliveryStatus: "DELIVERED",
    });
    assert.equal(res.eligible, false);
    assert.match(res.reason!, /Unregistered canonical event type/);
  });

  it("must reject events whose outbox deliveryStatus is not DELIVERED", async () => {
    const nonDeliveredStatuses = ["PENDING", "PROCESSING", "FAILED", "DEAD_LETTER", "ABORTED"];
    for (const status of nonDeliveredStatuses) {
      const res = await gate.evaluateEligibility({
        eventId: "evt_2",
        userId: "user_1",
        type: "domain.task.created",
        deliveryStatus: status,
      });
      assert.equal(res.eligible, false, `Status ${status} must be rejected`);
      assert.match(res.reason!, /expected strictly 'DELIVERED'/);
    }
  });

  it("must approve events with 0 required consumers when outbox is DELIVERED", async () => {
    const res = await gate.evaluateEligibility({
      eventId: "evt_audit_1",
      userId: "user_1",
      type: "autonomous.cycle_evaluated",
      deliveryStatus: "DELIVERED",
    });
    assert.equal(res.eligible, true, "Auditing event with 0 consumers must be immediately eligible");
  });

  it("must reject events when required consumer ledgers are missing (incomplete set)", async () => {
    // domain.task.created requires ["ExecutionGraphConsumer", "BehavioralIntelligenceConsumer"]
    mockLedgers.length = 0;
    mockLedgers.push({
      userId: "user_1",
      eventId: "evt_task_1",
      consumerName: "ExecutionGraphConsumer",
      status: "SUCCEEDED",
    });
    // Missing BehavioralIntelligenceConsumer!

    const res = await gate.evaluateEligibility({
      eventId: "evt_task_1",
      userId: "user_1",
      type: "domain.task.created",
      deliveryStatus: "DELIVERED",
    });

    assert.equal(res.eligible, false);
    assert.ok(res.missingConsumers?.includes("BehavioralIntelligenceConsumer"));
    assert.match(res.reason!, /BehavioralIntelligenceConsumer/);
  });

  it("must reject events when a required consumer failed terminally or retryably", async () => {
    mockLedgers.length = 0;
    mockLedgers.push(
      {
        userId: "user_1",
        eventId: "evt_task_2",
        consumerName: "ExecutionGraphConsumer",
        status: "SUCCEEDED",
      },
      {
        userId: "user_1",
        eventId: "evt_task_2",
        consumerName: "BehavioralIntelligenceConsumer",
        status: "FAILED_TERMINAL",
        errorDetails: "Database lock conflict",
      }
    );

    const res = await gate.evaluateEligibility({
      eventId: "evt_task_2",
      userId: "user_1",
      type: "domain.task.created",
      deliveryStatus: "DELIVERED",
    });

    assert.equal(res.eligible, false);
    assert.equal(res.failedConsumers?.length, 1);
    assert.equal(res.failedConsumers![0].consumerName, "BehavioralIntelligenceConsumer");
    assert.match(res.reason!, /failed convergence/);
  });

  it("must approve events when all required consumers have SUCCEEDED or SKIPPED_STALE", async () => {
    mockLedgers.length = 0;
    mockLedgers.push(
      {
        userId: "user_1",
        eventId: "evt_task_3",
        consumerName: "ExecutionGraphConsumer",
        status: "SUCCEEDED",
      },
      {
        userId: "user_1",
        eventId: "evt_task_3",
        consumerName: "BehavioralIntelligenceConsumer",
        status: "SKIPPED_STALE",
      }
    );

    const res = await gate.evaluateEligibility({
      eventId: "evt_task_3",
      userId: "user_1",
      type: "domain.task.created",
      deliveryStatus: "DELIVERED",
    });

    assert.equal(res.eligible, true);
    assert.equal(res.reason, undefined);
  });

  it("must be strictly idempotent across repeated evaluations", async () => {
    const event = {
      eventId: "evt_task_3",
      userId: "user_1",
      type: "domain.task.created",
      deliveryStatus: "DELIVERED",
    };

    const res1 = await gate.evaluateEligibility(event);
    const res2 = await gate.evaluateEligibility(event);

    assert.deepEqual(res1, res2, "Repeated evaluations must return identical results");
  });
});

