import test from "node:test";
import assert from "node:assert/strict";
import { OperationalTraceBuilder } from "../orchestration/observability/OperationalTrace";
import { DeterministicReplayEngine } from "../orchestration/observability/DeterministicReplayEngine";
import { ExecutionEventLedger } from "../orchestration/workspace/ExecutionEventLedger";
import { RoutingDecision } from "../orchestration/supervisor/DynamicRouter";
import { PolicyTier } from "../orchestration/synthesis/ConflictResolutionPolicy";

test("Phase 12 (TC-10): DeterministicReplayEngine replays event ledger to exact identical projection without LLM", () => {
  const executionId = "exec_replay_100";
  const ledger = new ExecutionEventLedger(executionId);

  // Record historical events
  ledger.append("AgentObservationProduced", "Productivity", {
    id: "obs_1",
    category: "Observation",
    source: "Productivity",
    timestamp: 1000,
    observedAt: 1000,
    payload: { task: "Review PR" },
  });

  ledger.append("ProposalCreated", "Productivity", {
    id: "act_1",
    domain: "productivity",
    actionType: "complete_task",
    payload: { taskId: "101" },
    rationale: "Task finished",
    reversibility: "reversible_with_compensation",
    idempotencyKey: "k_101",
  });

  ledger.append("SupervisorDecisionMade", "Supervisor", {
    decisionId: "dec_1",
    proposalId: "act_1",
    approved: true,
    executionOrder: 1,
    action: { id: "act_1", actionType: "complete_task" },
  });

  ledger.append("KernelActionExecuted", "Kernel", {
    actionId: "act_1",
    idempotencyKey: "k_101",
    actionType: "complete_task",
    status: "SUCCEEDED",
    success: true,
    timestamp: 1050,
  });

  // Replay #1
  const replay1 = DeterministicReplayEngine.replay(executionId, [...ledger.getEvents()]);

  // Replay #2 (out of order input to test deterministic sort)
  const shuffledEvents = [...ledger.getEvents()].reverse();
  const replay2 = DeterministicReplayEngine.replay(executionId, shuffledEvents);

  // Invariant 1: Projections match exactly
  assert.equal(replay1.projection.observations.length, 1);
  assert.equal(replay1.projection.proposals.length, 1);
  assert.equal(replay1.projection.decisions.length, 1);
  assert.equal(replay1.projection.kernelResults.length, 1);

  assert.deepEqual(replay1.projection, replay2.projection);
  assert.equal(replay1.isDeterministic, true);
});

test("Phase 12 (TC-16): OperationalTrace produces complete structured trace with ZERO chain-of-thought", () => {
  const executionId = "exec_trace_200";
  const ledger = new ExecutionEventLedger(executionId);

  ledger.append("WorkspaceInitialized", "Supervisor", { goal: "Plan weekly goals" });
  ledger.append("IterationStarted", "Supervisor", { iteration: 1 });

  const routingDecision: RoutingDecision = {
    strategy: "MULTI_AGENT",
    confidence: 0.9,
    rationale: "Multi-domain query",
  };

  const conflict = {
    conflictId: "cnf_1",
    contendingDomains: ["wellness" as const, "productivity" as const],
    description: "Rest vs Workload",
    dominantTier: PolicyTier.TIER_1_SAFETY_AND_RECOVERY,
    resolutionRationale: "Tier 1 precedence",
    acceptedProposals: [],
    suppressedProposals: [],
  };

  const kernelAction = {
    actionId: "act_1",
    idempotencyKey: "key_1",
    actionType: "apply_recovery_constraint" as const,
    status: "SUCCEEDED" as const,
    success: true,
    timestamp: Date.now(),
  };

  const trace = OperationalTraceBuilder.buildTrace(
    executionId,
    "user_obs_1",
    "I'm exhausted and need a plan",
    routingDecision,
    145,
    "GOAL_SATISFIED",
    ledger,
    [conflict],
    [kernelAction]
  );

  // Invariant 1: Structured trace contains operational facts
  assert.equal(trace.executionId, executionId);
  assert.equal(trace.routingDecision.strategy, "MULTI_AGENT");
  assert.equal(trace.conflicts.length, 1);
  assert.equal(trace.kernelActions.length, 1);
  assert.equal(trace.terminationReason, "GOAL_SATISFIED");
  assert.equal(trace.hasChainOfThought, false);

  // Invariant 2: Zero chain of thought markers
  const json = JSON.stringify(trace).toLowerCase();
  assert.equal(json.includes("thought:"), false);
  assert.equal(json.includes("<thought>"), false);
  assert.equal(json.includes("scratchpad"), false);
});

test("Phase 12: Chain-of-thought leak triggers security violation error", () => {
  const ledger = new ExecutionEventLedger("exec_bad");

  const routingDecision: RoutingDecision = {
    strategy: "MULTI_AGENT",
    confidence: 0.9,
    rationale: "Thought: Let's do some internal reasoning here", // LEAK!
  };

  assert.throws(
    () =>
      OperationalTraceBuilder.buildTrace(
        "exec_bad",
        "user_bad",
        "Test request",
        routingDecision,
        100,
        "GOAL_SATISFIED",
        ledger
      ),
    /\[SECURITY_VIOLATION\]: Chain-of-thought marker 'thought:' detected in operational trace!/
  );
});
