import test from "node:test";
import assert from "node:assert/strict";
import { ProductivityAgent } from "../orchestration/specialists/ProductivityAgent";
import { HealthAgent } from "../orchestration/specialists/HealthAgent";
import { WellnessAgent } from "../orchestration/specialists/WellnessAgent";
import { AllowlistViolationError } from "../orchestration/specialists/BaseSpecialistAgent";
import { MockLLMProvider } from "./fixtures/mockLLMProvider";
import { AgentTask } from "../orchestration/contracts/AgentContracts";
import { ContextProjectionEngine } from "../orchestration/context/ContextProjectionEngine";
import { createMockKernelSnapshot, createMockGraphSnapshot } from "./fixtures/mockWorldState";

test("Phase 7 (TC-02): ProductivityAgent processes query and produces structured findings and proposal", async () => {
  const mockResponse = {
    summary: "Recommend focusing on high priority task 'Review PR #104' given high cognitive readiness.",
    observations: [{ payload: { fact: "PR #104 is on the critical path." } }],
    estimates: [
      {
        payload: { estimate: "Estimated completion time: 45 minutes" },
        confidence: 0.88,
        evidenceSources: ["historical_task_velocity"],
      },
    ],
    hypotheses: [
      {
        payload: { hypothesis: "Completing PR #104 will unlock 2 dependent workflow tasks." },
        confidence: 0.95,
        falsificationCriteria: ["If PR requires architectural changes"],
      },
    ],
    proposals: [
      {
        actionType: "adjust_task_priority",
        targetEntityId: "task_2",
        payload: { taskId: "task_2", priority: "urgent" },
        rationale: "Elevate PR to urgent to unblock critical path",
      },
    ],
    confidence: 0.9,
  };

  const mockLLM = new MockLLMProvider([
    {
      pattern: "What should I work on next?",
      response: mockResponse,
    },
  ]);

  const agent = new ProductivityAgent(mockLLM);
  const engine = new ContextProjectionEngine();
  const projection = engine.projectProductivity({
    userId: "user_p7_test",
    timestamp: Date.now(),
    worldSnapshot: createMockKernelSnapshot({ userId: "user_p7_test" }),
    graphSnapshot: createMockGraphSnapshot(),
  });

  const task: AgentTask = {
    taskId: "task_agent_1",
    executionId: "exec_100",
    domain: "productivity",
    instruction: "What should I work on next?",
    constraints: [],
  };

  const output = await agent.analyze(task, projection);

  // Invariant 1: Correct domain
  assert.equal(output.domain, "productivity");

  // Invariant 2: Epistemic categorization (TC-14)
  assert.equal(output.observations.length, 1);
  assert.equal(output.observations[0].category, "Observation");
  assert.equal(output.estimates.length, 1);
  assert.equal(output.estimates[0].category, "Estimate");
  assert.equal(output.estimates[0].confidence, 0.88);
  assert.equal(output.hypotheses.length, 1);
  assert.equal(output.hypotheses[0].category, "Hypothesis");

  // Invariant 3: Structured proposal generated
  assert.equal(output.proposals.length, 1);
  assert.equal(output.proposals[0].actionType, "adjust_task_priority");
  assert.equal(output.proposals[0].domain, "productivity");
  assert.ok(output.confidence > 0.8);
});

test("Phase 7 (TC-13): Allowlist enforcement blocks ProductivityAgent from proposing 'log_workout'", async () => {
  const illegalProductivityResponse = {
    summary: "Productivity agent attempting workout action.",
    proposals: [
      {
        actionType: "log_workout", // ILLEGAL for ProductivityAgent!
        payload: { type: "running", duration: 30 },
        rationale: "Workout will boost productivity",
      },
    ],
  };

  const mockLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      response: illegalProductivityResponse,
    },
  ]);

  const agent = new ProductivityAgent(mockLLM);
  const task: AgentTask = {
    taskId: "task_agent_2",
    executionId: "exec_101",
    domain: "productivity",
    instruction: "Plan my afternoon",
    constraints: [],
  };

  await assert.rejects(
    async () => agent.analyze(task, {}),
    (err: any) => {
      assert.ok(err instanceof AllowlistViolationError);
      assert.equal(err.domain, "productivity");
      assert.equal(err.attemptedAction, "log_workout");
      return true;
    }
  );
});

test("Phase 7 (TC-13): Allowlist enforcement blocks HealthAgent from proposing 'create_task'", async () => {
  const illegalHealthResponse = {
    summary: "Health agent attempting task creation.",
    proposals: [
      {
        actionType: "create_task", // ILLEGAL for HealthAgent!
        payload: { title: "Go for a jog" },
        rationale: "Cardio reminder",
      },
    ],
  };

  const mockLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      response: illegalHealthResponse,
    },
  ]);

  const agent = new HealthAgent(mockLLM);
  const task: AgentTask = {
    taskId: "task_agent_3",
    executionId: "exec_102",
    domain: "health",
    instruction: "Evaluate training",
    constraints: [],
  };

  await assert.rejects(
    async () => agent.analyze(task, {}),
    (err: any) => {
      assert.ok(err instanceof AllowlistViolationError);
      assert.equal(err.domain, "health");
      assert.equal(err.attemptedAction, "create_task");
      return true;
    }
  );
});

test("Phase 7: Fallback resilience returns clean error output when LLM outputs non-JSON garbage", async () => {
  const mockLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      response: "This is completely malformed text and not JSON!",
    },
  ]);

  const agent = new WellnessAgent(mockLLM);
  const task: AgentTask = {
    taskId: "task_agent_4",
    executionId: "exec_103",
    domain: "wellness",
    instruction: "Assess stress",
    constraints: [],
  };

  const output = await agent.analyze(task, {});
  assert.equal(output.domain, "wellness");
  assert.ok(output.summary.includes("fallback"));
  assert.equal(output.proposals.length, 0);
  assert.ok(output.confidence <= 0.2);
});
