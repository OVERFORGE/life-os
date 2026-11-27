/**
 * stage2AgenticPipelineDb.test.ts
 *
 * Isolated real MongoDB (MongoMemoryReplSet) end-to-end Stage 2 integration suite:
 * - Simple-read optimization through KernelCapabilityService + canonical synthesis + SSE assistant_delta
 * - Multi-source investigative DAG with mixed populated & empty Stage 1 reads
 * - ExecutionPersistenceService checkpointing & ActionAuditRecordModel persistence verification
 * - Mixed read + HITL mutation boundary preservation
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { DynamicRouter } from "../orchestration/supervisor/DynamicRouter";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { SemanticIntentInterpreter } from "../orchestration/semantic/SemanticIntentInterpreter";
import { GroundedResponseGenerator } from "../orchestration/grounding/GroundedResponseGenerator";
import { IterativeActionDispatcher } from "../orchestration/kernel/IterativeActionDispatcher";
import { setMockGroqChat } from "../shared/groq";

if (!process.env.KERNEL_HMAC_SECRET || process.env.KERNEL_HMAC_SECRET.length < 32) {
  process.env.KERNEL_HMAC_SECRET = "stage2-db-test-hmac-secret-32-bytes-key!";
}

describe("Stage 2: Real Isolated Database End-to-End Agentic Pipeline", () => {
  const userA = new mongoose.Types.ObjectId().toString();
  const userB = new mongoose.Types.ObjectId().toString();

  before(async () => {
    await connectIsolatedTestDB({
      dbName: "life-os-stage2-db-test",
      useMemoryReplSet: true,
    });
  });

  after(async () => {
    setMockGroqChat(undefined);
    SemanticIntentInterpreter.getInstance().setMockChat(undefined);
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  it("executes simple-read through KernelCapabilityService, enforces tenant isolation, synthesizes once, emits SSE assistant_delta, and persists audit record", async () => {
    const { Task } = await import("../../../../apps/web/server/db/models/Task");
    const { ActionAuditRecordModel } = await import("../../../../apps/web/server/db/models/ActionAuditRecordModel");

    await Task.deleteMany({});
    await ActionAuditRecordModel.deleteMany({});

    await Task.create([
      { userId: userA, title: "Prepare architecture review", status: "pending", priority: "high", dueDate: "2026-11-26" },
      { userId: userB, title: "User B confidential task", status: "pending", priority: "high", dueDate: "2026-11-26" },
    ]);

    const adapterRegistry = ActionAdapterRegistry.getInstance();
    registerDefaultActionAdapters(adapterRegistry);
    const kernel = new KernelCapabilityService(adapterRegistry, { auditModel: ActionAuditRecordModel as any });
    const supervisor = Supervisor.createDefault(kernel);

    const interpreter = SemanticIntentInterpreter.getInstance();
    interpreter.setMockChat(async () =>
      JSON.stringify({
        primaryClassification: "INFORMATION_QUERY",
        ambiguityStatus: "UNAMBIGUOUS",
        requiresRetrieval: true,
        relevanceDomains: ["TASKS"],
        objectiveComplexity: "SIMPLE",
        conversationalSummary: "List pending tasks.",
        operations: [
          {
            operationId: "op_simple_task_read",
            actionType: "lifeos.tasks.query",
            capabilityURN: "lifeos.tasks.query",
            requiresConfirmation: false,
            payload: { status: "pending", limit: 10 },
          },
        ],
      })
    );

    const gen = GroundedResponseGenerator.getInstance();
    const origSynth = gen.synthesizeFromEvidence.bind(gen);
    let synthCount = 0;
    gen.synthesizeFromEvidence = async (pkg, opts) => {
      synthCount++;
      assert.equal(pkg.items[0].coverageStatus, "READ_WITH_DATA");
      assert.equal(pkg.items[0].returnedCount, 1);
      const titles = (pkg.items[0].allowlistedSummary?.items || []).map((t: any) => t.title);
      assert.deepEqual(titles, ["Prepare architecture review"]);
      return origSynth(pkg, {
        ...opts,
        llmComplete: async () => `You have 1 pending task: ${titles.join(", ")}.`,
      });
    };

    try {
      const sseEvents: any[] = [];
      const result = await supervisor.processRequest({
        userId: userA,
        message: "What pending tasks do I have?",
        timezone: "UTC",
        onEvent: (ev) => sseEvents.push(ev),
      });

      assert.equal(synthCount, 1, "Canonical synthesis must run exactly once on simple-read");
      assert.equal(result.routingDecision.strategy, "SINGLE_SPECIALIST");
      assert.ok(result.response.includes("Prepare architecture review"));
      assert.ok(!result.response.includes("User B confidential task"), "Tenant isolation violated");
      assert.ok(!result.response.includes("completed successfully"));
      assert.ok(sseEvents.some((e) => e.type === "assistant_delta" && e.text.includes("Prepare architecture review")));

      const persistedAudits = await ActionAuditRecordModel.find({ userId: userA }).lean();
      assert.equal(persistedAudits.length, 1, "Audit record must be persisted in MongoDB");
      assert.equal((persistedAudits[0] as any).actionType, "lifeos.tasks.query");
      assert.equal((persistedAudits[0] as any).status, "SUCCEEDED");
    } finally {
      gen.synthesizeFromEvidence = origSynth;
      interpreter.setMockChat(undefined);
    }
  });

  it("executes investigative multi-source DAG with empty telemetry, persists checkpoint, synthesizes once, and emits assistant_delta", async () => {
    const { Task } = await import("../../../../apps/web/server/db/models/Task");
    const { Goal } = await import("../../../../apps/web/features/goals/models/Goal");
    const { ExecutionWorkspaceModel } = await import("../../../../apps/web/server/db/models/ExecutionWorkspaceModel");
    const { ActionAuditRecordModel } = await import("../../../../apps/web/server/db/models/ActionAuditRecordModel");

    await Task.deleteMany({});
    await Goal.deleteMany({});
    await ExecutionWorkspaceModel.deleteMany({});
    await ActionAuditRecordModel.deleteMany({});

    await Task.create([{ userId: userA, title: "Draft Stage 2 summary", status: "pending", priority: "medium", dueDate: "2026-11-26" }]);
    await Goal.create([{ userId: userA, title: "Maintain weekly deep work", nature: "habitual_cadence", cadence: "weekly", status: "active" }]);

    const adapterRegistry = ActionAdapterRegistry.getInstance();
    registerDefaultActionAdapters(adapterRegistry);
    const kernel = new KernelCapabilityService(adapterRegistry, { auditModel: ActionAuditRecordModel as any });
    const supervisor = Supervisor.createDefault(kernel);

    const interpreter = SemanticIntentInterpreter.getInstance();
    interpreter.setMockChat(async () =>
      JSON.stringify({
        primaryClassification: "INFORMATION_QUERY",
        ambiguityStatus: "UNAMBIGUOUS",
        requiresRetrieval: true,
        relevanceDomains: ["TASKS", "HEALTH"],
        objectiveComplexity: "INVESTIGATIVE",
        informationNeed: "Review tasks, goals, and cognitive telemetry",
        conversationalSummary: "Investigative review.",
        operations: [],
      })
    );

    let callIndex = 0;
    setMockGroqChat(async () => {
      callIndex++;
      if (callIndex === 1) {
        return JSON.stringify({
          goal: "Review tasks, goals, and telemetry",
          userRequest: "How am I tracking on my goals and energy?",
          steps: [
            {
              stepId: "s_tasks",
              actionType: "lifeos.tasks.query",
              capabilityURN: "lifeos.tasks.query",
              parameters: { status: "pending", limit: 10 },
              dependsOn: [],
              rationale: "Read active tasks",
            },
            {
              stepId: "s_goals",
              actionType: "lifeos.goals.query",
              capabilityURN: "lifeos.goals.query",
              parameters: { status: "active", limit: 10 },
              dependsOn: [],
              rationale: "Read active goals",
            },
            {
              stepId: "s_tele",
              actionType: "lifeos.telemetry.query_state_history",
              capabilityURN: "lifeos.telemetry.query_state_history",
              parameters: { startDate: "2026-11-19", endDate: "2026-11-26" },
              dependsOn: [],
              rationale: "Read cognitive telemetry",
            },
            {
              stepId: "s_synth",
              actionType: "synthesis",
              capabilityURN: "synthesis",
              parameters: {},
              dependsOn: ["s_tasks", "s_goals", "s_tele"],
              rationale: "Synthesize findings",
            },
          ],
        });
      }
      return "You have 1 active goal (Maintain weekly deep work) and 1 pending task (Draft Stage 2 summary). No cognitive telemetry records were logged for 2026-11-19 through 2026-11-26.";
    });

    const gen = GroundedResponseGenerator.getInstance();
    const origSynth = gen.synthesizeFromEvidence.bind(gen);
    let synthCount = 0;
    gen.synthesizeFromEvidence = async (pkg, opts) => {
      synthCount++;
      assert.equal(pkg.items.find((i) => i.capabilityURN === "lifeos.telemetry.query_state_history")?.coverageStatus, "READ_EMPTY");
      return origSynth(pkg, opts);
    };

    try {
      const sseEvents: any[] = [];
      const result = await supervisor.processRequest({
        userId: userA,
        message: "How am I tracking on my goals and energy?",
        timezone: "UTC",
        referenceTimeMs: Date.UTC(2026, 10, 26, 9, 0, 0),
        onEvent: (ev) => sseEvents.push(ev),
      });

      assert.equal(result.routingDecision.strategy, "DYNAMIC_WORKFLOW");
      assert.equal(result.workspaceStatus, "COMPLETED");
      assert.equal(synthCount, 1, "Graph synthesis node must invoke canonical synthesis exactly once");
      assert.ok(result.response.includes("Maintain weekly deep work"));
      assert.ok(result.response.includes("No cognitive telemetry records"));
      const streamedText = sseEvents
        .filter((e) => e.type === "assistant_delta")
        .map((e) => e.text || "")
        .join("");
      assert.ok(streamedText.includes("Maintain weekly deep work"));

      const persistedWorkspace = await ExecutionWorkspaceModel.findOne({ executionId: result.executionId, userId: userA }).lean();
      assert.ok(persistedWorkspace, "ExecutionWorkspaceModel checkpoint must be persisted in MongoDB");
      assert.equal((persistedWorkspace as any).status, "COMPLETED");

      const persistedAudits = await ActionAuditRecordModel.find({ userId: userA }).lean();
      assert.equal(persistedAudits.length, 3, "All 3 Stage 1 read steps must persist audit records");
    } finally {
      gen.synthesizeFromEvidence = origSynth;
      setMockGroqChat(undefined);
      interpreter.setMockChat(undefined);
    }
  });

  it("preserves HITL approval pause on mixed read + write workflows without executing unapproved mutations", async () => {
    const adapterRegistry = ActionAdapterRegistry.getInstance();
    registerDefaultActionAdapters(adapterRegistry);
    let writeExecuted = false;
    adapterRegistry.register("external_capability_action", {
      validatePreconditions: async () => ({ valid: true }),
      execute: async () => {
        writeExecuted = true;
        return { bytesWritten: 100 };
      },
      compensate: async () => ({ compensated: true }),
    });

    const kernel = new KernelCapabilityService(adapterRegistry);
    const dispatcher = new IterativeActionDispatcher(kernel);

    const res = await dispatcher.executeGraphWorkflow({
      userId: userA,
      userRequest: "Read my tasks and write summary file",
      goal: "Read tasks and write file",
      plan: {
        goal: "Read tasks and write file",
        userRequest: "Read my tasks and write summary file",
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
            stepId: "s_write",
            actionType: "external_capability_action",
            capabilityURN: "productivity.storage.write_file",
            parameters: { path: "tasks_summary.txt", content: "summary" },
            dependsOn: ["s_read"],
            requiresConfirmation: true,
            rationale: "Write summary file",
          },
        ],
      },
    });

    assert.equal(res.status, "WAITING_FOR_APPROVAL");
    assert.equal(res.outcomeStatus, "REQUIRES_USER_ACTION");
    assert.equal(writeExecuted, false, "Unapproved write must never execute");
    assert.equal(res.completedSteps.length, 1, "Read step runs before pausing at HITL write gate");
  });
});
