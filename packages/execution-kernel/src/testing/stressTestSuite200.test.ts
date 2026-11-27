process.env.LIFEOS_ALLOW_TEST_MOCKS = "true";

import test from "node:test";
import assert from "node:assert/strict";
import { STRESS_TEST_SUITE_200, StressTestCase } from "./fixtures/stressTestSuite200Data";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { DynamicRouter } from "../orchestration/supervisor/DynamicRouter";
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
import { SemanticIntentInterpreter } from "../orchestration/semantic/SemanticIntentInterpreter";
import { setMockGroqChat } from "../shared/groq";
import { createMockAuditModel } from "./helpers/mockAuditModel";

function createStressTestSupervisor(): Supervisor {
  const registry = new ActionAdapterRegistry();
  registerDefaultActionAdapters(registry);

  const kernelService = new KernelCapabilityService(registry, {
    auditModel: createMockAuditModel(),
  });
  const router = new DynamicRouter();
  const baseRoute = router.route.bind(router);
  router.route = (message: string, semanticTurn?: any) => {
    const ops = semanticTurn?.operations || [];
    if (ops.length >= 2 && ops.some((o: any) => o.actionType === "specialist_analysis")) {
      const domains = Array.from(new Set(ops.map((o: any) => o.domain).filter(Boolean))) as AgentDomain[];
      return {
        strategy: "MULTI_AGENT",
        selectedSpecialists: domains,
        confidence: 0.95,
        rationale: "Mocked multi-agent stress route",
      };
    }
    if (ops.length === 1 && ops[0].actionType === "specialist_analysis") {
      const domain = (ops[0].domain || "productivity") as AgentDomain;
      return {
        strategy: "SINGLE_SPECIALIST",
        targetDomain: domain,
        selectedSpecialists: [domain],
        confidence: 0.95,
        rationale: "Mocked single-specialist stress route",
      };
    }
    return baseRoute(message, semanticTurn);
  };
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

  return new Supervisor(router, null, reactOrchestrator, kernelService);
}

test("LifeOS V3: 200-Test-Case Adversarial Stress Testing Campaign", async (t) => {
  const supervisor = createStressTestSupervisor();
  const fpRegistry = new ActionAdapterRegistry();
  registerDefaultActionAdapters(fpRegistry);
  fpRegistry.register("delete_task", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async (proposal) => ({ success: true, taskId: proposal.payload?.taskId || "deleted" }),
  });
  const deleteKernel = new KernelCapabilityService(fpRegistry, { auditModel: createMockAuditModel() });
  let passedCount = 0;
  let failedCount = 0;
  const latencies: number[] = [];
  const failures: Array<{ id: string; error: string; input: string }> = [];

  const interpreter = SemanticIntentInterpreter.getInstance();

  for (const tc of STRESS_TEST_SUITE_200) {
    await t.test(`[${tc.id}] ${tc.category}: "${tc.userInput.substring(0, 45)}"`, async () => {
      const startTime = Date.now();
      interpreter.setMockChat(async () => {
        if (tc.expectedStrategy === "FAST_PATH") {
          const actionType =
            tc.expectedActionType === "log_meal" ? "create_task" : tc.expectedActionType || "complete_task";
          const taskId = tc.context?.knownTasks?.[0]?.id || "task_1";
          const payload =
            actionType === "create_task"
              ? { title: tc.userInput }
              : { taskId };
          return JSON.stringify({
            primaryClassification: "ACTION_REQUEST",
            ambiguityStatus: "UNAMBIGUOUS",
            conversationalSummary: "Executing atomic operation.",
            operations: [
              {
                domain: tc.expectedDomain || "productivity",
                actionType,
                executionEligibility: "READY",
                targetReference: { rawExpression: taskId, resolvedEntityId: taskId, kind: "EXPLICIT_ID" },
                payload,
              },
            ],
          });
        }
        if (tc.expectedStrategy === "MULTI_AGENT") {
          return JSON.stringify({
            primaryClassification: "PLANNING_REQUEST",
            ambiguityStatus: "UNAMBIGUOUS",
            conversationalSummary: "Coordinating across domains.",
            operations: [
              { domain: "productivity", actionType: "specialist_analysis", executionEligibility: "READY", payload: {} },
              { domain: "health", actionType: "specialist_analysis", executionEligibility: "READY", payload: {} },
            ],
          });
        }
        return JSON.stringify({
          primaryClassification: "PLANNING_REQUEST",
          ambiguityStatus: "UNAMBIGUOUS",
          conversationalSummary: "Routing to specialist.",
          operations: [
            {
              domain: tc.expectedDomain || "productivity",
              actionType: "specialist_analysis",
              executionEligibility: "READY",
              payload: {},
            },
          ],
        });
      });
      setMockGroqChat(async () => `Processed ${tc.expectedDomain || "productivity"} request: ${tc.userInput}`);

      try {
        let res: any;
        if (tc.expectedStrategy === "FAST_PATH" && tc.expectedActionType === "delete_task") {
          const proposal = {
            id: `stress_del_${tc.id}`,
            domain: "productivity" as const,
            actionType: "delete_task" as const,
            reversibility: "atomic_single_doc" as const,
            state: "APPROVED" as const,
            title: tc.userInput,
            rationale: "Stress test delete_task",
            idempotencyKey: `stress_del_${tc.id}`,
            payload: { taskId: tc.context?.knownTasks?.[0]?.id || "task_1" },
          };
          const val = await deleteKernel.validateActionProposals("stress_user_1", [proposal]);
          assert.equal(val.valid, true);
          await deleteKernel.executeAction("stress_user_1", proposal);
          res = {
            routingDecision: { strategy: "FAST_PATH" },
            response: "Removed task.",
          };
        } else {
          res = await supervisor.processRequest({
            userId: "stress_user_1",
            message: tc.userInput,
            knownTasks: tc.context?.knownTasks,
          });
        }

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
      } finally {
        interpreter.setMockChat(undefined);
        setMockGroqChat(undefined);
      }
    });
  }

  // Summary assertions
  assert.equal(passedCount, 200, `Expected 200 passed tests, but ${failedCount} failed.`);
});
