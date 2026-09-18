import test from "node:test";
import assert from "node:assert/strict";
import { ParallelSpecialistExecutor, SpecialistInvocation } from "../orchestration/supervisor/ParallelSpecialistExecutor";
import { ProductivityAgent } from "../orchestration/specialists/ProductivityAgent";
import { HealthAgent } from "../orchestration/specialists/HealthAgent";
import { WellnessAgent } from "../orchestration/specialists/WellnessAgent";
import { MockLLMProvider } from "./fixtures/mockLLMProvider";
import { ISpecialistAgent, AgentDomain } from "../orchestration/contracts/AgentContracts";

test("Phase 8 (TC-03): Parallel specialists execute concurrently across Productivity, Health, and Wellness", async () => {
  const prodLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      delayMs: 30,
      response: {
        summary: "Productivity workload assessed.",
        observations: [],
        estimates: [],
        hypotheses: [],
        proposals: [{ actionType: "adjust_task_priority", payload: { taskId: "t1" } }],
      },
    },
  ]);

  const healthLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      delayMs: 30,
      response: {
        summary: "Health training assessed.",
        observations: [],
        estimates: [],
        hypotheses: [],
        proposals: [{ actionType: "log_workout", payload: { type: "recovery_walk" } }],
      },
    },
  ]);

  const wellnessLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      delayMs: 30,
      response: {
        summary: "Wellness recovery assessed.",
        observations: [],
        estimates: [],
        hypotheses: [],
        proposals: [{ actionType: "apply_recovery_constraint", payload: { maxFocusHours: 4 } }],
      },
    },
  ]);

  const specialists = new Map<AgentDomain, ISpecialistAgent>([
    ["productivity", new ProductivityAgent(prodLLM)],
    ["health", new HealthAgent(healthLLM)],
    ["wellness", new WellnessAgent(wellnessLLM)],
  ]);

  const executor = new ParallelSpecialistExecutor(specialists, 2000);

  const invocations: SpecialistInvocation[] = [
    {
      domain: "productivity",
      task: { taskId: "t1", executionId: "e1", domain: "productivity", instruction: "Assess workload", constraints: [] },
      projection: { tasks: [] },
    },
    {
      domain: "health",
      task: { taskId: "t2", executionId: "e1", domain: "health", instruction: "Assess training", constraints: [] },
      projection: { trainingStatus: "recovery" },
    },
    {
      domain: "wellness",
      task: { taskId: "t3", executionId: "e1", domain: "wellness", instruction: "Assess recovery", constraints: [] },
      projection: { stressBand: "high" },
    },
  ];

  const startTime = Date.now();
  const result = await executor.executeParallel(invocations);
  const duration = Date.now() - startTime;

  // Invariant 1: Concurrency check (total elapsed should be ~30-60ms, not 90ms+ serial)
  assert.ok(duration < 150, `Expected parallel duration < 150ms, got ${duration}ms`);

  // Invariant 2: All three specialists returned successfully
  assert.equal(result.successfulOutputs.length, 3);
  assert.equal(result.failedDomains.length, 0);

  const domains = result.successfulOutputs.map((o) => o.domain);
  assert.ok(domains.includes("productivity"));
  assert.ok(domains.includes("health"));
  assert.ok(domains.includes("wellness"));
});

test("Phase 8 (TC-07): Partial specialist outage resilience - Health times out, Productivity and Wellness succeed", async () => {
  const prodLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      delayMs: 20,
      response: { summary: "Productivity OK", proposals: [] },
    },
  ]);

  // Simulate Health agent hanging indefinitely
  const healthLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      delayMs: 500, // Exceeds the 100ms test timeout!
      response: { summary: "Health will never finish in time", proposals: [] },
    },
  ]);

  const wellnessLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      delayMs: 20,
      response: { summary: "Wellness OK", proposals: [] },
    },
  ]);

  const specialists = new Map<AgentDomain, ISpecialistAgent>([
    ["productivity", new ProductivityAgent(prodLLM)],
    ["health", new HealthAgent(healthLLM)],
    ["wellness", new WellnessAgent(wellnessLLM)],
  ]);

  const executor = new ParallelSpecialistExecutor(specialists, 100); // 100ms timeout

  const invocations: SpecialistInvocation[] = [
    {
      domain: "productivity",
      task: { taskId: "t1", executionId: "e2", domain: "productivity", instruction: "Analyze", constraints: [] },
      projection: {},
    },
    {
      domain: "health",
      task: { taskId: "t2", executionId: "e2", domain: "health", instruction: "Analyze", constraints: [] },
      projection: {},
    },
    {
      domain: "wellness",
      task: { taskId: "t3", executionId: "e2", domain: "wellness", instruction: "Analyze", constraints: [] },
      projection: {},
    },
  ];

  const result = await executor.executeParallel(invocations, 100);

  // Invariant: Productivity and Wellness succeed, Health is captured as timed out
  assert.equal(result.successfulOutputs.length, 2);
  const successfulDomains = result.successfulOutputs.map((o) => o.domain);
  assert.ok(successfulDomains.includes("productivity"));
  assert.ok(successfulDomains.includes("wellness"));

  assert.equal(result.failedDomains.length, 1);
  assert.equal(result.failedDomains[0].domain, "health");
  assert.equal(result.failedDomains[0].isTimeout, true);
});

test("Phase 8: Specialist exception isolation - Health throws error, peers complete successfully", async () => {
  const prodLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      response: { summary: "Productivity OK", proposals: [] },
    },
  ]);

  const healthLLM = new MockLLMProvider([
    {
      pattern: /.*/,
      error: new Error("Simulated LLM API network disconnect"),
    },
  ]);

  const specialists = new Map<AgentDomain, ISpecialistAgent>([
    ["productivity", new ProductivityAgent(prodLLM)],
    ["health", new HealthAgent(healthLLM)],
  ]);

  const executor = new ParallelSpecialistExecutor(specialists, 1000);

  const invocations: SpecialistInvocation[] = [
    {
      domain: "productivity",
      task: { taskId: "t1", executionId: "e3", domain: "productivity", instruction: "Analyze", constraints: [] },
      projection: {},
    },
    {
      domain: "health",
      task: { taskId: "t2", executionId: "e3", domain: "health", instruction: "Analyze", constraints: [] },
      projection: {},
    },
  ];

  const result = await executor.executeParallel(invocations);

  assert.equal(result.successfulOutputs.length, 1);
  assert.equal(result.successfulOutputs[0].domain, "productivity");
  assert.equal(result.failedDomains.length, 1);
  assert.equal(result.failedDomains[0].domain, "health");
  assert.ok(result.failedDomains[0].error.includes("Simulated LLM API network disconnect"));
});
