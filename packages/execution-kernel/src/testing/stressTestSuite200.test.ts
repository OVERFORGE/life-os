import test from "node:test";
import assert from "node:assert/strict";
import { STRESS_TEST_SUITE_200, StressTestCase } from "./fixtures/stressTestSuite200Data";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { DynamicRouter } from "../orchestration/supervisor/DynamicRouter";
import { FastPathExecutor } from "../orchestration/supervisor/FastPathExecutor";
import { ReActOrchestrator } from "../orchestration/react/ReActOrchestrator";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { ContextProjectionEngine } from "../orchestration/context/ContextProjectionEngine";
import { ParallelSpecialistExecutor } from "../orchestration/supervisor/ParallelSpecialistExecutor";
import { SynthesisEngine } from "../orchestration/synthesis/SynthesisEngine";
import { ProductivityAgent } from "../orchestration/specialists/ProductivityAgent";
import { HealthAgent } from "../orchestration/specialists/HealthAgent";
import { WellnessAgent } from "../orchestration/specialists/WellnessAgent";
import { MockSpecialistLLM } from "./fixtures/mockSpecialistLLM";
import { DEFAULT_ORCHESTRATION_POLICY } from "../orchestration/contracts/OrchestrationPolicy";
import { ISpecialistAgent, AgentDomain } from "../orchestration/contracts/AgentContracts";

function createStressTestSupervisor(): Supervisor {
  const registry = new ActionAdapterRegistry();
  registerDefaultActionAdapters(registry);

  const kernelService = new KernelCapabilityService(registry);
  const fastPath = new FastPathExecutor(kernelService);
  const router = new DynamicRouter(fastPath);
  const projectionEngine = new ContextProjectionEngine();

  const specialists = new Map<AgentDomain, ISpecialistAgent>([
    ["productivity", new ProductivityAgent(new MockSpecialistLLM("productivity"))],
    ["health", new HealthAgent(new MockSpecialistLLM("health"))],
    ["wellness", new WellnessAgent(new MockSpecialistLLM("wellness"))],
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

  return new Supervisor(router, fastPath, reactOrchestrator);
}

test("LifeOS V3: 200-Test-Case Adversarial Stress Testing Campaign", async (t) => {
  const supervisor = createStressTestSupervisor();
  let passedCount = 0;
  let failedCount = 0;
  const latencies: number[] = [];
  const failures: Array<{ id: string; error: string; input: string }> = [];

  for (const tc of STRESS_TEST_SUITE_200) {
    await t.test(`[${tc.id}] ${tc.category}: "${tc.userInput.substring(0, 45)}"`, async () => {
      const startTime = Date.now();
      try {
        const res = await supervisor.processRequest({
          userId: "stress_user_1",
          message: tc.userInput,
          knownTasks: tc.context?.knownTasks,
        });

        const duration = Date.now() - startTime;
        latencies.push(duration);

        // 1. Validate routing strategy
        assert.equal(
          res.routingDecision.strategy,
          tc.expectedStrategy,
          `Expected strategy ${tc.expectedStrategy} but got ${res.routingDecision.strategy}`
        );

        // 2. Validate forbidden patterns (Zero DAG terminology, zero secret leakage)
        if (tc.forbiddenPatterns) {
          for (const pattern of tc.forbiddenPatterns) {
            const regex = new RegExp(pattern, "i");
            assert.ok(
              !regex.test(res.response),
              `Forbidden pattern '${pattern}' leaked in user response: "${res.response}"`
            );
          }
        }

        // 3. Validate required patterns
        if (tc.requiredPatterns) {
          for (const req of tc.requiredPatterns) {
            const regex = new RegExp(req, "i");
            assert.ok(
              regex.test(res.response),
              `Required pattern '${req}' was missing in user response: "${res.response}"`
            );
          }
        }

        // 4. Verify Fast Path latency budget (<= 1000ms SLA)
        if (tc.expectedStrategy === "FAST_PATH") {
          assert.ok(
            duration <= 1000,
            `Fast Path latency budget exceeded: ${duration}ms > 1000ms`
          );
        }

        passedCount++;
      } catch (err: any) {
        failedCount++;
        failures.push({ id: tc.id, error: err.message, input: tc.userInput });
        throw err;
      }
    });
  }

  // Summary assertions
  assert.equal(passedCount, 200, `Expected 200 passed tests, but ${failedCount} failed.`);
});
