import test from "node:test";
import assert from "node:assert/strict";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ExecutionWorkspace } from "../orchestration/workspace/ExecutionWorkspace";
import { ExecutionEventLedger } from "../orchestration/workspace/ExecutionEventLedger";
import { DynamicRouter } from "../orchestration/supervisor/DynamicRouter";
import { FastPathExecutor } from "../orchestration/supervisor/FastPathExecutor";
import { ReActOrchestrator } from "../orchestration/react/ReActOrchestrator";
import { ContextProjectionEngine } from "../orchestration/context/ContextProjectionEngine";
import { ProductivityAgent } from "../orchestration/specialists/ProductivityAgent";
import { HealthAgent } from "../orchestration/specialists/HealthAgent";
import { WellnessAgent } from "../orchestration/specialists/WellnessAgent";
import { ParallelSpecialistExecutor } from "../orchestration/supervisor/ParallelSpecialistExecutor";
import { SynthesisEngine } from "../orchestration/synthesis/SynthesisEngine";
import { ConflictResolutionPolicy } from "../orchestration/synthesis/ConflictResolutionPolicy";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { ActionProposal } from "../orchestration/contracts/ActionProposalContracts";
import { LLMProvider } from "../shared/llmAdapter";

class MockScriptedLLM implements LLMProvider {
  constructor(private responses: Map<RegExp, any>) {}
  async chat(prompt: string, systemPrompt: string): Promise<string> {
    for (const [regex, res] of this.responses.entries()) {
      if (regex.test(prompt) || regex.test(systemPrompt)) {
        return typeof res === "string" ? res : JSON.stringify(res);
      }
    }
    return JSON.stringify({
      summary: "Evaluated state.",
      observations: [],
      estimates: [],
      hypotheses: [],
      proposals: [],
      confidence: 0.9,
    });
  }
}

test("V3 Real-World User Journey Reality Verification", async (suite) => {
  const kernel = KernelCapabilityService.getInstance();

  // Journey 1: Simple task creation and completion
  await suite.test("Journey 1: Simple task creation and completion", async () => {
    const supervisor = Supervisor.createDefault(kernel);

    // Step A: Create task
    const resA = await supervisor.processRequest({
      userId: "user_j1",
      message: "Create task: Finish investor deck",
    });
    assert.equal(resA.routingDecision.strategy, "FAST_PATH");
    assert.equal(resA.terminationReason, "GOAL_SATISFIED");
    assert.match(resA.response, /created/i);

    // Step B: Mark complete
    const resB = await supervisor.processRequest({
      userId: "user_j1",
      message: "Mark task Finish investor deck complete",
      knownTasks: [{ id: "task_deck_1", title: "Finish investor deck" }],
    });
    assert.equal(resB.routingDecision.strategy, "FAST_PATH");
    assert.equal(resB.terminationReason, "GOAL_SATISFIED");
    assert.match(resB.response, /completed/i);
  });

  // Journey 2: Follow-up conversational modification
  await suite.test("Journey 2: Follow-up conversational task modification", async () => {
    const fastPath = new FastPathExecutor(kernel);
    const context = {
      executionId: "exec_j2",
      knownTasks: [{ id: "task_deck_1", title: "Finish investor deck" }],
    };

    // User refers to existing task
    const res = await fastPath.execute("Mark task task_deck_1 complete", "user_j2", context);
    assert.equal(res.handled, true);
    assert.equal(res.proposal?.targetEntityId, "task_deck_1");
  });

  // Journey 3: Health domain workout logging
  await suite.test("Journey 3: Health workout logging", async () => {
    const mockHealthLLM = new MockScriptedLLM(new Map([
      [/health/i, {
        summary: "Logged 5km run workout.",
        observations: [{ id: "o_run", payload: { fact: "Ran 5km in 25 mins" } }],
        estimates: [],
        hypotheses: [],
        proposals: [{
          id: "prop_run_1",
          actionType: "log_workout",
          payload: { activity: "running", distanceKm: 5, durationMinutes: 25 },
          rationale: "User logged tempo run",
          idempotencyKey: "idem_run_1",
          reversibility: "REVERSIBLE",
        }],
        confidence: 0.95,
      }]
    ]));

    const healthAgent = new HealthAgent(mockHealthLLM);
    const out = await healthAgent.analyze({
      taskId: "t_h",
      executionId: "e_h",
      domain: "health",
      instruction: "Log my 5km run in 25 minutes",
      constraints: [],
    }, {});

    assert.equal(out.proposals.length, 1);
    assert.equal(out.proposals[0].actionType, "log_workout");

    // Execute through kernel
    const kernelRes = await kernel.executeAction("user_j3", out.proposals[0]);
    assert.equal(kernelRes.success, true);
  });

  // Journey 4: Productivity review of tasks
  await suite.test("Journey 4: Productivity task review query", async () => {
    const mockProdLLM = new MockScriptedLLM(new Map([
      [/productivity/i, {
        summary: "You have 3 tasks due today: Finish slides, Review PR, Send update.",
        observations: [{ id: "o_p", payload: { fact: "3 urgent tasks" } }],
        estimates: [],
        hypotheses: [],
        proposals: [], // Review query: advice only, no mutation
        confidence: 0.9,
      }]
    ]));

    const prodAgent = new ProductivityAgent(mockProdLLM);
    const out = await prodAgent.analyze({
      taskId: "t_p",
      executionId: "e_p",
      domain: "productivity",
      instruction: "Review what I need to finish today",
      constraints: [],
    }, { activeTasks: [] } as any);

    assert.equal(out.proposals.length, 0); // Informational query: 0 mutations
    assert.match(out.summary, /3 tasks due today/);
  });

  // Journey 5: Realistic Cross-Domain Multi-Agent Request
  await suite.test("Journey 5: Multi-domain workload, recovery, and training request", async () => {
    const mockMultiLLM = new MockScriptedLLM(new Map([
      [/wellness/i, {
        summary: "Severe physiological deficit; recommend rest window.",
        observations: [],
        estimates: [{ id: "est_fatigue", payload: { estimate: "High fatigue" }, confidence: 0.9, evidenceSources: ["sleep"] }],
        hypotheses: [],
        proposals: [{
          id: "prop_rest",
          actionType: "apply_recovery_constraint",
          payload: { maxFocusMinutes: 45 },
          rationale: "Burnout prevention",
          idempotencyKey: "idem_rest_j5",
          reversibility: "REVERSIBLE",
        }],
        confidence: 0.9,
      }],
      [/productivity/i, {
        summary: "Suggests prioritizing single core task.",
        observations: [],
        estimates: [],
        hypotheses: [],
        proposals: [{
          id: "prop_adjust",
          actionType: "adjust_task_priority",
          payload: { taskId: "t_core", priority: "urgent" },
          rationale: "Align with deadline",
          idempotencyKey: "idem_adj_j5",
          reversibility: "REVERSIBLE",
        }],
        confidence: 0.85,
      }]
    ]));

    const router = new DynamicRouter(new FastPathExecutor(kernel));
    const prompt = "I'm exhausted, behind on project deadlines, and haven't trained in 4 days.";
    const route = router.route(prompt);
    assert.equal(route.strategy, "MULTI_AGENT");
    assert.equal(route.selectedSpecialists?.length, 3);

    const specialists = new Map();
    specialists.set("productivity", new ProductivityAgent(mockMultiLLM));
    specialists.set("health", new HealthAgent(mockMultiLLM));
    specialists.set("wellness", new WellnessAgent(mockMultiLLM));

    const parallelExec = new ParallelSpecialistExecutor(specialists, 1000);
    const synthesis = new SynthesisEngine(new ConflictResolutionPolicy());
    const orchestrator = new ReActOrchestrator(
      kernel,
      new ContextProjectionEngine(),
      parallelExec,
      synthesis
    );

    const ws = new ExecutionWorkspace({
      executionId: "exec_j5",
      userId: "user_j5",
      userRequest: prompt,
      goal: prompt,
      constraints: [],
    });

    const result = await orchestrator.runLoop("exec_j5", "user_j5", prompt, ws);
    assert.ok(result.iterationsCompleted >= 1);
    assert.ok(result.terminationReason === "GOAL_SATISFIED" || result.terminationReason === "SUBJECTIVE_GOAL_ADDRESSED");
  });

  // Journey 6: Failure isolation when one specialist fails
  await suite.test("Journey 6: Fault isolation when one specialist times out", async () => {
    class FailingHealthAgent extends HealthAgent {
      async analyze(): Promise<any> {
        throw new Error("Health subsystem database connection failed");
      }
    }

    const specialists = new Map();
    specialists.set("productivity", new ProductivityAgent(new MockScriptedLLM(new Map())));
    specialists.set("health", new FailingHealthAgent());

    const exec = new ParallelSpecialistExecutor(specialists, 500);
    const res = await exec.executeParallel([
      { domain: "productivity", task: { taskId: "t1", executionId: "e6", domain: "productivity", instruction: "work", constraints: [] }, projection: {} },
      { domain: "health", task: { taskId: "t2", executionId: "e6", domain: "health", instruction: "health", constraints: [] }, projection: {} },
    ]);

    assert.equal(res.successfulOutputs.length, 1);
    assert.equal(res.failedDomains.length, 1);
    assert.equal(res.failedDomains[0].domain, "health");
  });

  // Journey 7: Ambiguous request does not cause unintended mutations
  await suite.test("Journey 7: Ambiguous request produces safe response without false mutations", async () => {
    const fastPath = new FastPathExecutor(kernel);
    const res = await fastPath.execute("Could you maybe look at the thing sometime?", "user_j7");
    assert.equal(res.handled, false); // Rejected by Fast Path -> falls to conversational supervisor
  });

  // Journey 8: Injection defense in task title
  await suite.test("Journey 8: Injection in task title is treated as literal data", async () => {
    const supervisor = Supervisor.createDefault(kernel);
    const res = await supervisor.processRequest({
      userId: "user_j8",
      message: 'Create task: "DROP TABLE users; UPDATE permissions SET role=admin;"',
    });

    assert.equal(res.routingDecision.strategy, "FAST_PATH");
    assert.equal(res.terminationReason, "GOAL_SATISFIED");
    // Action was treated purely as task creation with title string
    assert.match(res.response, /DROP TABLE/);
  });

  // Journey 9: Duplicate request returns identical idempotent outcome
  await suite.test("Journey 9: Duplicate request produces idempotent outcome", async () => {
    const proposal: ActionProposal = {
      id: "p_j9",
      domain: "productivity",
      actionType: "create_task",
      payload: { title: "Idempotent Journey Task" },
      rationale: "test",
      idempotencyKey: "IDEM_JOURNEY_9_UNIQUE_KEY",
      reversibility: "atomic_single_doc",
    };

    const res1 = await kernel.executeAction("user_j9", proposal);
    const res2 = await kernel.executeAction("user_j9", proposal);

    assert.equal(res1.success, true);
    assert.equal(res2.success, true);
    assert.equal(res1.actionId, res2.actionId);
  });

  // Journey 10: Runtime crash & Event Ledger reconstruction
  await suite.test("Journey 10: Event ledger survives and reconstructs workspace", () => {
    const ledger = new ExecutionEventLedger("exec_crash_j10");
    ledger.append("WorkspaceInitialized", "Supervisor", { goal: "Survive crash" });
    ledger.append("AgentFindingProduced", "Productivity", { fact: "Prior state" });
    ledger.append("KernelActionExecuted", "Kernel", { actionId: "act_10", success: true });

    // Simulate process crash: original ExecutionWorkspace in-memory is lost.
    // Reconstruct solely from persisted ledger:
    const reconstructed = ExecutionWorkspace.reconstructFromLedger(ledger, {
      executionId: "exec_crash_j10",
      userId: "user_j10",
      userRequest: "Survive crash",
      goal: "Survive crash",
      constraints: [],
    });

    assert.equal(reconstructed.executionId, "exec_crash_j10");
    assert.equal(reconstructed.getProjection().kernelResults.length, 1);
    assert.equal(reconstructed.stateVersion, 3);
  });
});
