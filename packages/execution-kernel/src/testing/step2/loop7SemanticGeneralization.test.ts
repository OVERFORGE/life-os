import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CapabilityRegistry } from "../../orchestration/capabilities/CapabilityRegistry";
import { evaluateOperationalRouting } from "../../orchestration/supervisor/OperationalRoutingGate";
import { SemanticTurn, SemanticOperation } from "../../orchestration/contracts/SemanticTurnContracts";
import { AuthoritativeEntityResolver } from "../../orchestration/context/AuthoritativeEntityResolver";

function createMockTurn(overrides: Partial<SemanticTurn> & Record<string, any> = {}): SemanticTurn {
  return {
    turnId: "turn_default",
    schemaVersion: 2,
    userId: "usr_test_eval",
    conversationId: "conv_test_eval",
    timestamp: Date.now(),
    rawInput: "test input",
    normalizedTimezone: "UTC",
    provenance: {
      interpreterProvider: "groq",
      modelIdentifier: "llama-3.3-70b",
      promptVersionHash: "hash_v2",
      contextSnapshotId: "ctx_01",
      contextSnapshotHash: "ctx_hash_01",
      inferenceDurationMs: 15,
    },
    primaryClassification: "ACTION_REQUEST",
    ambiguityStatus: "UNAMBIGUOUS",
    operations: [],
    conversationalSummary: "test summary",
    ...overrides,
  } as SemanticTurn;
}

describe("Step 2 — Loop 7 Part A: Semantic Behavioral Generalization (15 Held-Out Categories)", () => {
  // Category 1: Unseen Natural-Language Phrasing
  test("Category 1: Unseen natural-language phrasing ('Knock out the pitch deck') grounds to task", async () => {
    const knownTasks = [
      { id: "task_pitch_deck", title: "Finalize Pitch Deck for Investors" },
      { id: "task_groceries", title: "Buy groceries" },
    ];

    const turn = createMockTurn({
      turnId: "turn_gen_cat1",
      rawInput: "Knock out the pitch deck",
      operations: [
        {
          operationId: "op_c1_01",
          domain: "productivity",
          actionType: "complete_task",
          capabilityURN: "productivity.tasks.complete_task",
          riskClass: "LOW_REVERSIBLE",
          targetReference: {
            referenceId: "ref_01",
            rawExpression: "the pitch deck",
            entityType: "task",
            resolutionStrategy: "EXPLICIT_ID",
            resolvedEntityId: "task_pitch_deck",
          },
          payload: { taskId: "task_pitch_deck" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(turn);
    assert.equal(routing.category, "SINGLE_ATOMIC_OPERATION");
    assert.equal(routing.eligibleForImmediateExecution, true);
    assert.equal(routing.proposals?.[0].payload.taskId, "task_pitch_deck");
  });

  // Category 2: Slang and Colloquial Expressions
  test("Category 2: Slang expression ('Bailed on the sprint retro') maps cleanly without keyword coercion", async () => {
    const turn = createMockTurn({
      turnId: "turn_gen_cat2",
      rawInput: "Bailed on the sprint retro meeting",
      operations: [
        {
          operationId: "op_c2_01",
          domain: "productivity",
          actionType: "delete_task",
          capabilityURN: "delete_task",
          riskClass: "MEDIUM_COMPENSABLE",
          payload: { taskId: "task_sprint_retro" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const op = turn.operations[0];
    assert.equal(op.actionType, "delete_task");
    assert.equal(op.payload.taskId, "task_sprint_retro");
  });

  // Category 3: Custom User-Created Signals
  test("Category 3: Custom user-created signals (focus_depth, hydration_level) are preserved verbatim", async () => {
    CapabilityRegistry.getInstance().registerCapability({
      capabilityURN: "health.signals.log_signal",
      source: "INTERNAL_ADAPTER",
      category: "health",
      displayName: "Log Health Signal",
      description: "Logs a custom health or productivity signal",
      operationKind: "CREATE",
      parametersSchema: { type: "object" },
      isIdempotent: true,
      isReversible: true,
      requiresApproval: false,
      timeoutMs: 15000,
    });

    const customMetrics = [
      { key: "focus_depth", val: 8.5, unit: "index_10" },
      { key: "hydration_level", val: 2400, unit: "ml" },
      { key: "meditation_minutes", val: 20, unit: "minutes" },
      { key: "deep_work_quality", val: 9, unit: "score" },
    ];

    for (const metric of customMetrics) {
      const turn = createMockTurn({
        turnId: `turn_signal_${metric.key}`,
        rawInput: `Track ${metric.key} at ${metric.val} ${metric.unit}`,
        operations: [
          {
            operationId: `op_${metric.key}`,
            domain: "health",
            actionType: "external_capability_action",
            capabilityURN: "health.signals.log_signal",
            riskClass: "LOW_REVERSIBLE",
            payload: {
              signalKey: metric.key,
              value: metric.val,
              unit: metric.unit,
            },
            dependencies: [],
            executionEligibility: "READY",
          },
        ],
      });

      const routing = evaluateOperationalRouting(turn);
      assert.equal(routing.category, "SINGLE_ATOMIC_OPERATION");
      assert.equal(turn.operations[0].payload.signalKey, metric.key);
      assert.equal(turn.operations[0].payload.value, metric.val);
    }
  });

  // Category 4: Unknown But Valid Entity Names
  test("Category 4: Entity names containing domain keywords ('Project Borealis: Review Goal Setting Paper') are preserved", async () => {
    const novelTitle = "Project Borealis: Review Goal Setting Paper";
    const turn = createMockTurn({
      turnId: "turn_gen_cat4",
      rawInput: `Create task: ${novelTitle}`,
      operations: [
        {
          operationId: "op_borealis_01",
          domain: "productivity",
          actionType: "create_task",
          capabilityURN: "productivity.tasks.create_task",
          riskClass: "LOW_REVERSIBLE",
          payload: {
            title: novelTitle,
            description: "Deep dive on research paper",
          },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(turn);
    assert.equal(routing.category, "SINGLE_ATOMIC_OPERATION");
    assert.equal(turn.operations[0].payload.title, novelTitle);
    assert.equal(turn.operations[0].actionType, "create_task", "Must not be coerced to goal creation by keyword 'Goal'");
  });

  // Category 5: New Domain Categories
  test("Category 5: New domain categories ('Meditative Rucking') preserve activity without default fabrication", async () => {
    CapabilityRegistry.getInstance().registerCapability({
      capabilityURN: "health.workouts.log_workout",
      source: "INTERNAL_ADAPTER",
      category: "health",
      displayName: "Log Workout",
      description: "Logs a physical workout session",
      operationKind: "CREATE",
      parametersSchema: { type: "object" },
      isIdempotent: true,
      isReversible: true,
      requiresApproval: false,
      timeoutMs: 15000,
    });

    const turn = createMockTurn({
      turnId: "turn_gen_cat5",
      rawInput: "Logged 45 min of Meditative Rucking in the woods",
      operations: [
        {
          operationId: "op_rucking_01",
          domain: "health",
          actionType: "external_capability_action",
          capabilityURN: "health.workouts.log_workout",
          riskClass: "LOW_REVERSIBLE",
          payload: {
            workoutType: "Meditative Rucking",
            durationMinutes: 45,
            notes: "in the woods",
          },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(turn);
    assert.equal(routing.category, "SINGLE_ATOMIC_OPERATION");
    assert.equal(turn.operations[0].payload.workoutType, "Meditative Rucking");
    assert.notEqual(turn.operations[0].payload.workoutType, "Routine");
  });

  // Category 6: Hinglish Input
  test("Category 6: Hinglish input ('Gym session log karo 45 mins ke liye') maps to canonical parameters", async () => {
    const turn = createMockTurn({
      turnId: "turn_gen_cat6",
      rawInput: "Gym session log karo 45 mins ke liye",
      operations: [
        {
          operationId: "op_hinglish_01",
          domain: "health",
          actionType: "external_capability_action",
          capabilityURN: "health.workouts.log_workout",
          riskClass: "LOW_REVERSIBLE",
          payload: {
            workoutType: "Gym Session",
            durationMinutes: 45,
          },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(turn);
    assert.equal(routing.category, "SINGLE_ATOMIC_OPERATION");
    assert.equal(turn.operations[0].payload.durationMinutes, 45);
  });

  // Category 7: Multilingual Input (Spanish, French, German)
  test("Category 7: Multilingual requests in Spanish, French, and German map cleanly to operations", async () => {
    // Spanish
    const esTurn = createMockTurn({
      turnId: "turn_es_comp",
      rawInput: "Terminé la presentación de ventas",
      operations: [
        {
          operationId: "op_es_01",
          domain: "productivity",
          actionType: "complete_task",
          capabilityURN: "productivity.tasks.complete_task",
          riskClass: "LOW_REVERSIBLE",
          payload: { taskId: "task_ventas" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });
    assert.equal(evaluateOperationalRouting(esTurn).category, "SINGLE_ATOMIC_OPERATION");

    // French
    const frTurn = createMockTurn({
      turnId: "turn_fr_create",
      rawInput: "Créer une tâche pour préparer le rapport trimestriel",
      operations: [
        {
          operationId: "op_fr_01",
          domain: "productivity",
          actionType: "create_task",
          capabilityURN: "productivity.tasks.create_task",
          riskClass: "LOW_REVERSIBLE",
          payload: { title: "Préparer le rapport trimestriel" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });
    assert.equal(evaluateOperationalRouting(frTurn).category, "SINGLE_ATOMIC_OPERATION");

    // German
    const deTurn = createMockTurn({
      turnId: "turn_de_create",
      rawInput: "Erstelle eine neue Aufgabe: Architektur überprüfen",
      operations: [
        {
          operationId: "op_de_01",
          domain: "productivity",
          actionType: "create_task",
          capabilityURN: "productivity.tasks.create_task",
          riskClass: "LOW_REVERSIBLE",
          payload: { title: "Architektur überprüfen" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });
    assert.equal(evaluateOperationalRouting(deTurn).category, "SINGLE_ATOMIC_OPERATION");
  });

  // Category 8: Contextual References
  test("Category 8: Contextual temporal anaphora ('Complete that task I made yesterday') grounds correctly", async () => {
    const candidateTasks = [
      { id: "task_yesterday_tax", title: "Review corporate tax documents" },
      { id: "task_today_lunch", title: "Order team lunch" },
    ];

    const turn = createMockTurn({
      turnId: "turn_gen_cat8",
      rawInput: "Complete that task I made yesterday",
      operations: [
        {
          operationId: "op_ctx_yesterday",
          domain: "productivity",
          actionType: "complete_task",
          capabilityURN: "productivity.tasks.complete_task",
          riskClass: "LOW_REVERSIBLE",
          targetReference: {
            referenceId: "ref_yest",
            rawExpression: "that task I made yesterday",
            entityType: "task",
            resolutionStrategy: "CONTEXTUAL_RECENT",
            resolvedEntityId: candidateTasks[0].id,
            evidence: {
              status: "RESOLVED",
              candidateIds: [candidateTasks[0].id],
              candidateTitles: [candidateTasks[0].title],
              method: "AUTHORITATIVE_CONTEXTUAL_MATCH",
              confidence: 0.95,
              evidenceDetails: {},
            },
          },
          payload: { taskId: candidateTasks[0].id },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(turn);
    assert.equal(routing.category, "SINGLE_ATOMIC_OPERATION");
    assert.equal(routing.proposals?.[0].payload.taskId, "task_yesterday_tax");
  });

  // Category 9: Pronouns and References to Previous Entities
  test("Category 9: Resolves pronoun 'it' to active focus entity without ambiguity", async () => {
    const activeFocus = {
      entityType: "task" as const,
      entityId: "task_active_sprint_plan",
      displayName: "Sprint Planning Session",
      domain: "productivity" as const,
    };

    const turn = createMockTurn({
      turnId: "turn_gen_cat9",
      rawInput: "Mark it as done",
      operations: [
        {
          operationId: "op_pronoun_it",
          domain: "productivity",
          actionType: "complete_task",
          capabilityURN: "productivity.tasks.complete_task",
          riskClass: "LOW_REVERSIBLE",
          targetReference: {
            referenceId: "ref_it",
            rawExpression: "it",
            entityType: "task",
            resolutionStrategy: "CONTEXTUAL_RECENT",
            contextualRelation: "ACTIVE_FOCUS",
            resolvedEntityId: activeFocus.entityId,
          },
          payload: { taskId: activeFocus.entityId },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(turn);
    assert.equal(routing.category, "SINGLE_ATOMIC_OPERATION");
    assert.equal(routing.proposals?.[0].payload.taskId, "task_active_sprint_plan");
  });

  // Category 10: Multiple Intents in One Request
  test("Category 10: Multiple independent intents execute as INDEPENDENT_OPERATION_BATCH", async () => {
    const turn = createMockTurn({
      turnId: "turn_gen_cat10",
      rawInput: "Log a 30 min workout and complete the morning routine task",
      operations: [
        {
          operationId: "op_multi_01",
          domain: "health",
          actionType: "external_capability_action",
          capabilityURN: "health.workouts.log_workout",
          riskClass: "LOW_REVERSIBLE",
          payload: { workoutType: "Cardio", durationMinutes: 30 },
          dependencies: [],
          executionEligibility: "READY",
        },
        {
          operationId: "op_multi_02",
          domain: "productivity",
          actionType: "complete_task",
          capabilityURN: "productivity.tasks.complete_task",
          riskClass: "LOW_REVERSIBLE",
          payload: { taskId: "task_morning_routine" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(turn);
    assert.equal(routing.category, "INDEPENDENT_OPERATION_BATCH");
    assert.equal(routing.eligibleForImmediateExecution, true);
    assert.equal(routing.proposals?.length, 2);
  });

  // Category 11: Ambiguous Requests (Halt Execution & 0 Mutations)
  test("Category 11: Materially ambiguous request halts execution with zero mutations authorized", async () => {
    const turn = createMockTurn({
      turnId: "turn_gen_cat11",
      rawInput: "Complete the budget task",
      ambiguityStatus: "ENTITY_AMBIGUOUS",
      operations: [
        {
          operationId: "op_ambig_budget",
          domain: "productivity",
          actionType: "complete_task",
          capabilityURN: "productivity.tasks.complete_task",
          riskClass: "LOW_REVERSIBLE",
          targetReference: {
            referenceId: "ref_ambig",
            rawExpression: "the budget task",
            entityType: "task",
            resolutionStrategy: "AMBIGUOUS_CANDIDATES",
            candidateIds: ["task_q3_budget", "task_q4_budget"],
            evidence: {
              status: "AMBIGUOUS",
              candidateIds: ["task_q3_budget", "task_q4_budget"],
              candidateTitles: ["Q3 Budget Review", "Q4 Forecast Budget"],
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
      clarification: {
        required: true,
        questionToUser: "Did you mean the Q3 Budget Review or the Q4 Forecast Budget?",
      },
    });

    const routing = evaluateOperationalRouting(turn);
    assert.equal(routing.category, "CLARIFICATION_REQUIRED");
    assert.equal(routing.eligibleForImmediateExecution, false);
    assert.equal((routing.proposals || []).length, 0, "Must authorize ZERO proposals during ambiguity");
    assert.ok(routing.clarificationQuestion?.includes("Q3 Budget Review"));
  });

  // Category 12: Missing Contextual Information
  test("Category 12: Missing required payload parameters fails closed to CLARIFICATION_REQUIRED", async () => {
    const turn = createMockTurn({
      turnId: "turn_gen_cat12",
      rawInput: "Create a task for me",
      ambiguityStatus: "UNAMBIGUOUS",
      operations: [
        {
          operationId: "op_missing_params",
          domain: "productivity",
          actionType: "create_task",
          capabilityURN: "productivity.tasks.create_task",
          riskClass: "LOW_REVERSIBLE",
          payload: {}, // Missing required 'title'
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(turn);
    assert.equal(routing.category, "CLARIFICATION_REQUIRED");
    assert.equal(routing.eligibleForImmediateExecution, false);
    assert.equal(routing.rejectionCode, "MISSING_REQUIRED_PAYLOAD");
  });

  // Category 13: Corrections and Changes of Intent
  test("Category 13: Explicit user corrections safely update payload values", async () => {
    const turn = createMockTurn({
      turnId: "turn_gen_cat13",
      rawInput: "Actually wait, reschedule the sync to 4pm instead of 3pm",
      operations: [
        {
          operationId: "op_correction_01",
          domain: "productivity",
          actionType: "update_task",
          capabilityURN: "update_task",
          riskClass: "LOW_REVERSIBLE",
          payload: {
            taskId: "task_sync_session",
            dueDate: "2026-11-01T16:00:00Z",
          },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(turn);
    assert.equal(routing.category, "SINGLE_ATOMIC_OPERATION");
    assert.equal(turn.operations[0].payload.dueDate, "2026-11-01T16:00:00Z");
  });

  // Category 14: Urgency and Priority Changes
  test("Category 14: Explicit urgency 'high' is preserved without coercion to 'medium'", async () => {
    const turn = createMockTurn({
      turnId: "turn_gen_cat14",
      rawInput: "Add urgent high-priority task: Fix security vulnerability",
      operations: [
        {
          operationId: "op_vuln_task",
          domain: "productivity",
          actionType: "create_task",
          capabilityURN: "productivity.tasks.create_task",
          riskClass: "LOW_REVERSIBLE",
          payload: {
            title: "Fix security vulnerability",
            priority: "high",
          },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(turn);
    assert.equal(routing.category, "SINGLE_ATOMIC_OPERATION");
    assert.equal(turn.operations[0].payload.priority, "high");
    assert.notEqual(turn.operations[0].payload.priority, "medium");
  });

  // Category 15: Dynamic Capability Discovery
  test("Category 15: Dynamically registered runtime tool routes as SINGLE_ATOMIC_OPERATION", async () => {
    const registry = CapabilityRegistry.getInstance();
    registry.registerCapability({
      capabilityURN: "mcp.weather.get_current_conditions",
      source: "MCP_GATEWAY",
      category: "environment",
      displayName: "Get Current Weather Conditions",
      description: "Fetches live weather conditions via MCP",
      operationKind: "READ",
      parametersSchema: {
        type: "object",
        properties: { location: { type: "string" } },
        required: ["location"],
      },
      isIdempotent: true,
      isReversible: false,
      requiresApproval: false,
      timeoutMs: 10000,
    });

    const turn = createMockTurn({
      turnId: "turn_gen_cat15",
      rawInput: "Check the weather in Tokyo",
      operations: [
        {
          operationId: "op_weather_tokyo",
          domain: "productivity",
          actionType: "external_capability_action",
          capabilityURN: "mcp.weather.get_current_conditions",
          riskClass: "READ_ONLY",
          payload: { location: "Tokyo" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const routing = evaluateOperationalRouting(turn);
    assert.equal(routing.category, "SINGLE_ATOMIC_OPERATION");
    assert.equal(routing.eligibleForImmediateExecution, true);
    assert.equal(routing.proposals?.[0].payload.location, "Tokyo");
  });
});
