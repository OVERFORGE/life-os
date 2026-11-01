import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatCanonicalEventId,
  calculateCausalSequence,
  ICanonicalEventEnvelope,
} from "../events/contracts/CanonicalEventContracts";
import {
  validateCanonicalEnvelope,
  safeValidateCanonicalEnvelope,
  CanonicalPayloadSchemaMap,
} from "../events/schemas/CanonicalEventSchemas";

describe("Milestone B4 — Loop 1: Universal Causal Outbox Schemas", () => {
  it("B4-L1-01: Correctly validates Option B event IDs and causal sequences for all aggregate types", () => {
    const taskId = "task_901";
    const eventId = formatCanonicalEventId("task", taskId, 2, 1, "task_updated");
    assert.equal(eventId, "evt_task_task_901_v2_1_task_updated");

    const seq = calculateCausalSequence(2, 1);
    assert.equal(seq, 2001);

    const autoEventId = formatCanonicalEventId("autonomous_cycle", "cycle_101", 1, 0, "cycle_evaluated");
    assert.equal(autoEventId, "evt_autonomous_cycle_cycle_101_v1_0_cycle_evaluated");
  });

  it("B4-L1-02: Validates Task lifecycle events (created, updated, deleted)", () => {
    // 1. Task Updated
    const updatedEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_task_t1_v2_1_task_updated",
      userId: "user_123",
      category: "DOMAIN_EVENT",
      type: "domain.task.updated",
      aggregateId: "t1",
      aggregateType: "task",
      aggregateVersion: 2,
      eventOrdinal: 1,
      causalSequence: 2001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_1",
      source: "TaskEngine",
      payload: {
        taskId: "t1",
        userId: "user_123",
        changes: { title: "New Title", priority: "high" },
        updatedAt: new Date().toISOString(),
        title: "New Title",
        priority: "high",
      },
    };
    const validUpdated = safeValidateCanonicalEnvelope(updatedEnvelope);
    assert.equal(validUpdated.success, true);

    // 2. Task Deleted
    const deletedEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_task_t1_v3_1_task_deleted",
      userId: "user_123",
      category: "DOMAIN_EVENT",
      type: "domain.task.deleted",
      aggregateId: "t1",
      aggregateType: "task",
      aggregateVersion: 3,
      eventOrdinal: 1,
      causalSequence: 3001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_2",
      source: "TaskEngine",
      payload: {
        taskId: "t1",
        userId: "user_123",
        deletedAt: new Date().toISOString(),
      },
    };
    const validDeleted = safeValidateCanonicalEnvelope(deletedEnvelope);
    assert.equal(validDeleted.success, true);
  });

  it("B4-L1-03: Validates Goal lifecycle events (created, updated, deleted)", () => {
    // 1. Goal Updated
    const goalUpdatedEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_goal_g1_v2_1_goal_updated",
      userId: "user_123",
      category: "DOMAIN_EVENT",
      type: "domain.goal.updated",
      aggregateId: "g1",
      aggregateType: "goal",
      aggregateVersion: 2,
      eventOrdinal: 1,
      causalSequence: 2001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_g1",
      source: "GoalEngine",
      payload: {
        goalId: "g1",
        userId: "user_123",
        changes: { status: "paused" },
        updatedAt: new Date().toISOString(),
      },
    };
    assert.equal(safeValidateCanonicalEnvelope(goalUpdatedEnvelope).success, true);

    // 2. Goal Deleted
    const goalDeletedEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_goal_g1_v3_1_goal_deleted",
      userId: "user_123",
      category: "DOMAIN_EVENT",
      type: "domain.goal.deleted",
      aggregateId: "g1",
      aggregateType: "goal",
      aggregateVersion: 3,
      eventOrdinal: 1,
      causalSequence: 3001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_g2",
      source: "GoalEngine",
      payload: {
        goalId: "g1",
        userId: "user_123",
        deletedAt: new Date().toISOString(),
      },
    };
    assert.equal(safeValidateCanonicalEnvelope(goalDeletedEnvelope).success, true);
  });

  it("B4-L1-04: Validates Autonomous engine lifecycle events", () => {
    // 1. Cycle Evaluated
    const cycleEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_autonomous_cycle_c1_v1_1_cycle_evaluated",
      userId: "user_123",
      category: "SYSTEM_EVENT",
      type: "autonomous.cycle_evaluated",
      aggregateId: "c1",
      aggregateType: "autonomous_cycle",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_auto_1",
      source: "AutonomousExecutionDaemon",
      payload: {
        cycleId: "c1",
        userId: "user_123",
        durationMs: 42,
        evaluationsCount: 5,
        actionsTriggered: 1,
        timestamp: Date.now(),
      },
    };
    assert.equal(safeValidateCanonicalEnvelope(cycleEnvelope).success, true);

    // 2. Intervention Triggered
    const interventionEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_autonomous_intervention_int1_v1_1_intervention_triggered",
      userId: "user_123",
      category: "SYSTEM_EVENT",
      type: "autonomous.intervention_triggered",
      aggregateId: "int1",
      aggregateType: "autonomous_intervention",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_auto_2",
      source: "AutonomousExecutionDaemon",
      payload: {
        interventionId: "int1",
        userId: "user_123",
        actionType: "schedule_rebalance",
        priority: "HIGH",
        requiresHITL: true,
        timestamp: Date.now(),
      },
    };
    assert.equal(safeValidateCanonicalEnvelope(interventionEnvelope).success, true);

    // 3. Action Executed
    const actionEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_autonomous_action_act1_v1_1_action_executed",
      userId: "user_123",
      category: "SYSTEM_EVENT",
      type: "autonomous.action_executed",
      aggregateId: "act1",
      aggregateType: "autonomous_action",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_auto_3",
      source: "AutonomousWorkflowExecutor",
      payload: {
        actionId: "act1",
        userId: "user_123",
        actionType: "reschedule_occurrence",
        success: true,
        verificationPassed: true,
        timestamp: Date.now(),
      },
    };
    assert.equal(safeValidateCanonicalEnvelope(actionEnvelope).success, true);
  });

  it("B4-L1-05: Rejects invalid payloads or corrupted schemas strictly", () => {
    // Missing required durationMs in cycle evaluated
    const invalidCycle: ICanonicalEventEnvelope = {
      eventId: "evt_autonomous_cycle_c1_v1_1_cycle_evaluated",
      userId: "user_123",
      category: "SYSTEM_EVENT",
      type: "autonomous.cycle_evaluated",
      aggregateId: "c1",
      aggregateType: "autonomous_cycle",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_err",
      source: "AutonomousExecutionDaemon",
      payload: {
        cycleId: "c1",
        userId: "user_123",
        // durationMs missing
        evaluationsCount: 5,
        actionsTriggered: 1,
        timestamp: Date.now(),
      } as any,
    };
    const res = safeValidateCanonicalEnvelope(invalidCycle);
    assert.equal(res.success, false);
    assert.match(res.error || "", /durationMs/);
  });
});

