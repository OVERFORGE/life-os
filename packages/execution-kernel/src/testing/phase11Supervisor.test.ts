import test from "node:test";
import assert from "node:assert/strict";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { DynamicRouter } from "../orchestration/supervisor/DynamicRouter";
import { FastPathExecutor } from "../orchestration/supervisor/FastPathExecutor";
import { ReActOrchestrator } from "../orchestration/react/ReActOrchestrator";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { ContextProjectionEngine } from "../orchestration/context/ContextProjectionEngine";
import { ParallelSpecialistExecutor } from "../orchestration/supervisor/ParallelSpecialistExecutor";
import { SynthesisEngine } from "../orchestration/synthesis/SynthesisEngine";
import { ProductivityAgent } from "../orchestration/specialists/ProductivityAgent";
import { HealthAgent } from "../orchestration/specialists/HealthAgent";
import { WellnessAgent } from "../orchestration/specialists/WellnessAgent";
import { MockLLMProvider } from "./fixtures/mockLLMProvider";
import { ISpecialistAgent, AgentDomain } from "../orchestration/contracts/AgentContracts";
import { DEFAULT_ORCHESTRATION_POLICY } from "../orchestration/contracts/OrchestrationPolicy";

function setupSupervisor() {
  const registry = new ActionAdapterRegistry();
  const completedTasks: string[] = [];

  registry.register("complete_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (p) => {
      completedTasks.push(p.payload.taskId);
      return { taskId: p.payload.taskId, status: "completed" };
    },
    compensate: async () => ({ compensated: true }),
  });

  const kernelService = new KernelCapabilityService(registry);
  const fastPath = new FastPathExecutor(kernelService);
  const router = new DynamicRouter(fastPath);
  const projectionEngine = new ContextProjectionEngine();

  const prodLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      response: {
        summary: "Productivity roadmap ready",
        proposals: [],
        confidence: 0.9,
      },
    },
  ]);

  const healthLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      response: {
        summary: "Health status evaluated",
        proposals: [],
        confidence: 0.9,
      },
    },
  ]);

  const wellnessLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      response: {
        summary: "Wellness recovery evaluated",
        proposals: [],
        confidence: 0.9,
      },
    },
  ]);

  const specialists = new Map<AgentDomain, ISpecialistAgent>([
    ["productivity", new ProductivityAgent(prodLLM)],
    ["health", new HealthAgent(healthLLM)],
    ["wellness", new WellnessAgent(wellnessLLM)],
  ]);

  const parallelExecutor = new ParallelSpecialistExecutor(specialists, 2000);
  const synthesisEngine = new SynthesisEngine();

  const reactOrchestrator = new ReActOrchestrator(
    kernelService,
    projectionEngine,
    parallelExecutor,
    synthesisEngine,
    DEFAULT_ORCHESTRATION_POLICY
  );

  const supervisor = new Supervisor(router, fastPath, reactOrchestrator);

  return { supervisor, router, fastPath, completedTasks };
}

test("Phase 11: DynamicRouter routes requests accurately based on intent complexity", () => {
  const { router } = setupSupervisor();

  // 1. Fast Path
  const fastDecision = router.route("Mark task 123 complete");
  assert.equal(fastDecision.strategy, "FAST_PATH");

  // 2. Single Specialist (Health)
  const healthDecision = router.route("What workout should I do today?");
  assert.equal(healthDecision.strategy, "SINGLE_SPECIALIST");
  assert.equal(healthDecision.targetDomain, "health");

  // 3. Single Specialist (Wellness)
  const wellnessDecision = router.route("I am feeling stressed and overwhelmed");
  assert.equal(wellnessDecision.strategy, "SINGLE_SPECIALIST");
  assert.equal(wellnessDecision.targetDomain, "wellness");

  // 4. Multi-Agent ReAct
  const multiDecision = router.route("I'm exhausted, I have three deadlines this week, and I haven't trained in four days");
  assert.equal(multiDecision.strategy, "MULTI_AGENT");
});

test("Phase 11: Supervisor executes Fast Path in <= 1000ms with zero DAG terminology", async () => {
  const { supervisor, completedTasks } = setupSupervisor();

  const startTime = Date.now();
  const response = await supervisor.processRequest({
    userId: "user_sup_1",
    message: "Mark task 999 complete",
  });
  const duration = Date.now() - startTime;

  assert.equal(response.routingDecision.strategy, "FAST_PATH");
  assert.ok(duration <= 1000, `Expected duration <= 1000ms, got ${duration}ms`);
  assert.ok(completedTasks.includes("999"));
  assert.equal(response.actionsExecuted, 1);
  assert.ok(response.response.includes("999"));
  assert.ok(!response.response.includes("DAG"));
  assert.ok(!response.response.includes("ExecutionNode"));
});

test("Phase 11: Supervisor coordinates Multi-Agent ReAct flow with synthesis and natural response", async () => {
  const { supervisor } = setupSupervisor();

  const response = await supervisor.processRequest({
    userId: "user_sup_2",
    message: "I am completely exhausted, but I have 3 deadlines and need to schedule a workout",
  });

  assert.equal(response.routingDecision.strategy, "MULTI_AGENT");
  assert.ok(response.response.length > 0);
  assert.ok(!response.response.includes("DAG"));
  assert.ok(!response.response.includes("ExecutionNode"));
  assert.ok(!response.response.includes("repairId"));
  assert.equal(response.workspaceStatus, "COMPLETED");
});
