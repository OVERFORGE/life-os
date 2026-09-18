import test from "node:test";
import assert from "node:assert/strict";
import { ReActOrchestrator } from "../orchestration/react/ReActOrchestrator";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { ContextProjectionEngine } from "../orchestration/context/ContextProjectionEngine";
import { ParallelSpecialistExecutor } from "../orchestration/supervisor/ParallelSpecialistExecutor";
import { SynthesisEngine } from "../orchestration/synthesis/SynthesisEngine";
import { ProductivityAgent } from "../orchestration/specialists/ProductivityAgent";
import { HealthAgent } from "../orchestration/specialists/HealthAgent";
import { WellnessAgent } from "../orchestration/specialists/WellnessAgent";
import { ExecutionWorkspace } from "../orchestration/workspace/ExecutionWorkspace";
import { MockLLMProvider } from "./fixtures/mockLLMProvider";
import { ISpecialistAgent, AgentDomain } from "../orchestration/contracts/AgentContracts";
import { DEFAULT_ORCHESTRATION_POLICY } from "../orchestration/contracts/OrchestrationPolicy";

function setupOrchestrator(routes: { prod?: any; health?: any; wellness?: any }) {
  const registry = new ActionAdapterRegistry();
  const executedActions: string[] = [];

  registry.register("complete_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (p) => {
      executedActions.push(p.payload.taskId);
      return { taskId: p.payload.taskId, status: "completed" };
    },
    compensate: async () => ({ compensated: true }),
  });

  registry.register("create_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (p) => {
      executedActions.push(p.payload.title);
      return { id: "new_id", title: p.payload.title };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernelService = new KernelCapabilityService(registry);
  const projectionEngine = new ContextProjectionEngine();

  const specialists = new Map<AgentDomain, ISpecialistAgent>([
    ["productivity", new ProductivityAgent(new MockLLMProvider([{ pattern: /.*/, response: routes.prod || { summary: "OK", proposals: [] } }]))],
    ["health", new HealthAgent(new MockLLMProvider([{ pattern: /.*/, response: routes.health || { summary: "OK", proposals: [] } }]))],
    ["wellness", new WellnessAgent(new MockLLMProvider([{ pattern: /.*/, response: routes.wellness || { summary: "OK", proposals: [] } }]))],
  ]);

  const parallelExecutor = new ParallelSpecialistExecutor(specialists, 2000);
  const synthesisEngine = new SynthesisEngine();

  const orchestrator = new ReActOrchestrator(
    kernelService,
    projectionEngine,
    parallelExecutor,
    synthesisEngine,
    DEFAULT_ORCHESTRATION_POLICY
  );

  return { orchestrator, kernelService, executedActions };
}

test("Phase 10 (TC-05): Multi-turn ReAct loop terminates with GOAL_SATISFIED in <= 3 iterations", async () => {
  const { orchestrator, executedActions } = setupOrchestrator({
    prod: {
      summary: "Completing task 101",
      proposals: [
        {
          actionType: "complete_task",
          targetEntityId: "task_101",
          payload: { taskId: "task_101" },
          rationale: "Complete urgent task",
        },
      ],
    },
  });

  const workspace = new ExecutionWorkspace({
    executionId: "exec_react_1",
    userId: "user_react_test",
    userRequest: "Complete task 101",
    goal: "Complete task 101",
    constraints: [],
  });

  // Evaluator: satisfied once task_101 is executed
  const evaluator = (goal: string, state: any, iteration: number, actions: any[]) => {
    return actions.some((a) => a.actionType === "complete_task" && a.data?.taskId === "task_101");
  };

  const result = await orchestrator.runLoop(
    "exec_react_1",
    "user_react_test",
    "Complete task 101",
    workspace,
    evaluator
  );

  assert.equal(result.terminationReason, "GOAL_SATISFIED");
  assert.ok(result.iterationsCompleted <= 3, `Expected iterations <= 3, got ${result.iterationsCompleted}`);
  assert.equal(executedActions.length, 1);
  assert.equal(executedActions[0], "task_101");
  assert.equal(workspace.getState().status, "COMPLETED");
});

test("Phase 10 (TC-06): Maximum iteration limit strictly terminates loop without infinite spinning", async () => {
  // Specialists keep proposing actions, but the goal condition is intentionally never satisfied
  const { orchestrator } = setupOrchestrator({
    prod: {
      summary: "Working towards unachievable goal",
      proposals: [
        {
          actionType: "create_task",
          payload: { title: "Subtask iteration" },
          rationale: "Unachievable step",
        },
      ],
    },
  });

  const workspace = new ExecutionWorkspace({
    executionId: "exec_react_2",
    userId: "user_react_test",
    userRequest: "Impossible goal",
    goal: "Impossible goal",
    constraints: [],
  });

  // Evaluator: NEVER satisfied
  const neverSatisfied = () => false;

  const result = await orchestrator.runLoop(
    "exec_react_2",
    "user_react_test",
    "Impossible goal",
    workspace,
    neverSatisfied
  );

  // Invariant: Bounded execution guarantees termination at maxIterations (3)
  assert.equal(result.terminationReason, "MAX_ITERATIONS");
  assert.equal(result.iterationsCompleted, 3);
  assert.ok(result.userSummary.includes("maximum iteration limit reached"));
});

test("Phase 10 (TC-09): Duplicate action proposals across iterations are safely deduplicated by idempotency key", async () => {
  const duplicateIdempotencyKey = "dedup_fixed_key_12345";
  let executionCount = 0;

  const registry = new ActionAdapterRegistry();
  registry.register("complete_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => {
      executionCount++;
      return { status: "completed" };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernelService = new KernelCapabilityService(registry);
  const projectionEngine = new ContextProjectionEngine();

  const specialists = new Map<AgentDomain, ISpecialistAgent>([
    [
      "productivity",
      new ProductivityAgent(
        new MockLLMProvider([
          {
            pattern: /.*/,
            response: {
              summary: "Same action repeated",
              proposals: [
                {
                  actionType: "complete_task",
                  payload: { taskId: "task_repeat" },
                  idempotencyKey: duplicateIdempotencyKey, // STATIC KEY REPEATED
                },
              ],
            },
          },
        ])
      ),
    ],
  ]);

  const orchestrator = new ReActOrchestrator(
    kernelService,
    projectionEngine,
    new ParallelSpecialistExecutor(specialists),
    new SynthesisEngine(),
    DEFAULT_ORCHESTRATION_POLICY
  );

  const workspace = new ExecutionWorkspace({
    executionId: "exec_react_3",
    userId: "user_react_test",
    userRequest: "Repeat action test",
    goal: "Repeat action test",
    constraints: [],
  });

  // Run 2 iterations before satisfying
  let iterationsSeen = 0;
  const evaluator = () => {
    iterationsSeen++;
    return iterationsSeen >= 2;
  };

  const result = await orchestrator.runLoop(
    "exec_react_3",
    "user_react_test",
    "Repeat action test",
    workspace,
    evaluator
  );

  // Invariant (TC-09): The kernel executed the action only ONCE despite specialist proposing it in 2 iterations
  assert.equal(executionCount, 1);
});
