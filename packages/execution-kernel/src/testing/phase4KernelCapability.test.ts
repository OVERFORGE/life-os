import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KernelCapabilityService,
  ActionAdapterRegistry,
  IKernelActionAdapter,
  OutcomeVerifier,
  AuthoritativeKernelState,
} from "../orchestration/kernel";
import { ActionProposal, KernelActionDecision } from "../orchestration/contracts/ActionProposalContracts";
import { createMockGraphSnapshot, createMockKernelSnapshot } from "./fixtures/mockWorldState";

test("Phase 4: Action pre-flight validation accepts valid proposals and rejects unregistered types", async () => {
  const registry = new ActionAdapterRegistry();
  registry.register("create_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => ({ taskId: "task_new_1" }),
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);

  const proposals: ActionProposal[] = [
    {
      id: "prop_1",
      domain: "productivity",
      actionType: "create_task",
      payload: { title: "Test Task" },
      rationale: "Rationale",
      reversibility: "reversible_with_compensation",
      idempotencyKey: "key_create_1",
    },
    {
      id: "prop_2",
      domain: "productivity",
      actionType: "delete_task", // Unregistered
      payload: { taskId: "task_unknown" },
      rationale: "Rationale",
      reversibility: "reversible_with_compensation",
      idempotencyKey: "key_delete_1",
    },
  ];

  const validation = await kernel.validateActionProposals("user_1", proposals);
  assert.equal(validation.valid, false);
  assert.equal(validation.validDecisions.length, 1);
  assert.equal(validation.rejectedProposals.length, 1);
  assert.match(validation.rejectedProposals[0].reason, /UNREGISTERED_ACTION_TYPE/);
});

test("Phase 4 (TC-17): Idempotency gate returns cached result on retry without double execution", async () => {
  let executionCount = 0;
  const registry = new ActionAdapterRegistry();
  registry.register("complete_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => {
      executionCount++;
      return { taskId: "task_1", completed: true };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const decision: KernelActionDecision = {
    decisionId: "dec_1",
    proposalId: "prop_1",
    approved: true,
    executionOrder: 1,
    action: {
      id: "prop_1",
      domain: "productivity",
      actionType: "complete_task",
      targetEntityId: "task_1",
      payload: { taskId: "task_1" },
      rationale: "Done",
      reversibility: "reversible_with_compensation",
      idempotencyKey: "idem_complete_task_1",
    },
  };

  // First execution
  const res1 = await kernel.executeActionBatch("user_1", [decision]);
  assert.equal(res1.length, 1);
  assert.equal(res1[0].status, "SUCCEEDED");
  assert.equal(executionCount, 1);

  // Second execution with identical idempotencyKey (retry scenario)
  const res2 = await kernel.executeActionBatch("user_1", [decision]);
  assert.equal(res2.length, 1);
  assert.equal(res2[0].status, "SUCCEEDED");
  assert.equal(executionCount, 1, "Execution count must not increment on idempotent retry");
});

test("Phase 4 (TC-11): Compensating Saga reverts previously executed actions on mid-batch failure", async () => {
  let action1Compensated = false;
  const registry = new ActionAdapterRegistry();

  registry.register("create_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => ({ taskId: "task_101" }),
    compensate: async () => {
      action1Compensated = true;
      return { compensated: true };
    },
  });

  registry.register("log_workout", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => {
      throw new Error("Simulated Workout DB Error");
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const decisions: KernelActionDecision[] = [
    {
      decisionId: "dec_1",
      proposalId: "prop_1",
      approved: true,
      executionOrder: 1,
      action: {
        id: "prop_1",
        domain: "productivity",
        actionType: "create_task",
        payload: { title: "Action 1" },
        rationale: "Step 1",
        reversibility: "reversible_with_compensation",
        idempotencyKey: "key_saga_1",
      },
    },
    {
      decisionId: "dec_2",
      proposalId: "prop_2",
      approved: true,
      executionOrder: 2,
      action: {
        id: "prop_2",
        domain: "health",
        actionType: "log_workout",
        payload: { description: "Gym" },
        rationale: "Step 2",
        reversibility: "reversible_with_compensation",
        idempotencyKey: "key_saga_2",
      },
    },
  ];

  const results = await kernel.executeActionBatch("user_1", decisions);
  assert.equal(results.length, 2);
  assert.equal(results[1].status, "FAILED");
  assert.equal(results[0].status, "COMPENSATED");
  assert.equal(action1Compensated, true, "Action 1 must be compensated via reverse saga");
});

test("Phase 4 (TC-31): Compensation failure flags COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED", async () => {
  const registry = new ActionAdapterRegistry();

  registry.register("action_a", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => ({ success: true }),
    compensate: async () => {
      throw new Error("Network drop during compensation");
    },
  });

  registry.register("action_b", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => {
      throw new Error("Action B failed");
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(registry);
  const decisions: KernelActionDecision[] = [
    {
      decisionId: "dec_a",
      proposalId: "prop_a",
      approved: true,
      executionOrder: 1,
      action: {
        id: "prop_a",
        domain: "productivity",
        actionType: "action_a" as any,
        payload: {},
        rationale: "A",
        reversibility: "reversible_with_compensation",
        idempotencyKey: "key_comp_fail_a",
      },
    },
    {
      decisionId: "dec_b",
      proposalId: "prop_b",
      approved: true,
      executionOrder: 2,
      action: {
        id: "prop_b",
        domain: "productivity",
        actionType: "action_b" as any,
        payload: {},
        rationale: "B",
        reversibility: "reversible_with_compensation",
        idempotencyKey: "key_comp_fail_b",
      },
    },
  ];

  await kernel.executeActionBatch("user_1", decisions);
  const audit = kernel.getAuditRecord("key_comp_fail_a");
  assert.equal(audit?.status, "COMPENSATION_PARTIAL_MANUAL_REVIEW_REQUIRED");
  assert.match(audit?.error || "", /Compensation throw exception/);
});

test("Phase 4 (TC-32): OutcomeVerifier allows goal completion when stability score decreases", () => {
  const preSnapshot: AuthoritativeKernelState = {
    userId: "user_1",
    timestamp: Date.now(),
    graphSnapshot: createMockGraphSnapshot(),
    worldSnapshot: createMockKernelSnapshot({
      executionGraphSummary: { nodeCount: 3, edgeCount: 1, readyCount: 2, blockedCount: 0, criticalPathLength: 1, stabilityScore: 95 },
    }),
  };

  const postSnapshot: AuthoritativeKernelState = {
    userId: "user_1",
    timestamp: Date.now(),
    graphSnapshot: createMockGraphSnapshot(), // No cycles
    worldSnapshot: createMockKernelSnapshot({
      executionGraphSummary: { nodeCount: 6, edgeCount: 3, readyCount: 4, blockedCount: 0, criticalPathLength: 2, stabilityScore: 82 }, // Stability dropped from 95 to 82
    }),
  };

  const outcome = OutcomeVerifier.verify([], preSnapshot, postSnapshot);
  assert.equal(outcome.allHardInvariantsPassed, true, "Hard invariants must pass despite stability drop");
  assert.equal(outcome.stabilityScoreImpact, -13);
  assert.ok(outcome.diagnosticObservations.some((o) => o.includes("STABILITY_IMPACT_RECORDED")));
});

test("Phase 4: OutcomeVerifier catches cycle violations", () => {
  const preSnapshot: AuthoritativeKernelState = {
    userId: "user_1",
    timestamp: Date.now(),
    graphSnapshot: createMockGraphSnapshot(),
    worldSnapshot: createMockKernelSnapshot(),
  };

  const postSnapshot: AuthoritativeKernelState = {
    userId: "user_1",
    timestamp: Date.now(),
    graphSnapshot: createMockGraphSnapshot({ cycleDiagnostics: ["task_1 -> task_2 -> task_1"] }),
    worldSnapshot: createMockKernelSnapshot(),
  };

  const outcome = OutcomeVerifier.verify([], preSnapshot, postSnapshot);
  assert.equal(outcome.allHardInvariantsPassed, false);
  assert.match(outcome.failedInvariants[0], /CYCLE_DETECTED/);
});
