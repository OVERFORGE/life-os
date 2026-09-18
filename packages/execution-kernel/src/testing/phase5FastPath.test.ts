import test from "node:test";
import assert from "node:assert/strict";
import { FastPathExecutor } from "../orchestration/supervisor/FastPathExecutor";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";

test("Phase 5 (TC-01): Fast-path executes 'Mark task 123 complete' in <= 1000ms with zero DAG jargon", async () => {
  const registry = new ActionAdapterRegistry();
  const completedTaskIds: string[] = [];

  // Register complete_task adapter
  registry.register("complete_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (p) => {
      completedTaskIds.push(p.payload.taskId);
      return { taskId: p.payload.taskId, status: "completed" };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernelService = new KernelCapabilityService(registry);
  const fastPath = new FastPathExecutor(kernelService);

  const message = "Mark task 123 complete";
  assert.equal(fastPath.canHandle(message), true);

  const startTime = Date.now();
  const result = await fastPath.execute(message, "user_test_1");
  const duration = Date.now() - startTime;

  // Invariant 1: Latency <= 1000ms
  assert.equal(result.handled, true);
  assert.ok(result.durationMs <= 1000, `Expected duration <= 1000ms, got ${result.durationMs}ms`);
  assert.ok(duration <= 1000, `Total elapsed ${duration}ms exceeded 1000ms`);

  // Invariant 2: Execution succeeded in kernel
  assert.ok(result.kernelResults && result.kernelResults.length > 0);
  assert.equal(result.kernelResults[0].success, true);
  assert.ok(completedTaskIds.includes("123"));

  // Invariant 3: Clean response free of DAG terminology
  assert.ok(result.userResponse.includes("123"));
  assert.ok(result.userResponse.toLowerCase().includes("complete"));
  assert.ok(!result.userResponse.includes("DAG"));
  assert.ok(!result.userResponse.includes("ExecutionNode"));
  assert.ok(!result.userResponse.includes("idempotencyKey"));
  assert.ok(!result.userResponse.includes("repair"));
});

test("Phase 5: Fast-path task creation succeeds with structured proposal and clean confirmation", async () => {
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
  const fastPath = new FastPathExecutor(kernelService);

  const message = "create task: Review documentation";
  assert.equal(fastPath.canHandle(message), true);

  const result = await fastPath.execute(message, "user_test_1");

  assert.equal(result.handled, true);
  assert.ok(result.kernelResults && result.kernelResults.length > 0);
  assert.equal(result.kernelResults[0].success, true);
  assert.equal(createdTasks.length, 1);
  assert.equal(createdTasks[0].title, "Review documentation");
  assert.ok(result.userResponse.includes("Review documentation"));
  assert.ok(!result.userResponse.includes("DAG"));
});

test("Phase 5: Ambiguous or multi-agent requests are not handled by Fast Path", async () => {
  const registry = new ActionAdapterRegistry();
  const kernelService = new KernelCapabilityService(registry);
  const fastPath = new FastPathExecutor(kernelService);

  const complexMessage = "I'm exhausted, I have three deadlines this week, and I haven't trained in four days.";
  assert.equal(fastPath.canHandle(complexMessage), false);

  const result = await fastPath.execute(complexMessage, "user_test_1");
  assert.equal(result.handled, false);
  assert.equal(result.userResponse, "");
});

test("Phase 5: FastPath resolves task title to taskId using knownTasks context", async () => {
  const registry = new ActionAdapterRegistry();
  let executedTaskId = "";

  registry.register("complete_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (p) => {
      executedTaskId = p.payload.taskId;
      return { taskId: p.payload.taskId, status: "completed" };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernelService = new KernelCapabilityService(registry);
  const fastPath = new FastPathExecutor(kernelService);

  const knownTasks = [
    { id: "task_abc_123", title: "Write Weekly Report" },
    { id: "task_def_456", title: "Submit Tax Filing" },
  ];

  const result = await fastPath.execute('complete task "Write Weekly Report"', "user_test_1", { knownTasks });
  assert.equal(result.handled, true);
  assert.equal(executedTaskId, "task_abc_123");
  assert.ok(result.userResponse.includes("Write Weekly Report"));
});
