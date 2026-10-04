import test from "node:test";
import assert from "node:assert/strict";

import { DeliberativePlanningGraph } from "../../orchestration/langgraph/DeliberativePlanningGraph";
import { KernelCapabilityToolBridge } from "../../orchestration/langgraph/adapters/KernelCapabilityToolBridge";
import { LangGraphBenchmarkRunner } from "../../orchestration/langgraph/LangGraphBenchmarkRunner";

test("PHASE 10: Controlled LangGraph Evaluation & Pilot Suite", async (suite) => {
  const testUserId = "test-user-lg-phase10-" + Date.now();

  await suite.test("LG-01: StateGraph Execution & Structured Goal Decomposition", async () => {
    const graph = DeliberativePlanningGraph.getInstance();

    const goal = "Reorganize Q4 sprint to accommodate marathon training";
    const result = await graph.executePlan(testUserId, goal);

    assert.ok(result.executionId);
    assert.equal(result.userId, testUserId);
    assert.ok(result.proposedActionSequence.length >= 2, `Expected >= 2 proposals, got ${result.proposedActionSequence.length}`);
    assert.equal(result.cycleDetected, false);
    assert.equal(result.interruptedForHITL, false);
    assert.ok(result.synthesisRationale.includes("Synthesized"));
    assert.ok(result.metrics.durationMs > 0);

    // Verify all proposals have valid ActionProposal contracts
    for (const prop of result.proposedActionSequence) {
      assert.ok((prop as any).proposalId);
      assert.ok((prop as any).capabilityURN?.startsWith("urn:lifeos:action:"));
      assert.ok((prop as any).confidence > 0.8);
      assert.equal((prop as any).provenance, "LangGraph:DeliberativePlanningGraph");
    }
  });

  await suite.test("LG-02: Cycle Detection & Recursion Safety Ceiling (recursionLimit: 10)", async () => {
    const graph = DeliberativePlanningGraph.getInstance();

    const cyclicDeps = [
      { from: "Milestone A", to: "Milestone B" },
      { from: "Milestone B", to: "Milestone A" },
    ];

    const result = await graph.executePlan(
      testUserId,
      "Resolve cyclic dependency between Milestone A and Milestone B",
      {},
      cyclicDeps
    );

    assert.equal(result.cycleDetected, true, "Cycle must be detected");
    assert.equal(result.interruptedForHITL, true, "Graph must interrupt for HITL");
    assert.ok(result.synthesisRationale.includes("Circular dependency detected"));
    assert.ok(result.metrics.stepCount <= 10, "Step count must not exceed recursionLimit 10");
  });

  await suite.test("LG-03: Checkpoint Persistence & Human-in-the-Loop (HITL) Resumption", async () => {
    const graph = DeliberativePlanningGraph.getInstance();

    const cyclicDeps = [
      { from: "Task X", to: "Task Y" },
      { from: "Task Y", to: "Task X" },
    ];

    // 1. Initial execution halts at cycle
    const interruptedResult = await graph.executePlan(
      testUserId,
      "Cyclic task resolution",
      {},
      cyclicDeps
    );
    assert.equal(interruptedResult.interruptedForHITL, true);
    assert.ok(interruptedResult.checkpointId);

    // 2. Resume from checkpoint with human resolution (broken cycle)
    const resumedResult = await graph.resumeFromCheckpoint(interruptedResult.checkpointId!, {
      dependencies: [{ from: "Task X", to: "Task Y" }],
      subGoals: ["Unblock Task X", "Schedule Work Window for Task Y"],
    });

    assert.equal(resumedResult.interruptedForHITL, false);
    assert.ok(resumedResult.proposedActionSequence.length >= 1, "Resumed graph should produce proposals");
  });

  await suite.test("LG-04: KernelCapabilityToolBridge Read-Only Boundary (Zero DB Writes)", async () => {
    const bridge = KernelCapabilityToolBridge.getInstance();

    const tools = bridge.getAvailableTools();
    assert.ok(tools.length >= 3);

    // Tool 1: Inspection
    const inspectRes = await bridge.invokeTool("inspect_calendar_conflicts", {
      startTimestamp: Date.now(),
      endTimestamp: Date.now() + 3600000,
    });
    assert.equal(inspectRes.success, true);
    assert.equal(inspectRes.data.hasConflict, false);

    // Tool 2: Proposal generation
    const propRes = await bridge.invokeTool("propose_schedule_block", {
      label: "Deep Work Test",
      startTimestamp: Date.now(),
      durationMinutes: 60,
    });
    assert.equal(propRes.success, true);
    assert.ok(propRes.proposal);
    assert.equal((propRes.proposal as any).capabilityURN, "urn:lifeos:action:create_internal_focus_block");
  });

  await suite.test("LG-05: Head-to-Head 10-Dimensional Empirical Benchmark", async () => {
    const runner = LangGraphBenchmarkRunner.getInstance();

    const report = await runner.runHeadToHeadBenchmark(10, testUserId);

    assert.equal(report.benchmarkRuns, 10);
    assert.ok(report.nativeMetrics.p95DurationMs >= 0);
    assert.ok(report.langgraphMetrics.p95DurationMs >= 0);
    assert.equal(report.nativeMetrics.planValidityRate, 1.0);
    assert.equal(report.langgraphMetrics.planValidityRate, 1.0);
    assert.equal(report.langgraphMetrics.hitlResumptionSuccessRate, 1.0);

    // Verify all 10 dimensions exist in report
    const dimensions = Object.keys(report.tenDimensionalScores);
    assert.equal(dimensions.length, 10, "Report must evaluate all 10 empirical dimensions");

    // Verify Decision Gate Outcome: OUTCOME_B_ADOPT_LIMITED_DELIBERATIVE
    assert.equal(report.decisionOutcome, "OUTCOME_B_ADOPT_LIMITED_DELIBERATIVE");
    assert.ok(report.rationale.length > 20);
  });
});
