import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AutonomousActionReverser } from "../../autonomy/AutonomousActionReverser";

describe("Step 3 Loop 6: Ambient Reversal Toast & 24h Autonomous Compensation Gateway", () => {
  const reverser = AutonomousActionReverser.getInstance();

  const mockKernelService: any = {
    executeAction: async () => ({ success: true }),
  };

  it("must accept reversal within the 24-hour retention window", async () => {
    const userId = "u_reversal_1";
    const now = Date.now();

    const record = await reverser.recordAutonomousExecution(
      userId,
      "urn:lifeos:capability:calendar:reschedule",
      { occurrenceId: "occ_123" },
      "Optimization of schedule conflict",
      {
        capabilityURN: "urn:lifeos:capability:calendar:reschedule",
        parameters: { occurrenceId: "occ_123", revert: true },
        expectedReversionEffect: "revert_reschedule",
      },
      "rule_schedule_opt",
      0.95
    );

    // Reversal requested 1 hour later (well within 24h)
    const result = await reverser.executeCompensation(
      userId,
      record.executionId,
      mockKernelService,
      now + 3600 * 1000
    );

    assert.equal(result.success, true);
    assert.equal(result.lifecycleState, "CONFIRMED_EXTERNAL_COMMIT");
  });

  it("must reject reversal when 24-hour retention window has expired", async () => {
    const userId = "u_reversal_2";
    const executedAt = Date.now() - 25 * 3600 * 1000; // 25 hours ago

    const record = await reverser.recordAutonomousExecution(
      userId,
      "urn:lifeos:capability:tasks:archive",
      { taskId: "task_old" },
      "Cleanup of completed tasks",
      {
        capabilityURN: "urn:lifeos:capability:tasks:unarchive",
        parameters: { taskId: "task_old" },
        expectedReversionEffect: "unarchive_task",
      },
      "rule_task_cleanup",
      0.90
    );
    // Artificially age record executedAt
    (record as any).executedAt = executedAt;

    const result = await reverser.executeCompensation(
      userId,
      record.executionId,
      mockKernelService,
      Date.now()
    );

    assert.equal(result.success, false);
    assert.equal(result.lifecycleState, "EXTERNAL_REJECTED");
    assert.match(result.error!, /Retention window \(24h\) expired/);
  });

  it("must prevent duplicate reversal (idempotency)", async () => {
    const userId = "u_reversal_3";

    const record = await reverser.recordAutonomousExecution(
      userId,
      "urn:lifeos:capability:tasks:defer",
      { taskId: "task_defer" },
      "Load balancing deferral",
      {
        capabilityURN: "urn:lifeos:capability:tasks:undefer",
        parameters: { taskId: "task_defer" },
        expectedReversionEffect: "undefer_task",
      },
      "rule_load_balance",
      0.92
    );

    // First undo succeeds
    const res1 = await reverser.executeCompensation(
      userId,
      record.executionId,
      mockKernelService
    );
    assert.equal(res1.success, true);

    // Second undo fails idempotently
    const res2 = await reverser.executeCompensation(
      userId,
      record.executionId,
      mockKernelService
    );
    assert.equal(res2.success, false);
    assert.match(res2.error!, /already been compensated/);
  });

  it("must reject cross-tenant reversal attempts", async () => {
    const userOwner = "u_owner";
    const userAttacker = "u_attacker";

    const record = await reverser.recordAutonomousExecution(
      userOwner,
      "urn:lifeos:capability:workout:log",
      { sessionId: "sess_1" },
      "Wearable auto-log",
      {
        capabilityURN: "urn:lifeos:capability:workout:delete",
        parameters: { sessionId: "sess_1" },
        expectedReversionEffect: "delete_workout",
      },
      "rule_auto_workout",
      0.99
    );

    const result = await reverser.executeCompensation(
      userAttacker,
      record.executionId,
      mockKernelService
    );

    assert.equal(result.success, false);
    assert.match(result.error!, /not found for user/);
  });
});
