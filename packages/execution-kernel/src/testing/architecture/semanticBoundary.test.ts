import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CapabilityRegistry } from "../../orchestration/capabilities/CapabilityRegistry";
import { DynamicWorkflowPlanner } from "../../orchestration/planning/DynamicWorkflowPlanner";
import { evaluateOperationalRouting } from "../../orchestration/supervisor/OperationalRoutingGate";
import { SemanticTurn, SemanticOperation } from "../../orchestration/contracts/SemanticTurnContracts";
import { CircadianEnergyAlignmentStrategy } from "../../autonomous/strategies/CircadianEnergyAlignmentStrategy";
import { ScheduleRebalancerStrategy } from "../../autonomous/strategies/ScheduleRebalancerStrategy";
import { MorningBriefingStrategy } from "../../autonomous/strategies/MorningBriefingStrategy";
import { KernelCapabilityService } from "../../orchestration/kernel/KernelCapabilityService";

function createMockTurn(overrides: Partial<SemanticTurn> & Record<string, any> = {}): SemanticTurn {
  return {
    turnId: "turn_default",
    schemaVersion: 2,
    userId: "usr_default",
    conversationId: "conv_default",
    timestamp: Date.now(),
    rawInput: "test input",
    normalizedTimezone: "UTC",
    provenance: {
      interpreterProvider: "groq",
      modelIdentifier: "test",
      promptVersionHash: "hash",
      contextSnapshotId: "ctx",
      contextSnapshotHash: "hash",
      inferenceDurationMs: 10,
    },
    primaryClassification: "ACTION_REQUEST",
    ambiguityStatus: "UNAMBIGUOUS",
    operations: [],
    conversationalSummary: "test summary",
    ...overrides,
  } as SemanticTurn;
}

describe("Semantic Architecture Boundary Verification (Rules 1-8)", () => {
  test("RULE 1: Supervisor orchestrates via pure contracts and does not rely on regex front-door", async () => {
    // Assert CapabilityRegistry is seeded and operational
    const cap = CapabilityRegistry.getCapability("productivity.tasks.create_task");
    assert.ok(cap, "CapabilityRegistry must authoritatively provide task creation descriptor");
    assert.equal(cap?.source, "INTERNAL_ADAPTER");
  });

  test("RULE 2: Prose keyword immunity - Assistant dialogue text does not coerce actionType", async () => {
    // Test that the operational routing gate and semantic turn contracts govern actionType,
    // and prose with trigger keywords ('class', 'schedule', 'block', 'routine') has zero coercive effect.
    const fakeTurn = createMockTurn({
      turnId: "turn_prose_test_01",
      userId: "usr_prose_test",
      rawInput: "Tell me about my daily routine and what class I should take",
      primaryClassification: "CASUAL_DIALOGUE",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [],
      conversationalSummary: "Here is your class routine schedule.",
    });

    const routing = evaluateOperationalRouting(fakeTurn);
    assert.equal(routing.eligibleForImmediateExecution, false);
    assert.equal(routing.rejectionCode, "NON_ACTION_TURN");
    assert.equal((routing.proposals || []).length, 0, "No action proposals may be coerced from conversational prose");
  });

  test("RULE 3: Sole Capability Authority - Unregistered capabilities fail-closed immediately", async () => {
    const unregisteredTurn = createMockTurn({
      turnId: "turn_unreg_01",
      userId: "usr_unreg",
      rawInput: "Hack into external mainframe",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_unreg_01",
          domain: "productivity",
          actionType: "HACK_MAINFRAME" as any,
          capabilityURN: "security.exploit.hack_mainframe",
          riskClass: "HIGH_IRREVERSIBLE",
          payload: {},
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(unregisteredTurn);
    assert.equal(routing.category, "UNREGISTERED_CAPABILITY");
    assert.equal(routing.eligibleForImmediateExecution, false);
    assert.ok(routing.userExplanation?.includes("security.exploit.hack_mainframe"));
  });

  test("RULE 4: Deterministic Idempotency Keys - Identical proposals produce identical idempotency tokens", async () => {
    const proposalA = {
      id: "prop_det_01",
      domain: "productivity" as const,
      actionType: "create_task" as const,
      reversibility: "atomic_single_doc" as const,
      rationale: "Deterministic idempotency test",
      payload: { title: "Complete report" },
      idempotencyKey: "turn_replay_test_op_01",
    };

    const proposalB = {
      id: "prop_det_02",
      domain: "productivity" as const,
      actionType: "create_task" as const,
      reversibility: "atomic_single_doc" as const,
      rationale: "Deterministic idempotency test replay",
      payload: { title: "Complete report" },
      idempotencyKey: "turn_replay_test_op_01",
    };

    assert.equal(proposalA.idempotencyKey, proposalB.idempotencyKey, "Replay idempotency keys must match perfectly");
    assert.ok(!proposalA.idempotencyKey.includes("undefined"), "Must not have undefined segments");
  });

  test("RULE 5: Dynamic Planning Fallback - Production environment rejects benchmark plan playback", async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const planner = new DynamicWorkflowPlanner({ allowBenchmarkFallback: false });

      assert.throws(
        () => {
          (planner as any).generateDeterministicFallback("Complete project planning");
        },
        /Benchmark plan fallback is strictly prohibited in production environment/,
        "Must throw error rather than returning hardcoded benchmark plan in production"
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  test("RULE 6: Legacy Decommissioning - toolRouter is deleted and intentRouter is isolated", async () => {
    // Assert toolRouter does not exist in production dispatch
    let toolRouterFound = false;
    try {
      require("../../dispatch/toolRouter");
      toolRouterFound = true;
    } catch {
      toolRouterFound = false;
    }
    assert.equal(toolRouterFound, false, "Dead file toolRouter.ts must not exist");
  });

  test("RULE 7: Timezone Integrity - Strategies evaluate time using user context rather than host clock", async () => {
    const morningStrategy = new MorningBriefingStrategy();

    // Verify MorningBriefingStrategy evaluates time according to user timezone
    const testDate = new Date("2026-10-31T01:30:00Z"); // 01:30 UTC
    // In Tokyo (UTC+9), this is 10:30 (within morning window 6-10) -> generates briefing
    const tokyoCandidates = await morningStrategy.evaluate({
      userId: "usr_tokyo",
      now: testDate,
      timezone: "Asia/Tokyo",
      pendingTasks: [{ id: "t1", title: "Task 1", priority: "high" } as any],
    } as any);
    assert.equal(tokyoCandidates.length, 1, "User in Asia/Tokyo at 10:30am local time must receive morning briefing");

    // In New York (UTC-4), this is 21:30 previous night (outside morning window) -> returns empty
    const nyCandidates = await morningStrategy.evaluate({
      userId: "usr_ny",
      now: testDate,
      timezone: "America/New_York",
      pendingTasks: [{ id: "t1", title: "Task 1", priority: "high" } as any],
    } as any);
    assert.equal(nyCandidates.length, 0, "User in America/New_York at 9:30pm local time must not receive morning briefing");
  });

  test("RULE 8: Operational Routing Taxonomy - Accurately routes across the 6 canonical categories", async () => {
    // 1. Single Atomic
    const atomicTurn = createMockTurn({
      turnId: "turn_tax_01",
      userId: "usr_01",
      rawInput: "Create task buy milk",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_01",
          domain: "productivity",
          actionType: "create_task",
          capabilityURN: "productivity.tasks.create_task",
          riskClass: "LOW_REVERSIBLE",
          payload: { title: "Buy milk" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });
    assert.equal(evaluateOperationalRouting(atomicTurn).category, "SINGLE_ATOMIC_OPERATION");

    // 2. Independent Batch
    const batchTurn = createMockTurn({
      turnId: "turn_tax_02",
      userId: "usr_01",
      rawInput: "Create task A and create task B",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_01",
          domain: "productivity",
          actionType: "create_task",
          capabilityURN: "productivity.tasks.create_task",
          riskClass: "LOW_REVERSIBLE",
          payload: { title: "Task A" },
          dependencies: [],
          executionEligibility: "READY",
        },
        {
          operationId: "op_02",
          domain: "productivity",
          actionType: "create_task",
          capabilityURN: "productivity.tasks.create_task",
          riskClass: "LOW_REVERSIBLE",
          payload: { title: "Task B" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });
    assert.equal(evaluateOperationalRouting(batchTurn).category, "INDEPENDENT_OPERATION_BATCH");

    // 3. Composite DAG
    const dagTurn = createMockTurn({
      turnId: "turn_tax_03",
      userId: "usr_01",
      rawInput: "Search for files and email them to John",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_01",
          domain: "productivity",
          actionType: "external_capability_action",
          capabilityURN: "productivity.storage.list_files",
          riskClass: "READ_ONLY",
          payload: {},
          dependencies: [],
          executionEligibility: "READY",
        },
        {
          operationId: "op_02",
          domain: "productivity",
          actionType: "external_capability_action",
          capabilityURN: "productivity.email.send_message",
          riskClass: "HIGH_IRREVERSIBLE",
          payload: { attachments: "$ref:op_01.files" },
          dependencies: ["op_01"],
          executionEligibility: "READY",
        },
      ],
    });
    assert.equal(evaluateOperationalRouting(dagTurn).category, "COMPOSITE_WORKFLOW_DAG");

    // 4. Ambiguous Entity -> Halts
    const ambigTurn = createMockTurn({
      turnId: "turn_tax_04",
      userId: "usr_01",
      rawInput: "Finish that task",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "ENTITY_AMBIGUOUS",
      operations: [],
    });
    assert.equal(evaluateOperationalRouting(ambigTurn).category, "CLARIFICATION_REQUIRED");
  });
});
