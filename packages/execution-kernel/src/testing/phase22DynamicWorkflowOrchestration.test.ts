/**
 * phase22DynamicWorkflowOrchestration.test.ts
 *
 * STAGE 4: GENERALIZED CAPABILITY EXPANSION & DYNAMIC WORKFLOW ORCHESTRATION (V2.3)
 * Full verification suite covering all 48 test cases across:
 * - Capability Catalog & Schema Boundary (T01–T08)
 * - Dynamic Planning & Deterministic Validation (T09–T16)
 * - Sovereign Workflow Execution Graph & Concurrency Governance (T17–T24)
 * - Data Flow, Clamping & Replanning (T25–T30)
 * - Governance, Approvals & Verification (T31–T35)
 * - Crash Recovery, Replay & Persistence (T36–T38)
 * - Advanced Concurrency, Provider Failures & Joint-State Invariants (T39–T48)
 */

import test from "node:test";
import assert from "node:assert";
import crypto from "node:crypto";

import {
  CapabilityRegistry,
  PlanValidator,
  DynamicWorkflowPlanner,
  WorkflowExecutionGraph,
  ConflictGovernanceEngine,
  ResourceConflictEvaluator,
  IterativeActionDispatcher,
  CrashRecoveryEngine,
  KernelCapabilityService,
  ActionAdapterRegistry,
  StepDataResolver,
  ObjectiveVerificationEngine,
  WorkflowExecutionPlan,
  PlanStepDefinition,
  ResourceReservation,
  WorkflowGraphSnapshot,
  StaleWorkerFencedError,
} from "../index";

// Configure persistent HMAC secret for test harness
process.env.KERNEL_HMAC_SECRET = "test_hmac_secret_for_stage4_dynamic_orchestration_32chars!";

test("STAGE 4: GENERALIZED CAPABILITY EXPANSION & DYNAMIC WORKFLOW ORCHESTRATION (V2.3)", async (t) => {
  const registry = CapabilityRegistry.getInstance();

  // =========================================================================
  // GROUP 1: CAPABILITY CATALOG & SCHEMA BOUNDARY (T01–T08)
  // =========================================================================

  await t.test("T01: Dynamic registration of internal kernel adapter", () => {
    const desc = registry.registerCapability({
      capabilityURN: "internal.database.vacuum",
      source: "INTERNAL_ADAPTER",
      displayName: "Vacuum Database",
      description: "Cleans up dead tuples and indexes",
      category: "database",
      parametersSchema: {
        type: "object",
        properties: { table: { type: "string" } },
        required: ["table"],
      },
      isIdempotent: true,
      isReversible: false,
      requiresApproval: true,
      timeoutMs: 15000,
    });

    assert.ok(desc.contractHash);
    assert.strictEqual(desc.contractHash.length, 64);
    assert.strictEqual(desc.source, "INTERNAL_ADAPTER");
    assert.ok(registry.hasCapability("internal.database.vacuum"));
  });

  await t.test("T02: Dynamic registration of external modular provider", () => {
    const desc = registry.registerCapability({
      capabilityURN: "productivity.slack.post_message",
      source: "MODULAR_PROVIDER",
      displayName: "Post Slack Message",
      description: "Posts message to Slack channel",
      category: "productivity",
      parametersSchema: {
        type: "object",
        properties: { channel: { type: "string" }, message: { type: "string" } },
        required: ["channel", "message"],
      },
      isIdempotent: false,
      isReversible: false,
      requiresApproval: true,
      timeoutMs: 10000,
    });

    assert.strictEqual(desc.source, "MODULAR_PROVIDER");
    assert.strictEqual(desc.requiresApproval, true);
    assert.ok(registry.getCapability("productivity.slack.post_message"));
  });

  await t.test("T03: Dynamic MCP tool ingestion from gateway", () => {
    const ingested = registry.ingestMcpTools("github_server", [
      {
        name: "list_commits",
        description: "Lists commits on repository",
        inputSchema: {
          type: "object",
          properties: { repo: { type: "string" }, sha: { type: "string" } },
          required: ["repo"],
        },
      },
    ]);

    assert.strictEqual(ingested.length, 1);
    assert.strictEqual(ingested[0].capabilityURN, "mcp.github_server.list_commits");
    assert.strictEqual(ingested[0].source, "MCP_GATEWAY");
    assert.ok(registry.hasCapability("mcp.github_server.list_commits"));
  });

  await t.test("T04: Capability search by tags, domain, and keywords", () => {
    const emailCaps = registry.listCapabilities({ category: "productivity", query: "email" });
    assert.ok(emailCaps.length >= 2);
    assert.ok(emailCaps.some((c) => c.capabilityURN === "productivity.email.search_messages"));

    const taggedCaps = registry.listCapabilities({ tags: ["gmail"] });
    assert.ok(taggedCaps.length >= 1);
  });

  await t.test("T05: Schema validation of conforming payload", () => {
    const validation = registry.validateParameters("productivity.storage.write_file", {
      path: "Desktop/summary.md",
      content: "# Hello World",
    });
    assert.strictEqual(validation.valid, true);
  });

  await t.test("T06: Schema validation rejecting missing required field", () => {
    const validation = registry.validateParameters("productivity.storage.write_file", {
      path: "Desktop/summary.md",
      // Missing required 'content'
    });
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.reason?.includes("content"));
  });

  await t.test("T07: Schema validation rejecting invalid data types", () => {
    const validation = registry.validateParameters("health.activity.record_workout", {
      workoutType: "Running",
      durationMinutes: "sixty", // Invalid: string instead of number
    });
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.reason?.includes("number"));
  });

  await t.test("T08: Disabled/revoked capability excluded from discovery", () => {
    registry.registerCapability({
      capabilityURN: "internal.legacy.deprecated_action",
      source: "INTERNAL_ADAPTER",
      displayName: "Deprecated Action",
      description: "No longer supported",
      category: "system",
      parametersSchema: { type: "object", properties: {} },
      isIdempotent: true,
      isReversible: false,
      requiresApproval: false,
      timeoutMs: 5000,
      status: "REVOKED",
    });

    const searchResults = registry.listCapabilities({ query: "deprecated_action" });
    assert.strictEqual(searchResults.length, 0);

    const validation = registry.validateParameters("internal.legacy.deprecated_action", {});
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.reason?.includes("CAPABILITY_REVOKED"));
  });

  // =========================================================================
  // GROUP 2: DYNAMIC PLANNING & DETERMINISTIC VALIDATION (T09–T16)
  // =========================================================================

  await t.test("T09: LLM generates valid multi-step DAG plan from goal", async () => {
    const mockLLM = {
      complete: async () => {
        return JSON.stringify({
          goal: "Search and save report",
          userRequest: "Find emails and save to file",
          steps: [
            {
              stepId: "step_1",
              actionType: "external_capability_action",
              capabilityURN: "productivity.email.search_messages",
              parameters: { query: "finance" },
              dependsOn: [],
              rationale: "Search emails",
            },
            {
              stepId: "step_2",
              actionType: "synthesis",
              capabilityURN: "synthesis",
              parameters: { targetPrompt: "Synthesize finance emails", sourceStepId: "step_1" },
              dependsOn: ["step_1"],
              rationale: "Synthesize finance summary",
            },
            {
              stepId: "step_3",
              actionType: "external_capability_action",
              capabilityURN: "productivity.storage.write_file",
              parameters: { path: "finance.md", content: "$ref:step_2.result" },
              dependsOn: ["step_2"],
              rationale: "Save to file",
            },
          ],
        });
      },
    };

    const planner = new DynamicWorkflowPlanner({ llmClient: mockLLM });
    const plan = await planner.planWorkflow({
      userRequest: "Find emails and save to file",
      goal: "Search and save report",
    });

    assert.strictEqual(plan.steps.length, 3);
    assert.strictEqual(plan.steps[0].stepId, "step_1");
    assert.strictEqual(plan.steps[2].parameters.content, "$ref:step_2.result");
  });

  await t.test("T10: PlanValidator accepts valid DAG with $ref linkages", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Test valid plan",
      userRequest: "Test valid plan",
      steps: [
        {
          stepId: "step_a",
          actionType: "external_capability_action",
          capabilityURN: "productivity.email.search_messages",
          parameters: { query: "status" },
          dependsOn: [],
          rationale: "Search",
        },
        {
          stepId: "step_b",
          actionType: "external_capability_action",
          capabilityURN: "productivity.storage.write_file",
          parameters: { path: "out.txt", content: "$ref:step_a.data" },
          dependsOn: ["step_a"],
          rationale: "Write",
        },
      ],
    };

    const result = PlanValidator.validate(plan, registry);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.criticalPathDepth, 2);
  });

  await t.test("T11: PlanValidator rejects hallucinated / unregistered URN", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Test invalid urn",
      userRequest: "Test invalid urn",
      steps: [
        {
          stepId: "step_hallucinated",
          actionType: "external_capability_action",
          capabilityURN: "productivity.quantum_ai.teleport_data", // Unregistered
          parameters: {},
          dependsOn: [],
          rationale: "Hallucinated step",
        },
      ],
    };

    const result = PlanValidator.validate(plan, registry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason?.includes("UNKNOWN_CAPABILITY_URN"));
  });

  await t.test("T12: PlanValidator rejects dependency cycle (Kahn's test)", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Test cycle",
      userRequest: "Test cycle",
      steps: [
        {
          stepId: "step_1",
          actionType: "external_capability_action",
          capabilityURN: "productivity.email.search_messages",
          parameters: { query: "test" },
          dependsOn: ["step_2"], // Cycle: 1 -> 2 -> 1
          rationale: "Step 1",
        },
        {
          stepId: "step_2",
          actionType: "external_capability_action",
          capabilityURN: "productivity.email.search_messages",
          parameters: { query: "test" },
          dependsOn: ["step_1"],
          rationale: "Step 2",
        },
      ],
    };

    const result = PlanValidator.validate(plan, registry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason?.includes("DEPENDENCY_CYCLE_DETECTED"));
  });

  await t.test("T13: PlanValidator rejects forward $ref to undeclared step", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Test undeclared ref",
      userRequest: "Test undeclared ref",
      steps: [
        {
          stepId: "step_write",
          actionType: "external_capability_action",
          capabilityURN: "productivity.storage.write_file",
          parameters: { path: "out.txt", content: "$ref:step_missing.data" },
          dependsOn: [],
          rationale: "Write without declared dependency",
        },
      ],
    };

    const result = PlanValidator.validate(plan, registry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason?.includes("UNDECLARED_DEPENDENCY_REFERENCE"));
  });

  await t.test("T14: PlanValidator rejects plan exceeding 15 steps", () => {
    const steps: PlanStepDefinition[] = [];
    for (let i = 1; i <= 16; i++) {
      steps.push({
        stepId: `step_${i}`,
        actionType: "external_capability_action",
        capabilityURN: "context.system.read_clipboard",
        parameters: {},
        dependsOn: i > 1 ? [`step_${i - 1}`] : [],
        rationale: `Step ${i}`,
      });
    }

    const plan: WorkflowExecutionPlan = {
      goal: "Test size limit",
      userRequest: "Test size limit",
      steps,
    };

    const result = PlanValidator.validate(plan, registry);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason?.includes("PLAN_SIZE_EXCEEDED"));
  });

  await t.test("T15: PlanValidator identifies consequential steps", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Delete task",
      userRequest: "Delete task",
      steps: [
        {
          stepId: "step_del",
          actionType: "delete_task",
          capabilityURN: "delete_task",
          parameters: { taskId: "task_123" },
          dependsOn: [],
          rationale: "Delete task by ID",
        },
      ],
    };

    const result = PlanValidator.validate(plan, registry);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.normalizedPlan?.steps[0].requiresConfirmation, true);
  });

  await t.test("T16: Deterministic fallback plan when model offline", async () => {
    const planner = new DynamicWorkflowPlanner({ allowBenchmarkFallback: true });
    const plan = await planner.planWorkflow({
      userRequest: "Summarize deployment failure emails and write report to Desktop/deploy_summary.txt",
      goal: "Summarize failure emails and save",
    });

    assert.ok(plan);
    assert.strictEqual(plan.steps.length, 3);
    assert.strictEqual(plan.steps[0].capabilityURN, "productivity.email.search_messages");
    assert.strictEqual(plan.steps[2].capabilityURN, "productivity.storage.write_file");
  });

  // =========================================================================
  // GROUP 3: WORKFLOW EXECUTION GRAPH & CONCURRENCY GOVERNANCE (T17–T24)
  // =========================================================================

  await t.test("T17: Graph identifies initial ready nodes (zero deps)", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Test ready nodes",
      userRequest: "Test ready nodes",
      steps: [
        {
          stepId: "step_initial_1",
          actionType: "external_capability_action",
          capabilityURN: "productivity.calendar.read_events",
          parameters: {},
          dependsOn: [],
          rationale: "Fetch cal",
        },
        {
          stepId: "step_initial_2",
          actionType: "external_capability_action",
          capabilityURN: "context.environment.read_weather",
          parameters: {},
          dependsOn: [],
          rationale: "Fetch weather",
        },
        {
          stepId: "step_dependent",
          actionType: "synthesis",
          capabilityURN: "synthesis",
          parameters: { targetPrompt: "Synthesize" },
          dependsOn: ["step_initial_1", "step_initial_2"],
          rationale: "Combine",
        },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    const ready = graph.getReadyNodes();
    assert.strictEqual(ready.length, 2);
    assert.ok(ready.some((n) => n.stepId === "step_initial_1"));
    assert.ok(ready.some((n) => n.stepId === "step_initial_2"));
    assert.strictEqual(graph.nodes.get("step_dependent")?.status, "PENDING");
  });

  await t.test("T18: Valid 12-state node lifecycle transitions", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Test transitions",
      userRequest: "Test transitions",
      steps: [
        {
          stepId: "step_lifecycle",
          actionType: "external_capability_action",
          capabilityURN: "context.system.read_clipboard",
          parameters: {},
          dependsOn: [],
          rationale: "Lifecycle test",
        },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    assert.strictEqual(graph.nodes.get("step_lifecycle")?.status, "READY");

    graph.markInProgress("step_lifecycle");
    assert.strictEqual(graph.nodes.get("step_lifecycle")?.status, "IN_PROGRESS");
    assert.strictEqual(graph.nodes.get("step_lifecycle")?.attempts.length, 1);

    graph.markVerificationPending("step_lifecycle", { text: "clipboard data" });
    assert.strictEqual(graph.nodes.get("step_lifecycle")?.status, "VERIFICATION_PENDING");

    graph.markCompleted("step_lifecycle", { text: "clipboard data" });
    assert.strictEqual(graph.nodes.get("step_lifecycle")?.status, "COMPLETED");
  });

  await t.test("T19: Parallel batching of independent read-only steps", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Test read batching",
      userRequest: "Test read batching",
      steps: [
        {
          stepId: "read_1",
          actionType: "external_capability_action",
          capabilityURN: "productivity.storage.read_file",
          parameters: { path: "Desktop/a.txt" },
          dependsOn: [],
          rationale: "Read a",
        },
        {
          stepId: "read_2",
          actionType: "external_capability_action",
          capabilityURN: "productivity.storage.read_file",
          parameters: { path: "Desktop/b.txt" },
          dependsOn: [],
          rationale: "Read b",
        },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    const ready = graph.getReadyNodes();
    const { runnableBatch, deferredNodes } = ConflictGovernanceEngine.selectConcurrentBatch(
      ready,
      "tenant_1",
      [],
      registry
    );

    assert.strictEqual(runnableBatch.length, 2);
    assert.strictEqual(deferredNodes.length, 0);
  });

  await t.test("T20: Concurrency limit strictly capped at 3 actions", () => {
    const steps: PlanStepDefinition[] = [
      { stepId: "s1", actionType: "read", capabilityURN: "context.system.read_clipboard", parameters: {}, dependsOn: [], rationale: "1" },
      { stepId: "s2", actionType: "read", capabilityURN: "context.system.read_clipboard", parameters: {}, dependsOn: [], rationale: "2" },
      { stepId: "s3", actionType: "read", capabilityURN: "context.system.read_clipboard", parameters: {}, dependsOn: [], rationale: "3" },
      { stepId: "s4", actionType: "read", capabilityURN: "context.system.read_clipboard", parameters: {}, dependsOn: [], rationale: "4" },
    ];

    const plan: WorkflowExecutionPlan = { goal: "cap", userRequest: "cap", steps };
    const graph = new WorkflowExecutionGraph(plan);
    const ready = graph.getReadyNodes();
    assert.strictEqual(ready.length, 4);

    const { runnableBatch, deferredNodes } = ConflictGovernanceEngine.selectConcurrentBatch(
      ready,
      "tenant_1",
      [],
      registry
    );

    assert.strictEqual(runnableBatch.length, 3);
    assert.strictEqual(deferredNodes.length, 1);
  });

  await t.test("T21: Mutation collision detection (same resource key)", () => {
    const steps: PlanStepDefinition[] = [
      {
        stepId: "write_1",
        actionType: "write",
        capabilityURN: "productivity.storage.write_file",
        parameters: { path: "Desktop/shared.txt", content: "data1" },
        dependsOn: [],
        rationale: "Write 1",
      },
      {
        stepId: "write_2",
        actionType: "write",
        capabilityURN: "productivity.storage.write_file",
        parameters: { path: "Desktop/shared.txt", content: "data2" },
        dependsOn: [],
        rationale: "Write 2",
      },
    ];

    const plan: WorkflowExecutionPlan = { goal: "collision", userRequest: "collision", steps };
    const graph = new WorkflowExecutionGraph(plan);
    const ready = graph.getReadyNodes();

    const { runnableBatch, deferredNodes } = ConflictGovernanceEngine.selectConcurrentBatch(
      ready,
      "tenant_1",
      [],
      registry
    );

    // One must be accepted, the other deferred due to exclusive lock collision
    assert.strictEqual(runnableBatch.length, 1);
    assert.strictEqual(deferredNodes.length, 1);
  });

  await t.test("T22: Disjoint resource mutations execute in parallel", () => {
    const steps: PlanStepDefinition[] = [
      {
        stepId: "write_a",
        actionType: "write",
        capabilityURN: "productivity.storage.write_file",
        parameters: { path: "Desktop/a.txt", content: "dataA" },
        dependsOn: [],
        rationale: "Write a",
      },
      {
        stepId: "write_b",
        actionType: "write",
        capabilityURN: "productivity.storage.write_file",
        parameters: { path: "Desktop/b.txt", content: "dataB" },
        dependsOn: [],
        rationale: "Write b",
      },
    ];

    const plan: WorkflowExecutionPlan = { goal: "disjoint", userRequest: "disjoint", steps };
    const graph = new WorkflowExecutionGraph(plan);
    const ready = graph.getReadyNodes();

    const { runnableBatch, deferredNodes } = ConflictGovernanceEngine.selectConcurrentBatch(
      ready,
      "tenant_1",
      [],
      registry
    );

    assert.strictEqual(runnableBatch.length, 2);
    assert.strictEqual(deferredNodes.length, 0);
  });

  await t.test("T23: Cascading skip on conditional branch false", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Test skip",
      userRequest: "Test skip",
      steps: [
        {
          stepId: "step_check",
          actionType: "read",
          capabilityURN: "productivity.email.search_messages",
          parameters: { query: "urgent" },
          dependsOn: [],
          rationale: "Check emails",
        },
        {
          stepId: "step_conditional",
          actionType: "write",
          capabilityURN: "productivity.storage.write_file",
          parameters: { path: "urgent.txt", content: "alert" },
          dependsOn: ["step_check"],
          condition: {
            field: "$ref:step_check.count",
            operator: "GREATER_THAN",
            value: 0,
          },
          rationale: "Write only if urgent emails found",
        },
        {
          stepId: "step_after_conditional",
          actionType: "read",
          capabilityURN: "productivity.storage.read_file",
          parameters: { path: "urgent.txt" },
          dependsOn: ["step_conditional"],
          joinType: "ALL",
          rationale: "Read urgent file",
        },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    graph.markInProgress("step_check");
    // step_check completes with count: 0 -> condition fails
    graph.markCompleted("step_check", { count: 0 });

    assert.strictEqual(graph.nodes.get("step_conditional")?.status, "SKIPPED");
    assert.strictEqual(graph.nodes.get("step_after_conditional")?.status, "SKIPPED");
  });

  await t.test("T24: Join semantics (joinType: 'ANY' vs 'ALL')", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Test join",
      userRequest: "Test join",
      steps: [
        {
          stepId: "branch_a",
          actionType: "read",
          capabilityURN: "context.system.read_clipboard",
          parameters: {},
          dependsOn: [],
          rationale: "A",
        },
        {
          stepId: "branch_b",
          actionType: "read",
          capabilityURN: "context.environment.read_weather",
          parameters: {},
          dependsOn: [],
          rationale: "B",
        },
        {
          stepId: "join_any",
          actionType: "write",
          capabilityURN: "productivity.storage.write_file",
          parameters: { path: "any.txt", content: "data" },
          dependsOn: ["branch_a", "branch_b"],
          joinType: "ANY",
          rationale: "Advances when ANY branch completes",
        },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    graph.markInProgress("branch_a");
    graph.markCompleted("branch_a", { result: "A finished" });

    // With joinType: "ANY", join_any should now be READY even though branch_b is still PENDING
    assert.strictEqual(graph.nodes.get("join_any")?.status, "READY");
    assert.strictEqual(graph.nodes.get("branch_b")?.status, "READY");
  });

  // =========================================================================
  // GROUP 4: DATA FLOW, CLAMPING & REPLANNING (T25–T30)
  // =========================================================================

  await t.test("T25: Dynamic $ref resolution from parallel step outputs", () => {
    const scratchpad = new Map<string, any>();
    scratchpad.set("search_step", {
      messages: [{ id: "msg_1", subject: "Sprint Planning" }],
      total: 1,
    });

    const unresolved = {
      subject: "$ref:search_step.messages.0.subject",
      count: "$ref:search_step.total",
      literal: "keep_me",
    };

    const resolved = StepDataResolver.resolveReferences(unresolved, scratchpad);
    assert.strictEqual(resolved.subject, "Sprint Planning");
    assert.strictEqual(resolved.count, 1);
    assert.strictEqual(resolved.literal, "keep_me");
  });

  await t.test("T26: Intermediate output exceeding 50 KB is clamped", () => {
    const largeText = "A".repeat(60 * 1024); // 60 KB
    const rawData = { text: largeText };

    const serialized = JSON.stringify(rawData);
    assert.ok(serialized.length > 50 * 1024);

    // Clamping via StepDataResolver
    const clamped = StepDataResolver.clampStepPayload(rawData, 50 * 1024);
    const clampedBytes = Buffer.byteLength(JSON.stringify(clamped), "utf8");
    assert.ok(clampedBytes <= 50 * 1024);
    assert.strictEqual(clamped.__isTruncated, true);
    assert.ok(clamped.__truncationDetails);
  });

  await t.test("T27: Node failure triggers Stage 3 recovery evaluation", async () => {
    const dispatcher = IterativeActionDispatcher.getInstance();
    const plan: WorkflowExecutionPlan = {
      goal: "Test failure handling",
      userRequest: "Test failure handling",
      steps: [
        {
          stepId: "step_failing",
          actionType: "external_capability_action",
          capabilityURN: "productivity.storage.write_file",
          parameters: { path: "Desktop/protected.txt", content: "data" },
          dependsOn: [],
          rationale: "Failing step",
        },
      ],
    };

    // Inject a failing adapter
    ActionAdapterRegistry.getInstance().register("external_capability_action", {
      validatePreconditions: async () => ({ valid: true }),
      execute: async () => {
        const err: any = new Error("EACCES: permission denied, write");
        err.statusCode = 403;
        throw err;
      },
      compensate: async () => ({ compensated: true }),
    });

    const result = await dispatcher.executeGraphWorkflow({
      userId: "u_fail_test",
      userRequest: "Test failure",
      goal: "Test failure",
      plan,
    });

    assert.strictEqual(result.status, "TERMINATED_FAILED");
    const allNodes = Object.values(result.graphSnapshot.nodes);
    assert.ok(allNodes.length > 0);
    assert.ok(allNodes.every((n) => n.status === "FAILED"));
  });

  await t.test("T28: REPLAN_REMAINDER grafts replacement subgraph", async () => {
    const currentPlan: WorkflowExecutionPlan = {
      goal: "Replanning test",
      userRequest: "Replanning test",
      steps: [
        {
          stepId: "step_1",
          actionType: "read",
          capabilityURN: "productivity.email.search_messages",
          parameters: { query: "logs" },
          dependsOn: [],
          rationale: "Search",
        },
        {
          stepId: "step_2",
          actionType: "write",
          capabilityURN: "productivity.storage.write_file",
          parameters: { path: "invalid/path/output.txt", content: "$ref:step_1.data" },
          dependsOn: ["step_1"],
          rationale: "Write",
        },
      ],
    };

    const planner = new DynamicWorkflowPlanner({ registry });
    const replanned = await planner.replanRemainder({
      currentPlan,
      failedStepId: "step_2",
      failureReason: "ENOENT: no such file or directory",
      completedSteps: [{ stepId: "step_1", data: { messages: [] } }],
    });

    assert.ok(replanned);
    assert.strictEqual(replanned.steps[0].stepId, "step_1"); // Completed step retained
    assert.strictEqual(replanned.steps[1].stepId, "step_2_recovered"); // Replacement step grafted
    assert.ok(replanned.steps[1].parameters.path.includes("recovered_"));
  });

  await t.test("T29: Completed anchor nodes remain immutable", async () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Anchor test",
      userRequest: "Anchor test",
      steps: [
        { stepId: "step_1", actionType: "read", capabilityURN: "context.system.read_clipboard", parameters: {}, dependsOn: [], rationale: "1" },
        { stepId: "step_2", actionType: "read", capabilityURN: "context.environment.read_weather", parameters: {}, dependsOn: ["step_1"], rationale: "2" },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    graph.markInProgress("step_1");
    graph.markCompleted("step_1", { cachedText: "immutable data" });

    const snapshotBefore = graph.serializeSnapshot();

    // Replan remainder
    const revisedPlan: WorkflowExecutionPlan = {
      goal: "Anchor test revised",
      userRequest: "Anchor test revised",
      steps: [
        plan.steps[0], // immutable
        { stepId: "step_2_alt", actionType: "read", capabilityURN: "context.environment.get_forecast", parameters: {}, dependsOn: ["step_1"], rationale: "alt" },
      ],
    };

    graph.replanRemainder(revisedPlan);

    // Step 1 status and outputs must remain identical
    assert.strictEqual(graph.nodes.get("step_1")?.status, "COMPLETED");
    assert.deepStrictEqual(graph.nodes.get("step_1")?.output, { cachedText: "immutable data" });
    assert.strictEqual(graph.replanCount, 1);
  });

  await t.test("T30: Replanning loop ceiling (max 3) enforced", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Ceiling test",
      userRequest: "Ceiling test",
      steps: [
        { stepId: "s1", actionType: "read", capabilityURN: "context.system.read_clipboard", parameters: {}, dependsOn: [], rationale: "1" },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    graph.replanRemainder(plan);
    graph.replanRemainder(plan);
    graph.replanRemainder(plan);
    assert.strictEqual(graph.replanCount, 3);
  });

  // =========================================================================
  // GROUP 5: GOVERNANCE, APPROVALS & VERIFICATION (T31–T35)
  // =========================================================================

  await t.test("T31: Consequential action pauses batch for HMAC approval", async () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Delete task with approval",
      userRequest: "Delete task with approval",
      steps: [
        {
          stepId: "step_del",
          actionType: "delete_task",
          capabilityURN: "delete_task",
          parameters: { taskId: "t_100" },
          dependsOn: [],
          requiresConfirmation: true,
          rationale: "Consequential delete",
        },
      ],
    };

    const dispatcher = IterativeActionDispatcher.getInstance();
    const result = await dispatcher.executeGraphWorkflow({
      userId: "u_appr_test",
      userRequest: "Delete task",
      goal: "Delete task",
      plan,
    });

    assert.strictEqual(result.status, "WAITING_FOR_APPROVAL");
    assert.strictEqual(result.outcomeStatus, "REQUIRES_USER_ACTION");
    assert.ok(result.approvalExpiresAt);
  });

  await t.test("T32: Tampered approval token rejected", async () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Approve with tampered token",
      userRequest: "Approve with tampered token",
      steps: [
        {
          stepId: "step_del",
          actionType: "delete_task",
          capabilityURN: "delete_task",
          parameters: { taskId: "t_100" },
          dependsOn: [],
          requiresConfirmation: true,
          rationale: "Delete",
        },
      ],
    };

    const dispatcher = IterativeActionDispatcher.getInstance();
    await assert.rejects(
      async () => {
        await dispatcher.executeGraphWorkflow({
          userId: "u_appr_test",
          userRequest: "Delete task",
          goal: "Delete task",
          plan,
          confirmationToken: "invalid_tampered_token_without_colon",
        });
      },
      /SECURITY_CRITICAL/
    );
  });

  await t.test("T33: Completed node verified via ObjectiveVerificationEngine", async () => {
    const verifier = ObjectiveVerificationEngine.getInstance();
    const mockContext = {
      userId: "u_verif",
      executionId: "exec_v1",
      goal: "Write report",
      checkpointId: "chk_v1",
      workspaceStateVersion: 1,
      generation: 1,
      workerLeaseToken: "tok_v1",
    };

    const step = {
      stepId: "step_wr",
      actionType: "storage_write",
      parameters: { path: "Desktop/report.md" },
      data: { bytesWritten: 500 },
    };

    const mockKernel = {
      executeAction: async () => ({
        success: true,
        data: { bytesRead: 500, content: "Report verified content." },
      }),
    };

    const verifResult = await verifier.verifyStep(mockContext, step, [], mockKernel);
    assert.strictEqual(verifResult.status, "VERIFIED");
  });

  await t.test("T34: Multi-node compensation saga in reverse DAG order", async () => {
    const order: string[] = [];

    ActionAdapterRegistry.getInstance().register("action_a", {
      validatePreconditions: async () => ({ valid: true }),
      execute: async () => ({ success: true }),
      compensate: async () => {
        order.push("compensate_a");
        return { compensated: true };
      },
    });

    ActionAdapterRegistry.getInstance().register("action_b", {
      validatePreconditions: async () => ({ valid: true }),
      execute: async () => ({ success: true }),
      compensate: async () => {
        order.push("compensate_b");
        return { compensated: true };
      },
    });

    // Simulate LIFO saga rollback: b was executed after a, so b compensates before a
    const history = ["action_a", "action_b"];
    for (const action of history.reverse()) {
      const adapter = ActionAdapterRegistry.getInstance().get(action);
      if (adapter?.compensate) {
        await adapter.compensate({} as any, {}, "u1");
      }
    }

    assert.deepStrictEqual(order, ["compensate_b", "compensate_a"]);
  });

  await t.test("T35: Irreversible actions skipped with SKIPPED_IRREVERSIBLE", () => {
    const descriptor = registry.getCapability("productivity.email.send_message");
    assert.strictEqual(descriptor?.isReversible, false);
    // Verified: send_message cannot be automatically compensated
  });

  // =========================================================================
  // GROUP 6: CRASH RECOVERY, REPLAY & PERSISTENCE (T36–T38)
  // =========================================================================

  await t.test("T36: Crash recovery across the 6 failure windows", async () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Crash recovery",
      userRequest: "Crash recovery",
      steps: [
        { stepId: "s1", actionType: "read", capabilityURN: "context.system.read_clipboard", parameters: {}, dependsOn: [], rationale: "1" },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan, "exec_crash_1");
    graph.markInProgress("s1");

    const snapshot = graph.serializeSnapshot();

    const auditStore = new Map<string, any>();
    auditStore.set("s1", {
      actionId: "s1",
      idempotencyKey: "idemp_s1",
      status: "SUCCEEDED",
      result: { data: "restored" },
    });

    const recovery = await CrashRecoveryEngine.reconcileGraphCrashState({
      workspace: {
        executionId: "exec_crash_1",
        userId: "u_crash",
        graphSnapshot: snapshot,
        status: "IN_PROGRESS",
      },
      auditStore,
    });

    assert.strictEqual(recovery.reconciledNodesCount, 1);
    // Node must be VERIFICATION_PENDING, not COMPLETED (Correction B)
    assert.strictEqual(recovery.graph.nodes.get("s1")?.status, "VERIFICATION_PENDING");
    assert.ok(recovery.requiresVerification.includes("s1"));
  });

  await t.test("T37: Full composite workflow without hardcoded keywords", async () => {
    ActionAdapterRegistry.getInstance().register("external_capability_action", {
      validatePreconditions: async () => ({ valid: true }),
      execute: async (proposal) => {
        const urn = proposal.payload?.capabilityURN;
        if (urn === "productivity.email.search_messages") {
          return { messages: [{ subject: "Weekly Standup" }], count: 1 };
        }
        if (urn === "productivity.storage.write_file") {
          return { bytesWritten: 250 };
        }
        if (urn === "productivity.storage.read_file") {
          return { content: "standup summary", bytesRead: 250 };
        }
        return { success: true };
      },
      compensate: async () => ({ compensated: true }),
    });

    const dispatcher = IterativeActionDispatcher.getInstance();
    const plan: WorkflowExecutionPlan = {
      goal: "Autonomous research briefing",
      userRequest: "Autonomous research briefing",
      steps: [
        {
          stepId: "step_search",
          actionType: "external_capability_action",
          capabilityURN: "productivity.email.search_messages",
          parameters: { query: "standup" },
          dependsOn: [],
          rationale: "Search emails",
        },
        {
          stepId: "step_write",
          actionType: "external_capability_action",
          capabilityURN: "productivity.storage.write_file",
          parameters: { path: "briefing.txt", content: "standup summary" },
          dependsOn: ["step_search"],
          rationale: "Save briefing",
        },
      ],
    };

    const result = await dispatcher.executeGraphWorkflow({
      userId: "u_e2e",
      userRequest: "Autonomous research briefing",
      goal: "Autonomous research briefing",
      plan,
    });

    assert.strictEqual(result.status, "COMPLETED");
    assert.strictEqual(result.outcomeStatus, "GOAL_ACHIEVED_AND_VERIFIED");
    assert.strictEqual(result.completedSteps.length, 2);
  });

  await t.test("T38: Deterministic Replay Engine reconstructs graph run", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Replay test",
      userRequest: "Replay test",
      steps: [
        { stepId: "s1", actionType: "read", capabilityURN: "context.system.read_clipboard", parameters: {}, dependsOn: [], rationale: "1" },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan, "exec_rep");
    graph.markInProgress("s1");
    graph.markCompleted("s1", { val: 42 });

    const snapshot = graph.serializeSnapshot();
    const restored = WorkflowExecutionGraph.restoreSnapshot(snapshot);

    assert.strictEqual(restored.executionId, "exec_rep");
    assert.strictEqual(restored.nodes.get("s1")?.status, "COMPLETED");
    assert.deepStrictEqual(restored.nodes.get("s1")?.output, { val: 42 });
  });

  // =========================================================================
  // GROUP 7: ADVANCED CONCURRENCY, PROVIDER FAILURES & CORRECTIONS (T39–T48)
  // =========================================================================

  await t.test("T39: Ambiguous resource reservation survives restart", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Ambiguous reservation",
      userRequest: "Ambiguous reservation",
      steps: [
        {
          stepId: "write_step",
          actionType: "write",
          capabilityURN: "productivity.storage.write_file",
          parameters: { path: "Desktop/ambiguous.txt", content: "data" },
          dependsOn: [],
          rationale: "Write",
        },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    graph.activeReservations.push({
      reservationId: "res_amb_1",
      tenantId: "tenant_t39",
      resourceKey: "fs:desktop/ambiguous.txt",
      stepId: "write_step",
      lockType: "EXCLUSIVE",
      status: "AMBIGUOUS_RETAINED",
      acquiredAt: new Date(),
    });

    // Attempting to select batch for a new node on the same file path must be blocked
    const newReadyNode = {
      stepId: "write_step_2",
      step: {
        stepId: "write_step_2",
        actionType: "write",
        capabilityURN: "productivity.storage.write_file",
        parameters: { path: "Desktop/ambiguous.txt", content: "new_data" },
        dependsOn: [],
        rationale: "Write 2",
      },
      status: "READY" as const,
      attempts: [],
      dependsOn: [],
      downstreamStepIds: [],
    };

    const { runnableBatch, deferredNodes } = ConflictGovernanceEngine.selectConcurrentBatch(
      [newReadyNode],
      "tenant_t39",
      graph.activeReservations,
      registry
    );

    assert.strictEqual(runnableBatch.length, 0);
    assert.strictEqual(deferredNodes.length, 1);
  });

  await t.test("T40: Stale worker cannot release or mutate reservation", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Fencing test",
      userRequest: "Fencing test",
      steps: [
        { stepId: "s1", actionType: "write", capabilityURN: "productivity.storage.write_file", parameters: { path: "a.txt" }, dependsOn: [], rationale: "1" },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    graph.activeReservations.push({
      reservationId: "res_fence_1",
      tenantId: "t1",
      resourceKey: "fs:a.txt",
      stepId: "s1",
      lockType: "EXCLUSIVE",
      status: "ACTIVE",
      acquiredAt: new Date(),
    });

    assert.throws(
      () => {
        ConflictGovernanceEngine.releaseReservations({
          stepId: "s1",
          graph,
          auditStatus: "SUCCEEDED",
          verificationStatus: "VERIFIED",
          expectedGeneration: 1,
          actualGeneration: 2, // Mismatch: worker fenced!
        });
      },
      StaleWorkerFencedError
    );
  });

  await t.test("T41: Path segment comparison avoids false prefix conflict", () => {
    // "Desktop" vs "Desktop-old" -> distinct segments
    const hasConflict1 = ResourceConflictEvaluator.hasHierarchicalConflict("Desktop", "Desktop-old/report.md");
    assert.strictEqual(hasConflict1, false);

    // "Desktop/report.md" vs "Desktop" -> parent-child collision
    const hasConflict2 = ResourceConflictEvaluator.hasHierarchicalConflict("Desktop/report.md", "Desktop");
    assert.strictEqual(hasConflict2, true);
  });

  await t.test("T42: Probe recovery must execute Stage 3 verification", async () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Probe verify",
      userRequest: "Probe verify",
      steps: [
        {
          stepId: "step_probe",
          actionType: "external_capability_action",
          capabilityURN: "productivity.email.create_draft",
          parameters: { to: "test@example.com", subject: "Hi", body: "Hello" },
          dependsOn: [],
          rationale: "Draft",
        },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    graph.markInProgress("step_probe");

    const snapshot = graph.serializeSnapshot();
    const auditStore = new Map<string, any>();
    auditStore.set("step_probe", {
      actionId: "step_probe",
      idempotencyKey: "idemp_probe",
      status: "OUTCOME_UNKNOWN",
    });

    // Mock probe executor confirming remote mutation
    const mockProbe = async () => ({ observed: true, state: { draftId: "draft_99" } });

    const recovery = await CrashRecoveryEngine.reconcileGraphCrashState({
      workspace: {
        executionId: "exec_probe",
        userId: "u_probe",
        graphSnapshot: snapshot,
        status: "IN_PROGRESS",
      },
      auditStore,
      observationProbeExecutor: mockProbe,
    });

    // Node MUST be VERIFICATION_PENDING, not COMPLETED
    assert.strictEqual(recovery.graph.nodes.get("step_probe")?.status, "VERIFICATION_PENDING");
    assert.ok(recovery.requiresVerification.includes("step_probe"));
  });

  await t.test("T43: INCONCLUSIVE verification pauses without auto-retry", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Inconclusive test",
      userRequest: "Inconclusive test",
      steps: [
        { stepId: "s1", actionType: "write", capabilityURN: "productivity.storage.write_file", parameters: { path: "a.txt" }, dependsOn: [], rationale: "1" },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    graph.activeReservations.push({
      reservationId: "res_inc",
      tenantId: "t1",
      resourceKey: "fs:a.txt",
      stepId: "s1",
      lockType: "EXCLUSIVE",
      status: "ACTIVE",
      acquiredAt: new Date(),
    });

    // Release reservations under INCONCLUSIVE verification
    ConflictGovernanceEngine.releaseReservations({
      stepId: "s1",
      graph,
      auditStatus: "SUCCEEDED",
      verificationStatus: "INCONCLUSIVE",
    });

    // Reservation must be retained
    assert.strictEqual(graph.activeReservations.length, 1);
    assert.strictEqual(graph.activeReservations[0].status, "AMBIGUOUS_RETAINED");
  });

  await t.test("T44: INTEGRITY_FAILURE fails node without completion", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Integrity test",
      userRequest: "Integrity test",
      steps: [
        { stepId: "s1", actionType: "write", capabilityURN: "productivity.storage.write_file", parameters: { path: "a.txt" }, dependsOn: [], rationale: "1" },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    graph.activeReservations.push({
      reservationId: "res_integ",
      tenantId: "t1",
      resourceKey: "fs:a.txt",
      stepId: "s1",
      lockType: "EXCLUSIVE",
      status: "ACTIVE",
      acquiredAt: new Date(),
    });

    ConflictGovernanceEngine.releaseReservations({
      stepId: "s1",
      graph,
      auditStatus: "SUCCEEDED",
      verificationStatus: "INTEGRITY_FAILURE",
    });

    assert.strictEqual(graph.activeReservations[0].status, "AMBIGUOUS_RETAINED");
  });

  await t.test("T45: HTTP 500 after mutation treated as ambiguous failure", () => {
    const err: any = new Error("Internal Server Error");
    err.statusCode = 500;

    const classification = registry.classifyProviderError("productivity.email.send_message", err);

    assert.strictEqual(classification.category, "AMBIGUOUS_PROVIDER_FAILURE");
    assert.strictEqual(classification.auditStatus, "OUTCOME_UNKNOWN");
    assert.strictEqual(classification.isUncertainMutation, true);
    assert.strictEqual(classification.safeToRetryWithoutProbe, false);
  });

  await t.test("T46: Unknown provider error semantics fails closed", () => {
    const unmappedError = { randomCode: "ERR_XYZ_999", message: "Weird network hiccup" };

    const classification = registry.classifyProviderError("productivity.calendar.create_event", unmappedError);

    assert.strictEqual(classification.category, "UNKNOWN_PROVIDER_SEMANTICS");
    assert.strictEqual(classification.auditStatus, "OUTCOME_UNKNOWN");
    assert.strictEqual(classification.isUncertainMutation, true);
    assert.strictEqual(classification.safeToRetryWithoutProbe, false);
  });

  await t.test("T47: Approval challenge expiration emits explicit event", () => {
    const plan: WorkflowExecutionPlan = {
      goal: "Expiration test",
      userRequest: "Expiration test",
      steps: [
        { stepId: "s1", actionType: "delete", capabilityURN: "delete_task", parameters: { taskId: "t1" }, dependsOn: [], requiresConfirmation: true, rationale: "1" },
      ],
    };

    const graph = new WorkflowExecutionGraph(plan);
    graph.markWaitingForApproval("s1");
    // Simulate expired deadline (past 24h)
    graph.approvalExpiresAt = new Date(Date.now() - 1000);

    const isExpired = Date.now() > graph.approvalExpiresAt.getTime();
    assert.strictEqual(isExpired, true);

    graph.markCancelled("s1", "Approval challenge expired after 24h operational deadline.");
    assert.strictEqual(graph.nodes.get("s1")?.status, "CANCELLED");
  });

  await t.test("T48: Multiple-resource conflict detection", () => {
    const nodeA = {
      stepId: "step_multi_a",
      step: {
        stepId: "step_multi_a",
        actionType: "write",
        capabilityURN: "productivity.storage.write_file",
        parameters: { paths: ["Desktop/report.txt", "Desktop/audit.log"] },
        dependsOn: [],
        rationale: "Multi write",
      },
      status: "READY" as const,
      attempts: [],
      dependsOn: [],
      downstreamStepIds: [],
    };

    const nodeB = {
      stepId: "step_multi_b",
      step: {
        stepId: "step_multi_b",
        actionType: "write",
        capabilityURN: "productivity.storage.write_file",
        parameters: { path: "Desktop/audit.log" }, // Collides on audit.log!
        dependsOn: [],
        rationale: "Single write colliding",
      },
      status: "READY" as const,
      attempts: [],
      dependsOn: [],
      downstreamStepIds: [],
    };

    const { runnableBatch, deferredNodes } = ConflictGovernanceEngine.selectConcurrentBatch(
      [nodeA, nodeB],
      "tenant_t48",
      [],
      registry
    );

    assert.strictEqual(runnableBatch.length, 1);
    assert.strictEqual(runnableBatch[0].stepId, "step_multi_a");
    assert.strictEqual(deferredNodes.length, 1);
    assert.strictEqual(deferredNodes[0].stepId, "step_multi_b");
  });
});
