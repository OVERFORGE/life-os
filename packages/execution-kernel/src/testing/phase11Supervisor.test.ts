import test from "node:test";
import assert from "node:assert/strict";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { DynamicRouter } from "../orchestration/supervisor/DynamicRouter";
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
import { SemanticTurn } from "../orchestration/contracts/SemanticTurnContracts";
import { setMockGroqChat, setMockGroqTextStream } from "../shared/groq";

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
  const router = new DynamicRouter();
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

  const supervisor = new Supervisor(router, null, reactOrchestrator, kernelService);

  return { supervisor, router, completedTasks };
}

test("Phase 11: DynamicRouter routes requests accurately based on SemanticTurn contracts", () => {
  const { router } = setupSupervisor();
  const baseProv = {
    interpreterProvider: "groq" as const,
    modelIdentifier: "mock",
    promptVersionHash: "v1",
    contextSnapshotId: "ctx_1",
    contextSnapshotHash: "h1",
    inferenceDurationMs: 1,
  };

  const fastTurn: SemanticTurn = {
    turnId: "t_fast",
    schemaVersion: 2,
    userId: "user_sup_1",
    conversationId: "conv_1",
    timestamp: Date.now(),
    rawInput: "Mark task 123 complete",
    normalizedTimezone: "UTC",
    provenance: baseProv,
    primaryClassification: "ACTION_REQUEST",
    ambiguityStatus: "UNAMBIGUOUS",
    conversationalSummary: "Mark task 123 complete",
    operations: [
      {
        operationId: "op_fast_1",
        domain: "productivity",
        actionType: "complete_task",
        riskClass: "LOW_REVERSIBLE",
        payload: { taskId: "123" },
        dependencies: [],
        executionEligibility: "READY",
      },
    ],
    relevanceDomains: ["TASKS"],
  };
  const fastDecision = router.route(fastTurn.rawInput, fastTurn);
  assert.equal(fastDecision.strategy, "FAST_PATH");

  const healthTurn: SemanticTurn = {
    turnId: "t_health",
    schemaVersion: 2,
    userId: "user_sup_1",
    conversationId: "conv_1",
    timestamp: Date.now(),
    rawInput: "What workout should I do today?",
    normalizedTimezone: "UTC",
    provenance: baseProv,
    primaryClassification: "INFORMATION_QUERY",
    ambiguityStatus: "UNAMBIGUOUS",
    conversationalSummary: "What workout should I do today?",
    operations: [],
    relevanceDomains: ["HEALTH"],
  };
  const healthDecision = router.route(healthTurn.rawInput, healthTurn);
  assert.equal(healthDecision.strategy, "SINGLE_SPECIALIST");
  assert.equal(healthDecision.targetDomain, "health");

  const tasksTurn: SemanticTurn = {
    turnId: "t_tasks",
    schemaVersion: 2,
    userId: "user_sup_1",
    conversationId: "conv_1",
    timestamp: Date.now(),
    rawInput: "What deadlines do I have today?",
    normalizedTimezone: "UTC",
    provenance: baseProv,
    primaryClassification: "INFORMATION_QUERY",
    ambiguityStatus: "UNAMBIGUOUS",
    conversationalSummary: "What deadlines do I have today?",
    operations: [],
    relevanceDomains: ["TASKS"],
  };
  const tasksDecision = router.route(tasksTurn.rawInput, tasksTurn);
  assert.equal(tasksDecision.strategy, "SINGLE_SPECIALIST");
  assert.equal(tasksDecision.targetDomain, "productivity");

  const multiTurn: SemanticTurn = {
    turnId: "t_multi",
    schemaVersion: 2,
    userId: "user_sup_1",
    conversationId: "conv_1",
    timestamp: Date.now(),
    rawInput: "I'm exhausted, I have three deadlines this week, and I haven't trained in four days",
    normalizedTimezone: "UTC",
    provenance: baseProv,
    primaryClassification: "INFORMATION_QUERY",
    ambiguityStatus: "UNAMBIGUOUS",
    conversationalSummary: "Exhausted with deadlines and training",
    operations: [],
    relevanceDomains: ["TASKS", "HEALTH"],
  };
  const multiDecision = router.route(multiTurn.rawInput, multiTurn);
  assert.equal(multiDecision.strategy, "MULTI_AGENT");
});

test("Phase 11: Supervisor executes Fast Path in <= 1000ms with zero DAG terminology", async () => {
  const prevKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test_key_p11_fast";
  setMockGroqChat(async () =>
    JSON.stringify({
      turnId: "t_sup_fast",
      rawMessage: "Mark task 999 complete",
      primaryClassification: "ACTION_REQUEST",
      confidence: 0.99,
      operations: [
        {
          domain: "productivity",
          actionType: "complete_task",
          targetReference: {
            rawExpression: "999",
            entityType: "task",
            resolvedEntityId: "999",
            resolutionStrategy: "EXACT_ID",
          },
          payload: { taskId: "999" },
        },
      ],
      relevanceDomains: ["TASKS"],
    })
  );
  try {
    const { supervisor, completedTasks } = setupSupervisor();

    const startTime = Date.now();
    const response = await supervisor.processRequest({
      userId: "user_sup_1",
      message: "Mark task 999 complete",
      knownTasks: [{ id: "999", title: "Task 999" }],
    });
    const duration = Date.now() - startTime;

    assert.equal(response.routingDecision.strategy, "FAST_PATH");
    assert.ok(duration <= 1000, `Expected duration <= 1000ms, got ${duration}ms`);
    assert.ok(completedTasks.includes("999"));
    assert.equal(response.actionsExecuted, 1);
    assert.ok(!response.response.includes("DAG"));
    assert.ok(!response.response.includes("ExecutionNode"));
  } finally {
    setMockGroqChat(undefined);
    if (prevKey !== undefined) process.env.GROQ_API_KEY = prevKey;
    else delete process.env.GROQ_API_KEY;
  }
});

test("Phase 11: Supervisor coordinates Multi-Agent ReAct flow with synthesis and natural response", async () => {
  const prevKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test_key_p11_multi";
  setMockGroqChat(async () =>
    JSON.stringify({
      turnId: "t_sup_multi",
      rawMessage: "I am completely exhausted, but I have 3 deadlines and need to schedule a workout",
      primaryClassification: "INFORMATION_QUERY",
      confidence: 0.96,
      operations: [],
      relevanceDomains: ["HEALTH", "TASKS", "SCHEDULE"],
    })
  );
  setMockGroqTextStream(async ({ onDelta }) => {
    const msg = "Let's prioritize your 3 deadlines and swap in light recovery mobility today.";
    await onDelta?.(msg);
    return msg;
  });
  try {
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
  } finally {
    setMockGroqChat(undefined);
    setMockGroqTextStream(undefined);
    if (prevKey !== undefined) process.env.GROQ_API_KEY = prevKey;
    else delete process.env.GROQ_API_KEY;
  }
});
