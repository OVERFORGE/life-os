import test from "node:test";
import assert from "node:assert/strict";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { DynamicRouter } from "../orchestration/supervisor/DynamicRouter";

test("Phase 5 (TC-01): Atomic kernel executes complete_task in <= 1000ms with zero DAG jargon", async () => {
  const registry = new ActionAdapterRegistry();
  const completedTaskIds: string[] = [];

  registry.register("complete_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (p) => {
      completedTaskIds.push(p.payload.taskId);
      return { taskId: p.payload.taskId, status: "completed" };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernelService = new KernelCapabilityService(registry);
  const startTime = Date.now();
  const proposal = {
    id: "prop_p5_1",
    domain: "productivity" as const,
    actionType: "complete_task" as const,
    reversibility: "atomic_single_doc" as const,
    state: "APPROVED" as const,
    title: "Complete task 123",
    rationale: "Task completion",
    idempotencyKey: "p5_1",
    payload: { taskId: "123" },
  };
  const val = await kernelService.validateActionProposals("user_test_1", [proposal]);
  assert.equal(val.valid, true);
  const result = await kernelService.executeAction("user_test_1", proposal);
  const duration = Date.now() - startTime;

  assert.equal(result.success, true);
  assert.ok(duration <= 1000, `Total elapsed ${duration}ms exceeded 1000ms`);
  assert.ok(completedTaskIds.includes("123"));
});

test("Phase 5: Atomic kernel task creation succeeds with structured proposal", async () => {
  const registry = new ActionAdapterRegistry();
  const createdTasks: any[] = [];

  registry.register("create_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (p) => {
      createdTasks.push(p.payload);
      return { id: "new_task_99", ...p.payload };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernelService = new KernelCapabilityService(registry);
  const proposal = {
    id: "prop_p5_2",
    domain: "productivity" as const,
    actionType: "create_task" as const,
    reversibility: "atomic_single_doc" as const,
    state: "APPROVED" as const,
    title: "Review documentation",
    rationale: "Task creation",
    idempotencyKey: "p5_2",
    payload: { title: "Review documentation" },
  };
  const val = await kernelService.validateActionProposals("user_test_1", [proposal]);
  assert.equal(val.valid, true);
  const result = await kernelService.executeAction("user_test_1", proposal);

  assert.equal(result.success, true);
  assert.equal(createdTasks.length, 1);
  assert.equal(createdTasks[0].title, "Review documentation");
});

test("Phase 5: Ambiguous or multi-agent requests do not route to FAST_PATH", () => {
  const router = new DynamicRouter();
  const complexMessage = "I'm exhausted, I have three deadlines this week, and I haven't trained in four days.";
  const decision = router.route(complexMessage);
  assert.notEqual(decision.strategy, "FAST_PATH");
});
