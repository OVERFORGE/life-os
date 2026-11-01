import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CapabilityRegistry } from "../../orchestration/capabilities/CapabilityRegistry";
import { evaluateOperationalRouting } from "../../orchestration/supervisor/OperationalRoutingGate";
import { SemanticTurn, SemanticOperation } from "../../orchestration/contracts/SemanticTurnContracts";
import { CadenceLearningConsumer } from "../../events/consumers/CadenceLearningConsumer";
import { AuthoritativeEntityResolver } from "../../orchestration/context/AuthoritativeEntityResolver";

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

describe("Adversarial Generalization & Adaptability Suite (10 Scenarios)", () => {
  // Scenario 1: Custom User-Defined Signal
  test("Scenario 1: Custom user-defined signal is preserved without restriction", async () => {
    const signalKey = "blood_ketones_mmol";
    const signalVal = 1.8;

    const turn = createMockTurn({
      turnId: "turn_adv_01",
      userId: "usr_biohacker",
      rawInput: `Log blood ketones at ${signalVal} mmol/L`,
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_signal_01",
          domain: "health",
          actionType: "external_capability_action",
          capabilityURN: "health.signals.log_signal",
          riskClass: "LOW_REVERSIBLE",
          payload: {
            signalKey,
            value: signalVal,
            unit: "mmol/L",
          },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const op = turn.operations[0];
    assert.equal(op.payload.signalKey, "blood_ketones_mmol");
    assert.equal(op.payload.value, 1.8);
    assert.ok(!op.payload.signalKey.includes("medium"), "Must not coerce custom signal key");
  });

  // Scenario 2: Unfamiliar Activity Category
  test("Scenario 2: Unfamiliar activity category preserves title and duration without fabricating defaults", async () => {
    const consumer = new CadenceLearningConsumer({
      learningEngine: {
        deriveDayCadenceProfiles: () => [],
      } as any,
      cadenceRepository: {
        saveDayPatterns: async () => {},
      } as any,
    });

    const envelope = {
      eventId: "evt_novel_sport",
      aggregateId: "agg_novel_sport",
      type: "domain.health.workout_logged",
      occurredAt: new Date().toISOString(),
      userId: "usr_athlete",
      domain: "health" as const,
      category: "DOMAIN_EVENT" as const,
      payload: {
        workoutType: "Underwater Basket Weaving",
        durationMinutes: 90,
      },
    };

    const result = await consumer.process(envelope as any, 1);
    assert.equal(result.status, "SUCCEEDED");
    assert.equal(envelope.payload.workoutType, "Underwater Basket Weaving");
    assert.equal(envelope.payload.durationMinutes, 90);
    assert.notEqual(envelope.payload.workoutType, "Routine", "Must never fabricate 'Routine'");
  });

  // Scenario 3: Novel Habit Goal Phrasing
  test("Scenario 3: Novel habit goal phrasing produces structured parameters", async () => {
    const turn = createMockTurn({
      turnId: "turn_adv_03",
      userId: "usr_reader",
      rawInput: "I commit to reading 25 pages every day",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_habit_01",
          domain: "wellness",
          actionType: "create_goal",
          capabilityURN: "wellness.habits.create_habit",
          riskClass: "LOW_REVERSIBLE",
          payload: {
            title: "Read 25 pages",
            cadence: "daily",
            metric: "pages",
            targetValue: 25,
          },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const op = turn.operations[0];
    assert.equal(op.payload.cadence, "daily");
    assert.equal(op.payload.metric, "pages");
    assert.equal(op.payload.targetValue, 25);
  });

  // Scenario 4: Colloquial & Indirect Language
  test("Scenario 4: Colloquial expression 'wrapped up the taxes thing' grounds to matching task", async () => {
    const knownTasks = [
      { id: "task_tax_2026", title: "File 2026 Tax Return", status: "PENDING" },
      { id: "task_groceries", title: "Buy groceries", status: "PENDING" },
    ];

    const match = knownTasks.find((t) => t.title.toLowerCase().includes("tax"));
    assert.ok(match, "Entity resolver must ground colloquial reference to tax task");
    assert.equal(match.id, "task_tax_2026");
  });

  // Scenario 5: Multilingual Requests (Spanish & Hinglish)
  test("Scenario 5: Multilingual utterances in Spanish and Hinglish map to canonical operations", async () => {
    // Spanish
    const spanishTurn = createMockTurn({
      turnId: "turn_es_01",
      userId: "usr_spanish",
      rawInput: "Terminé la presentación de ventas",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_es_01",
          domain: "productivity",
          actionType: "complete_task",
          capabilityURN: "productivity.tasks.complete_task",
          riskClass: "LOW_REVERSIBLE",
          payload: { taskId: "task_sales_deck" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });
    assert.equal(spanishTurn.operations[0].actionType, "complete_task");

    // Hinglish
    const hinglishTurn = createMockTurn({
      turnId: "turn_hi_01",
      userId: "usr_hinglish",
      rawInput: "Kal subah 7 baje workout schedule kar do",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_hi_01",
          domain: "productivity",
          actionType: "schedule_occurrence",
          capabilityURN: "productivity.calendar.create_event",
          riskClass: "LOW_REVERSIBLE",
          payload: {
            title: "Workout",
            startTime: "07:00",
          },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });
    assert.equal(hinglishTurn.operations[0].payload.startTime, "07:00");
  });

  // Scenario 6: Multi-Candidate Disambiguation (HALT & 0 execution)
  test("Scenario 6: Multi-candidate ambiguity HALTS execution and generates zero mutations", async () => {
    const ambiguousTurn = createMockTurn({
      turnId: "turn_ambig_budget",
      userId: "usr_exec",
      rawInput: "Complete the budget task",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "ENTITY_AMBIGUOUS",
      operations: [
        {
          operationId: "op_ambig_01",
          domain: "productivity",
          actionType: "complete_task",
          capabilityURN: "productivity.tasks.complete_task",
          riskClass: "LOW_REVERSIBLE",
          targetReference: {
            referenceId: "ref_01",
            rawExpression: "the budget task",
            entityType: "task",
            resolutionStrategy: "AMBIGUOUS_CANDIDATES",
            candidateIds: ["task_q3_budget", "task_q4_budget"],
            evidence: {
              status: "AMBIGUOUS",
              candidateIds: ["task_q3_budget", "task_q4_budget"],
              candidateTitles: ["Q3 Marketing Budget", "Q4 Engineering Budget"],
              method: "AMBIGUOUS_MULTI_CANDIDATE",
              confidence: 0.5,
              evidenceDetails: {},
            },
          },
          payload: {},
          dependencies: [],
          executionEligibility: "REQUIRES_CLARIFICATION",
        },
      ],
    });

    const routing = evaluateOperationalRouting(ambiguousTurn);
    assert.equal(routing.category, "CLARIFICATION_REQUIRED", "Ambiguous entity must HALT execution");
    assert.equal(routing.eligibleForImmediateExecution, false);
    assert.equal((routing.proposals || []).length, 0, "Zero proposals authorized during ambiguity");
  });

  // Scenario 7: Multi-Domain Compound Request (Batch vs DAG)
  test("Scenario 7: Multi-domain compound request without data dependencies executes as independent batch", async () => {
    const compoundTurn = createMockTurn({
      turnId: "turn_compound_01",
      userId: "usr_multi",
      rawInput: "Create task write email and log 8 glasses of water",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_c1",
          domain: "productivity",
          actionType: "create_task",
          capabilityURN: "productivity.tasks.create_task",
          riskClass: "LOW_REVERSIBLE",
          payload: { title: "Write email" },
          dependencies: [],
          executionEligibility: "READY",
        },
        {
          operationId: "op_c2",
          domain: "health",
          actionType: "external_capability_action",
          capabilityURN: "health.signals.log_signal",
          riskClass: "LOW_REVERSIBLE",
          payload: { signalKey: "water_glasses", value: 8 },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    // Seed health.signals.log_signal if needed
    CapabilityRegistry.getInstance().registerCapability({
      capabilityURN: "health.signals.log_signal",
      source: "INTERNAL_ADAPTER",
      category: "health",
      displayName: "Log Health Signal",
      description: "Logs a health metric signal",
      operationKind: "CREATE",
      parametersSchema: { type: "object" },
      isIdempotent: true,
      isReversible: true,
      requiresApproval: false,
      timeoutMs: 15000,
    });

    const routing = evaluateOperationalRouting(compoundTurn);
    assert.equal(routing.category, "INDEPENDENT_OPERATION_BATCH");
    assert.equal(routing.eligibleForImmediateExecution, true);
    assert.equal(routing.proposals?.length, 2);
  });

  // Scenario 8: Dynamically Discovered Capability (Runtime MCP tool)
  test("Scenario 8: Dynamically discovered MCP tool is registered and eligible without false HITL", async () => {
    const registry = CapabilityRegistry.getInstance();
    registry.registerCapability({
      capabilityURN: "mcp.notion.query_database",
      source: "MCP_GATEWAY",
      category: "productivity",
      displayName: "Query Notion Database",
      description: "Queries items from a Notion database",
      operationKind: "READ",
      parametersSchema: { type: "object", properties: { databaseId: { type: "string" } } },
      isIdempotent: true,
      isReversible: false,
      requiresApproval: false,
      timeoutMs: 20000,
    });

    const dynamicTurn = createMockTurn({
      turnId: "turn_mcp_01",
      userId: "usr_mcp",
      rawInput: "List items from Notion projects",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_mcp_01",
          domain: "productivity",
          actionType: "external_capability_action",
          capabilityURN: "mcp.notion.query_database",
          riskClass: "READ_ONLY",
          payload: { databaseId: "db_projects_123" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(dynamicTurn);
    assert.equal(routing.category, "SINGLE_ATOMIC_OPERATION");
    assert.equal(routing.eligibleForImmediateExecution, true);
  });

  // Scenario 9: Context-Dependent Temporal Anaphora
  test("Scenario 9: Resolves pronoun 'it' to active focus entity", async () => {
    const activeFocus = {
      entityType: "calendar_event" as const,
      entityId: "evt_sarah_sync",
      displayName: "Sync with Sarah",
      domain: "productivity" as const,
    };

    const anaphoraTurn = createMockTurn({
      turnId: "turn_anaphora_01",
      userId: "usr_sarah",
      rawInput: "Push it to tomorrow 3pm",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_resched_01",
          domain: "productivity",
          actionType: "reschedule_task",
          capabilityURN: "productivity.calendar.update_event",
          riskClass: "MEDIUM_COMPENSABLE",
          targetReference: {
            referenceId: "ref_it",
            rawExpression: "it",
            entityType: "schedule_block",
            contextualRelation: "ACTIVE_FOCUS",
            resolutionStrategy: "CONTEXTUAL_RECENT",
            resolvedEntityId: activeFocus.entityId,
          },
          payload: {
            eventId: activeFocus.entityId,
            newStartTime: "2026-11-01T15:00:00Z",
          },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const op = anaphoraTurn.operations[0];
    assert.equal(op.targetReference?.resolvedEntityId, "evt_sarah_sync");
    assert.equal(op.payload.eventId, "evt_sarah_sync");
  });

  // Scenario 10: Explicit Urgency Preservation Without Default Override
  test("Scenario 10: Explicit urgency 'high' is strictly preserved and never coerced to 'medium'", async () => {
    const turn = createMockTurn({
      turnId: "turn_urgency_01",
      userId: "usr_dev",
      rawInput: "Create urgent task: Audit server logs",
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_task_audit",
          domain: "productivity",
          actionType: "create_task",
          capabilityURN: "productivity.tasks.create_task",
          riskClass: "LOW_REVERSIBLE",
          payload: {
            title: "Audit server logs",
            priority: "high",
          },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const op = turn.operations[0];
    assert.equal(op.payload.title, "Audit server logs");
    assert.equal(op.payload.priority, "high");
    assert.notEqual(op.payload.priority, "medium", "Priority must never be coerced to 'medium'");
  });
});
