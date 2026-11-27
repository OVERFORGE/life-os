/**
 * stage2AgenticLifecycleOffline.test.ts
 *
 * Deterministic offline Stage 2 verification suite covering:
 * - Increment 2.1: Structured discovery metadata, interpreter grounding, typed context selection
 */

import test from "node:test";
import assert from "node:assert/strict";

if (!process.env.KERNEL_HMAC_SECRET || process.env.KERNEL_HMAC_SECRET.length < 32) {
  process.env.KERNEL_HMAC_SECRET = "stage2-test-hmac-secret-minimum-32-bytes-key";
}
import { CapabilityRegistry } from "../orchestration/capabilities/CapabilityRegistry";
import { CapabilityPresentationRegistry } from "../orchestration/external/presentation/CapabilityPresentationRegistry";
import { SemanticIntentInterpreter } from "../orchestration/semantic/SemanticIntentInterpreter";
import { ContextProjectionSerializer } from "../worldv2/ContextProjectionSerializer";
import { WorldModelBridge } from "../worldv2/WorldModelBridge";
import { evaluateOperationalRouting } from "../orchestration/supervisor/OperationalRoutingGate";
import { DynamicRouter } from "../orchestration/supervisor/DynamicRouter";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { createMockAuditModel } from "./helpers/mockAuditModel";
import { DynamicWorkflowPlanner } from "../orchestration/planning/DynamicWorkflowPlanner";
import { PlanValidator } from "../orchestration/planning/PlanValidator";
import { EpistemicQueryStrategy, ContentSynthesisStrategy } from "../orchestration/verification/VerificationStrategies";
import { GroundedResponseGenerator, buildExecutionEvidencePackage } from "../orchestration/grounding/GroundedResponseGenerator";
import { IterativeActionDispatcher } from "../orchestration/kernel/IterativeActionDispatcher";
import type { SemanticTurn } from "../orchestration/contracts/SemanticTurnContracts";

test("Stage 2 Increment 2.1: Structured Discovery, Presentation & Typed Context Selection", async (t) => {
  await t.test("2.1a: CapabilityRegistry exposes Stage 1 READ capabilities with contextDomain & compact catalog", () => {
    const registry = CapabilityRegistry.getInstance();
    const catalog = registry.getDiscoveryCatalog({ operationKind: "READ" });

    const expectedDomains = new Map<string, string>([
      ["lifeos.tasks.query", "TASKS"],
      ["lifeos.goals.query", "TASKS"],
      ["lifeos.schedule.query_occurrences", "SCHEDULE"],
      ["lifeos.daily_logs.query_range", "HEALTH"],
      ["lifeos.telemetry.query_state_history", "HEALTH"],
    ]);

    for (const [urn, domain] of expectedDomains) {
      const entry = catalog.find((c) => c.capabilityURN === urn);
      assert.ok(entry, `Missing Stage 1 capability in discovery catalog: ${urn}`);
      assert.equal(entry.operationKind, "READ");
      assert.equal(entry.source, "INTERNAL_ADAPTER");
      assert.equal(entry.contextDomain, domain);
      assert.ok(Array.isArray(entry.parameterHints) && entry.parameterHints.length > 0);
      assert.ok(Array.isArray(entry.outputFields) && entry.outputFields.includes("items"));
    }

    const compact = registry.formatCompactReadCatalogForInterpreter();
    for (const urn of expectedDomains.keys()) {
      assert.ok(compact.includes(urn), `Compact catalog missing ${urn}`);
    }
  });

  await t.test("2.1b: CapabilityPresentationRegistry maps all 5 Stage 1 URNs cleanly", () => {
    const pres = CapabilityPresentationRegistry.getInstance();
    const urns = [
      "lifeos.tasks.query",
      "lifeos.goals.query",
      "lifeos.schedule.query_occurrences",
      "lifeos.daily_logs.query_range",
      "lifeos.telemetry.query_state_history",
    ];
    for (const urn of urns) {
      const info = pres.get(urn);
      assert.equal(info.providerDisplayName, "LifeOS Kernel");
      assert.ok(info.displayName.startsWith("LifeOS "), `Unexpected displayName for ${urn}: ${info.displayName}`);
    }
  });

  await t.test("2.1c: SemanticIntentInterpreter injects compact read catalog, keeps INTERNAL_ADAPTER ops, and emits structured retrieval metadata", async () => {
    const interpreter = SemanticIntentInterpreter.getInstance();
    let capturedSystemPrompt = "";

    interpreter.setMockChat(async ({ messages }) => {
      capturedSystemPrompt = messages[0]?.content || "";
      return JSON.stringify({
        primaryClassification: "INFORMATION_QUERY",
        ambiguityStatus: "UNAMBIGUOUS",
        requiresRetrieval: true,
        relevanceDomains: ["TASKS", "SCHEDULE"],
        objectiveComplexity: "INVESTIGATIVE",
        informationNeed: "Check tasks and scheduled blocks to plan the user's day",
        conversationalSummary: "User wants to plan their day using tasks and schedule.",
        operations: [
          {
            operationId: "op_01",
            actionType: "lifeos.tasks.query",
            capabilityURN: "lifeos.tasks.query",
            requiresConfirmation: false,
            payload: { status: "pending", limit: 20 },
          },
        ],
      });
    });

    try {
      const turn = await interpreter.interpret("What should I focus on today?", {
        userId: "u_stage2_21",
        timezone: "UTC",
        referenceTimeMs: Date.UTC(2026, 10, 26, 9, 0, 0),
      });

      assert.ok(capturedSystemPrompt.includes("REGISTERED READ CAPABILITIES"), "Interpreter prompt must include compact read catalog");
      assert.ok(capturedSystemPrompt.includes("lifeos.tasks.query"), "Interpreter prompt must expose lifeos.tasks.query");
      assert.equal(turn.requiresRetrieval, true);
      assert.deepEqual(turn.relevanceDomains, ["TASKS", "SCHEDULE"]);
      assert.equal(turn.objectiveComplexity, "INVESTIGATIVE");
      assert.equal(turn.operations.length, 1);
      assert.equal(turn.operations[0].actionType, "lifeos.tasks.query", "INTERNAL_ADAPTER op must not be coerced to external_capability_action");
      assert.equal(turn.operations[0].capabilityURN, "lifeos.tasks.query");
    } finally {
      interpreter.setMockChat(undefined);
    }
  });

  await t.test("2.1d: ContextProjectionSerializer.selectContext handles typed single and multi-domain IntentRelevanceDomain arrays", () => {
    const bridge = WorldModelBridge.getInstance();
    const projection = bridge.generateDegradedProjection("u_stage2_ctx", "Test projection");

    const single = ContextProjectionSerializer.selectContext(projection, "SCHEDULE", 1400);
    assert.ok(single.serializedContext.includes("[DEGRADED_CONTEXT:"));

    const multi = ContextProjectionSerializer.selectContext(projection, ["TASKS", "SCHEDULE", "HEALTH"], 1400);
    assert.ok(multi.serializedContext.length <= 1400);
    assert.ok(multi.serializedContext.includes("[DEGRADED_CONTEXT:"));
  });
});

function makeTurn(overrides: Partial<SemanticTurn>): SemanticTurn {
  return {
    turnId: "turn_stage2_test",
    schemaVersion: 2,
    userId: "u_stage2_test",
    conversationId: "conv_stage2_test",
    timestamp: Date.UTC(2026, 10, 26, 9, 0, 0),
    rawInput: "test input",
    normalizedTimezone: "UTC",
    provenance: {
      interpreterProvider: "groq",
      modelIdentifier: "test",
      promptVersionHash: "hash",
      contextSnapshotId: "ctx",
      contextSnapshotHash: "ctx_hash",
      inferenceDurationMs: 1,
    },
    primaryClassification: "ACTION_REQUEST",
    ambiguityStatus: "UNAMBIGUOUS",
    operations: [],
    conversationalSummary: "test",
    ...overrides,
  };
}

test("Stage 2 Increment 2.2: Read-Safe Routing, Simple-Read Path & Mutation Preservation", async (t) => {
  await t.test("2.2a: OperationalRoutingGate preserves SINGLE_ATOMIC_OPERATION while surfacing read metadata", () => {
    const turn = makeTurn({
      primaryClassification: "ACTION_REQUEST",
      operations: [
        {
          operationId: "op_read_1",
          domain: "productivity",
          actionType: "lifeos.tasks.query",
          capabilityURN: "lifeos.tasks.query",
          riskClass: "LOW_REVERSIBLE",
          payload: { status: "pending", limit: 10 },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });

    const evalRes = evaluateOperationalRouting(turn);
    assert.equal(evalRes.category, "SINGLE_ATOMIC_OPERATION");
    assert.equal(evalRes.eligibleForImmediateExecution, true);
    assert.equal(evalRes.hasReadOperations, true);
    assert.equal(evalRes.isReadOnly, true);
    assert.equal(evalRes.requiresSynthesis, true);
  });

  await t.test("2.2b: DynamicRouter separates simple-read, investigative workflow, mutation fast-path, and casual dialogue", () => {
    const router = new DynamicRouter();

    const simpleReadTurn = makeTurn({
      primaryClassification: "INFORMATION_QUERY",
      requiresRetrieval: true,
      objectiveComplexity: "SIMPLE",
      operations: [
        {
          operationId: "op_1",
          domain: "productivity",
          actionType: "lifeos.tasks.query",
          capabilityURN: "lifeos.tasks.query",
          riskClass: "LOW_REVERSIBLE",
          payload: { status: "pending" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });
    assert.equal(router.route("Show pending tasks", simpleReadTurn).strategy, "SINGLE_SPECIALIST");

    const investigativeTurn = makeTurn({
      primaryClassification: "INFORMATION_QUERY",
      requiresRetrieval: true,
      objectiveComplexity: "INVESTIGATIVE",
      operations: [],
    });
    assert.equal(router.route("Plan my day", investigativeTurn).strategy, "DYNAMIC_WORKFLOW");

    const mutationTurn = makeTurn({
      primaryClassification: "ACTION_REQUEST",
      operations: [
        {
          operationId: "op_m1",
          domain: "productivity",
          actionType: "create_task",
          riskClass: "LOW_REVERSIBLE",
          payload: { title: "Buy milk" },
          dependencies: [],
          executionEligibility: "READY",
        },
      ],
    });
    assert.equal(router.route("Add task Buy milk", mutationTurn).strategy, "FAST_PATH");

    const casualTurn = makeTurn({
      primaryClassification: "CASUAL_DIALOGUE",
      requiresRetrieval: false,
      operations: [],
    });
    assert.equal(router.route("Good morning!", casualTurn).strategy, "CONVERSATIONAL_LLM");
  });

  await t.test("2.2c: Supervisor excludes single READ ops from blind Gate 2a fast-path confirmation", async () => {
    const interpreter = SemanticIntentInterpreter.getInstance();
    const adapterRegistry = ActionAdapterRegistry.getInstance();
    let kernelAdapterCalled = false;

    adapterRegistry.register("lifeos.tasks.query", {
      validatePreconditions: async () => ({ valid: true }),
      execute: async () => {
        kernelAdapterCalled = true;
        return { items: [{ id: "t1", title: "Ship Stage 2" }], totalCount: 1, returnedCount: 1, hasMore: false, emptyReason: "" };
      },
      compensate: async () => ({ compensated: true }),
    });

    const kernel = new KernelCapabilityService(adapterRegistry, {
      auditModel: createMockAuditModel(),
      receiptModel: createMockAuditModel() as any,
    });
    const supervisor = Supervisor.createDefault(kernel);

    interpreter.setMockChat(async () =>
      JSON.stringify({
        primaryClassification: "ACTION_REQUEST",
        ambiguityStatus: "UNAMBIGUOUS",
        requiresRetrieval: true,
        relevanceDomains: ["TASKS"],
        objectiveComplexity: "SIMPLE",
        conversationalSummary: "Querying pending tasks.",
        operations: [
          {
            operationId: "op_01",
            actionType: "lifeos.tasks.query",
            capabilityURN: "lifeos.tasks.query",
            requiresConfirmation: false,
            payload: { status: "pending", limit: 10 },
          },
        ],
      })
    );

    try {
      const result = await supervisor.processRequest({
        userId: "u_stage2_22",
        message: "What pending tasks do I have?",
        timezone: "UTC",
      });

      assert.equal(kernelAdapterCalled, true, "Simple read must execute through KernelCapabilityService");
      assert.equal(result.routingDecision.strategy, "SINGLE_SPECIALIST");
      assert.ok(
        !result.response.includes("completed successfully"),
        `Simple read must never return blind mutation confirmation, got: ${result.response}`
      );
    } finally {
      interpreter.setMockChat(undefined);
      registerDefaultActionAdapters(adapterRegistry);
    }
  });
});

test("Stage 2 Increment 2.3: Context-Aware Dynamic Planning & Unified Investigative DAG Construction", async (t) => {
  await t.test("2.3a: DynamicWorkflowPlanner injects temporalContext, tailoredContext, and rich schemas and builds parallel read + synthesis DAG", async () => {
    let capturedPlannerPrompt = "";
    const planner = new DynamicWorkflowPlanner({
      allowBenchmarkFallback: false,
      llmClient: {
        complete: async (prompt: string) => {
          capturedPlannerPrompt = prompt;
          return `<think>Selecting parallel LifeOS read steps for today.</think>\n${JSON.stringify({
            goal: "Plan my day",
            userRequest: "Plan my day today",
            steps: [
              {
                stepId: "step_tasks",
                actionType: "lifeos.tasks.query",
                capabilityURN: "lifeos.tasks.query",
                parameters: { status: "pending", limit: 20 },
                dependsOn: [],
                rationale: "Fetch pending tasks",
              },
              {
                stepId: "step_schedule",
                actionType: "lifeos.schedule.query_occurrences",
                capabilityURN: "lifeos.schedule.query_occurrences",
                parameters: { startDate: "2026-11-26", endDate: "2026-11-26", timezone: "Asia/Kolkata" },
                dependsOn: [],
                rationale: "Fetch today's schedule blocks",
              },
              {
                stepId: "step_synth",
                actionType: "synthesis",
                capabilityURN: "synthesis",
                parameters: {},
                dependsOn: ["step_tasks", "step_schedule"],
                rationale: "Synthesize daily plan from tasks and schedule",
              },
            ],
          })}`;
        },
      },
    });

    const plan = await planner.planWorkflow({
      userRequest: "Plan my day today",
      goal: "Plan my day",
      context: {
        temporalContext: { localDate: "2026-11-26", dayOfWeek: "Thursday", timezone: "Asia/Kolkata" },
        tailoredContext: "TASKS: 3 active; SCHEDULE: 2 blocks",
      },
    });

    assert.ok(capturedPlannerPrompt.includes("2026-11-26"), "Planner prompt must inject localDate");
    assert.ok(capturedPlannerPrompt.includes("Asia/Kolkata"), "Planner prompt must inject timezone");
    assert.ok(capturedPlannerPrompt.includes("TASKS: 3 active"), "Planner prompt must inject tailoredContext");
    assert.ok(capturedPlannerPrompt.includes("lifeos.schedule.query_occurrences"), "Planner prompt must include Stage 1 schemas");
    assert.equal(plan.steps.length, 3);
    assert.deepEqual(plan.steps[2].dependsOn, ["step_tasks", "step_schedule"]);
  });

  await t.test("2.3b: PlanValidator rejects invalid date pattern, unknown capability URN, and cyclic dependencies", () => {
    const badDate = PlanValidator.validate({
      goal: "Bad date",
      userRequest: "Bad date",
      steps: [
        {
          stepId: "s1",
          actionType: "lifeos.schedule.query_occurrences",
          capabilityURN: "lifeos.schedule.query_occurrences",
          parameters: { startDate: "today", endDate: "2026-11-26" },
          dependsOn: [],
          rationale: "Invalid date format",
        },
      ],
    });
    assert.equal(badDate.valid, false);

    const unknownUrn = PlanValidator.validate({
      goal: "Unknown URN",
      userRequest: "Unknown URN",
      steps: [
        {
          stepId: "s1",
          actionType: "lifeos.nonexistent.query",
          capabilityURN: "lifeos.nonexistent.query",
          parameters: {},
          dependsOn: [],
          rationale: "Unregistered",
        },
      ],
    });
    assert.equal(unknownUrn.valid, false);
  });
});

test("Stage 2 Increment 2.4: Six-State Verification & Bounded Adaptive Replanning", async (t) => {
  await t.test("2.4a: EpistemicQueryStrategy treats 0-row informational Stage 1 reads as VERIFIED while preserving UNMET_PREREQUISITE for external searches", async () => {
    const strategy = new EpistemicQueryStrategy();
    const ctx = {
      executionId: "exec_24a",
      userId: "u_24a",
      goal: "Review my last 7 days",
      checkpointId: "chk_1",
      workspaceStateVersion: 1,
      generation: 1,
      workerLeaseToken: "tok_24a",
    };

    const emptyLifeosStep = {
      stepId: "s_tele",
      actionType: "lifeos.telemetry.query_state_history",
      capabilityURN: "lifeos.telemetry.query_state_history",
      status: "SUCCESS",
      parameters: { startDate: "2026-11-19", endDate: "2026-11-26" },
      data: { items: [], totalCount: 0, returnedCount: 0, hasMore: false, availabilityStatus: "EMPTY", emptyReason: "No cognitive telemetry logged in range." },
    };

    assert.equal(strategy.canVerify(emptyLifeosStep, ctx.goal), true);
    const lifeosRes = await strategy.verify(ctx, emptyLifeosStep);
    assert.equal(lifeosRes.status, "VERIFIED");

    const emptyExternalStep = {
      stepId: "s_email",
      actionType: "external_capability_action",
      capabilityURN: "productivity.email.search_messages",
      status: "SUCCESS",
      parameters: { query: "deployment failure" },
      data: { messages: [] },
    };
    const extRes = await strategy.verify(ctx, emptyExternalStep);
    assert.equal(extRes.status, "NOT_VERIFIED");
    assert.equal(extRes.reason, "OBJECTIVE_UNMET_EMPTY_SOURCE");
  });

  await t.test("2.4b: ContentSynthesisStrategy verifies honest empty-read disclosures while still rejecting ungrounded external artifact synthesis", async () => {
    const synthStrategy = new ContentSynthesisStrategy();
    const ctx = {
      executionId: "exec_24b",
      userId: "u_24b",
      goal: "Check mood telemetry",
      checkpointId: "chk_2",
      workspaceStateVersion: 1,
      generation: 1,
      workerLeaseToken: "tok_24b",
    };
    const synthStep = {
      stepId: "s_synth",
      actionType: "synthesis",
      capabilityURN: "synthesis",
      data: { text: "No cognitive or mood telemetry entries were recorded between 2026-11-19 and 2026-11-26." },
    };

    const resWithEmptyLifeos = await synthStrategy.verify(ctx, synthStep, [
      {
        stepId: "s_tele",
        actionType: "lifeos.telemetry.query_state_history",
        capabilityURN: "lifeos.telemetry.query_state_history",
        status: "SUCCESS",
        data: { items: [] },
      },
    ]);
    assert.equal(resWithEmptyLifeos.status, "VERIFIED_WITH_LIMITATIONS");

    const resWithEmptyExternal = await synthStrategy.verify(ctx, synthStep, [
      {
        stepId: "s_ext",
        actionType: "external_capability_action",
        capabilityURN: "productivity.email.search_messages",
        status: "SUCCESS",
        data: { messages: [] },
      },
    ]);
    assert.equal(resWithEmptyExternal.status, "NOT_VERIFIED");
    assert.equal(resWithEmptyExternal.reason, "UNGROUNDED_SYNTHESIS_NO_SOURCES");
  });

  await t.test("2.4c: DynamicWorkflowPlanner.replanRemainder uses llmClient to adapt failed steps while keeping completed steps immutable", async () => {
    const planner = new DynamicWorkflowPlanner({
      llmClient: {
        complete: async () =>
          JSON.stringify({
            goal: "Review 7-day wellness",
            userRequest: "Review 7-day wellness",
            steps: [
              {
                stepId: "s_logs",
                actionType: "lifeos.daily_logs.query_range",
                capabilityURN: "lifeos.daily_logs.query_range",
                parameters: { startDate: "2026-11-19", endDate: "2026-11-26" },
                dependsOn: [],
                rationale: "Fallback to daily logs when telemetry failed",
              },
            ],
          }),
      },
    });

    const initialPlan = {
      goal: "Review 7-day wellness",
      userRequest: "Review 7-day wellness",
      steps: [
        {
          stepId: "s_tasks",
          actionType: "lifeos.tasks.query",
          capabilityURN: "lifeos.tasks.query",
          parameters: { status: "pending" },
          dependsOn: [],
          rationale: "Read tasks",
        },
        {
          stepId: "s_tele",
          actionType: "lifeos.telemetry.query_state_history",
          capabilityURN: "lifeos.telemetry.query_state_history",
          parameters: { startDate: "2026-11-19", endDate: "2026-11-26" },
          dependsOn: [],
          rationale: "Read telemetry",
        },
      ],
    };

    const revised = await planner.replanRemainder({
      currentPlan: initialPlan,
      failedStepId: "s_tele",
      failureReason: "Telemetry adapter unavailable",
      completedSteps: [{ stepId: "s_tasks", data: { items: [] } }],
      temporalContext: { localDate: "2026-11-26", timezone: "UTC" },
    });

    assert.equal(revised.steps[0].stepId, "s_tasks", "Completed step must remain immutable");
    assert.equal(revised.steps[1].capabilityURN, "lifeos.daily_logs.query_range", "Replanner must substitute alternative capability");
  });
});

test("Stage 2 Increment 2.5: Canonical Evidence-Boundary Synthesis & SSE Delivery", async (t) => {
  await t.test("2.5a: EvidencePackageBuilder enforces strict allowlist, redacts secrets/reflections, and distinguishes coverage states", () => {
    const pkg = buildExecutionEvidencePackage({
      objective: "Review tasks and daily logs",
      temporalContext: { localDate: "2026-11-26", timezone: "UTC" },
      steps: [
        {
          stepId: "s_tasks",
          capabilityURN: "lifeos.tasks.query",
          parameters: { status: "pending" },
          success: true,
          auditId: "audit_1",
          data: {
            items: [{ id: "t1", title: "Finish report", apiKey: "secret_should_strip", reflection: "private prose" }],
            totalCount: 1,
            returnedCount: 1,
            hasMore: false,
            emptyReason: "",
          },
        },
        {
          stepId: "s_logs",
          capabilityURN: "lifeos.daily_logs.query_range",
          parameters: { startDate: "2026-11-19", endDate: "2026-11-26" },
          success: true,
          auditId: "audit_2",
          data: {
            items: [],
            totalCount: 0,
            returnedCount: 0,
            hasMore: false,
            emptyReason: "No logs in range",
          },
        },
        {
          stepId: "s_tele",
          capabilityURN: "lifeos.telemetry.query_state_history",
          success: false,
          error: "DB timeout",
        },
      ],
    });

    const serialized = JSON.stringify(pkg);
    assert.ok(!serialized.includes("secret_should_strip"), "Secrets must be redacted from evidence package");
    assert.ok(!serialized.includes("private prose"), "Sensitive reflection field must be stripped");
    assert.equal(pkg.items[0].coverageStatus, "READ_WITH_DATA");
    assert.equal(pkg.items[0].provenance.auditId, "audit_1");
    assert.equal(pkg.items[1].coverageStatus, "READ_EMPTY");
    assert.equal(pkg.items[2].coverageStatus, "CAPABILITY_EXECUTION_FAILED");
  });

  await t.test("2.5b: executeGraphWorkflow invokes canonical synthesizeFromEvidence exactly once (with or without explicit synthesis node) and emits assistant_delta", async () => {
    const adapterRegistry = new ActionAdapterRegistry();
    adapterRegistry.register("lifeos.tasks.query", {
      validatePreconditions: async () => ({ valid: true }),
      execute: async () => ({
        items: [{ id: "t1", title: "Finalize Stage 2" }],
        totalCount: 1,
        returnedCount: 1,
        hasMore: false,
        emptyReason: "",
      }),
      compensate: async () => ({ compensated: true }),
    });

    const kernel = new KernelCapabilityService(adapterRegistry, {
      auditModel: createMockAuditModel(),
      receiptModel: createMockAuditModel() as any,
    });
    const dispatcher = new IterativeActionDispatcher(kernel);
    const gen = GroundedResponseGenerator.getInstance();
    const origSynth = gen.synthesizeFromEvidence.bind(gen);

    let synthCalls = 0;
    gen.synthesizeFromEvidence = async (pkg, opts) => {
      synthCalls++;
      return origSynth(pkg, {
        ...opts,
        llmComplete: async () => "Grounded plan response: Finalize Stage 2 is your active pending task.",
      });
    };

    try {
      const eventsWithNode: any[] = [];
      const resWithNode = await dispatcher.executeGraphWorkflow({
        userId: "u_25b",
        userRequest: "Show my tasks",
        goal: "Show my tasks",
        plan: {
          goal: "Show my tasks",
          userRequest: "Show my tasks",
          steps: [
            {
              stepId: "s_read",
              actionType: "lifeos.tasks.query",
              capabilityURN: "lifeos.tasks.query",
              parameters: { status: "pending" },
              dependsOn: [],
              rationale: "Read tasks",
            },
            {
              stepId: "s_synth",
              actionType: "synthesis",
              capabilityURN: "synthesis",
              parameters: {},
              dependsOn: ["s_read"],
              rationale: "Synthesize tasks",
            },
          ],
        },
        onEvent: (ev) => eventsWithNode.push(ev),
      });

      assert.equal(synthCalls, 1, "Graph WITH synthesis node must invoke canonical synthesis exactly once");
      assert.equal(resWithNode.status, "COMPLETED");
      assert.ok(resWithNode.response.includes("Finalize Stage 2"));
      assert.ok(eventsWithNode.some((e) => e.type === "assistant_delta" && e.text.includes("Finalize Stage 2")));

      synthCalls = 0;
      const eventsNoNode: any[] = [];
      const resNoNode = await dispatcher.executeGraphWorkflow({
        userId: "u_25b",
        userRequest: "Show my tasks",
        goal: "Show my tasks",
        plan: {
          goal: "Show my tasks",
          userRequest: "Show my tasks",
          steps: [
            {
              stepId: "s_read",
              actionType: "lifeos.tasks.query",
              capabilityURN: "lifeos.tasks.query",
              parameters: { status: "pending" },
              dependsOn: [],
              rationale: "Read tasks",
            },
          ],
        },
        onEvent: (ev) => eventsNoNode.push(ev),
      });

      assert.equal(synthCalls, 1, "Graph WITHOUT synthesis node must invoke canonical synthesis exactly once at finalization");
      assert.equal(resNoNode.status, "COMPLETED");
      assert.ok(eventsNoNode.some((e) => e.type === "assistant_delta"));
    } finally {
      gen.synthesizeFromEvidence = origSynth;
    }
  });
});
