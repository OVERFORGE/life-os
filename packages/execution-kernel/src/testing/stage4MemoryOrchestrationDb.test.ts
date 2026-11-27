import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { SemanticIntentInterpreter } from "../orchestration/semantic/SemanticIntentInterpreter";
import { DynamicWorkflowPlanner } from "../orchestration/planning/DynamicWorkflowPlanner";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { WorldModelBridge } from "../worldv2/WorldModelBridge";
import { ContextProjectionSerializer } from "../worldv2/ContextProjectionSerializer";
import { MemoryRepository } from "../memory/MemoryRepository";
import { DeterministicMockEmbeddingProvider } from "../memory/EmbeddingProvider";
import { DEFAULT_MEMORY_POLICY } from "../memory/PersonalMemoryContracts";

describe("Stage 4 Increment 4.5: Orchestration, SemanticTurn Meta & World Context", () => {
  const userA = new mongoose.Types.ObjectId().toString();
  const userB = new mongoose.Types.ObjectId().toString();

  before(async () => {
    await connectIsolatedTestDB({
      dbName: "life-os-stage4-inc45-test",
      useMemoryReplSet: true,
    });
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    const { ActionAuditRecordModel } = await import("../../../../apps/web/server/db/models/ActionAuditRecordModel");
    await PersonalMemory.syncIndexes();
    await ActionAuditRecordModel.syncIndexes();
  });

  after(async () => {
    SemanticIntentInterpreter.getInstance().setMockChat(undefined);
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    SemanticIntentInterpreter.getInstance().setMockChat(undefined);
    MemoryRepository.getInstance().clearInMemoryStore();
    WorldModelBridge.getInstance().evictUserCache(userA);
    WorldModelBridge.getInstance().evictUserCache(userB);
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    const { ActionAuditRecordModel } = await import("../../../../apps/web/server/db/models/ActionAuditRecordModel");
    await PersonalMemory.deleteMany({});
    await ActionAuditRecordModel.deleteMany({});
  });

  it("4.5-01: SemanticIntentInterpreter + Supervisor route personal recall to lifeos.memory.search with audit trail", async () => {
    const { ActionAuditRecordModel } = await import("../../../../apps/web/server/db/models/ActionAuditRecordModel");
    const repo = new MemoryRepository(DEFAULT_MEMORY_POLICY, new DeterministicMockEmbeddingProvider(384));

    await repo.createMemory({
      userId: userA,
      content: "User avoids heavy squats due to left knee tendonitis.",
      summary: "Left knee tendonitis constraint",
      memoryType: "semantic_fact",
      domain: "health",
      source: "explicit_user_statement",
      confidence: 0.94,
      importance: 0.9,
    });

    let capturedPrompt = "";
    SemanticIntentInterpreter.getInstance().setMockChat(async ({ messages }) => {
      capturedPrompt = messages[0]?.content || "";
      return JSON.stringify({
        primaryClassification: "INFORMATION_QUERY",
        ambiguityStatus: "UNAMBIGUOUS",
        requiresRetrieval: true,
        relevanceDomains: ["HEALTH"],
        objectiveComplexity: "SIMPLE",
        informationNeed: "Recall user's remembered knee constraints",
        conversationalSummary: "Asked about remembered knee constraints",
        operations: [
          {
            operationId: "op_mem_1",
            actionType: "lifeos.memory.search",
            requiresConfirmation: false,
            payload: {
              capabilityURN: "lifeos.memory.search",
              parameters: { query: "knee constraints", domain: "health", limit: 5 },
            },
          },
        ],
      });
    });

    const supervisor = Supervisor.getInstance();
    const events: any[] = [];
    const res = await supervisor.processRequest({
      userId: userA,
      userName: "Daksh",
      conversationId: "conv_45_1",
      message: "What do you remember about my knee?",
      streamMode: "events",
      onEvent: (ev) => events.push(ev),
    });

    assert.ok(capturedPrompt.includes("lifeos.memory.search"), "Interpreter prompt must expose lifeos.memory.search");
    assert.strictEqual(res.semanticTurnMeta?.primaryClassification, "INFORMATION_QUERY");
    assert.strictEqual(res.semanticTurnMeta?.operationsCount, 1);
    assert.ok(events.some((e) => e.type === "tool_activity" && e.capabilityURN === "lifeos.memory.search"));

    const auditCount = await ActionAuditRecordModel.countDocuments({
      userId: userA,
      actionType: "lifeos.memory.search",
      status: "SUCCEEDED",
    });
    assert.strictEqual(auditCount, 1);
  });

  it("4.5-02: DynamicWorkflowPlanner plans parallel lifeos.memory.search + live query steps with synthesis", async () => {
    const planner = new DynamicWorkflowPlanner({
      llmClient: {
        complete: async (prompt: string) => {
          assert.ok(prompt.includes("lifeos.memory.search"));
          return JSON.stringify({
            goal: "Plan today around constraints and tasks",
            userRequest: "Suggest what to do today based on my constraints and tasks",
            steps: [
              {
                stepId: "step_mem",
                actionType: "lifeos.memory.search",
                capabilityURN: "lifeos.memory.search",
                parameters: { query: "constraints focus", limit: 5 },
                dependsOn: [],
                rationale: "Retrieve active personal constraints",
              },
              {
                stepId: "step_tasks",
                actionType: "lifeos.tasks.query",
                capabilityURN: "lifeos.tasks.query",
                parameters: { status: "pending", limit: 10 },
                dependsOn: [],
                rationale: "Retrieve pending tasks",
              },
              {
                stepId: "step_synth",
                actionType: "synthesis",
                capabilityURN: "synthesis",
                parameters: { targetPrompt: "Synthesize recommendations respecting constraints" },
                dependsOn: ["step_mem", "step_tasks"],
                rationale: "Grounded synthesis",
              },
            ],
          });
        },
      },
      allowBenchmarkFallback: false,
    });

    const plan = await planner.planWorkflow({
      userRequest: "Suggest what to do today based on my constraints and tasks",
      goal: "Plan today around constraints and tasks",
    });

    assert.strictEqual(plan.steps.length, 3);
    assert.strictEqual(plan.steps[0].capabilityURN, "lifeos.memory.search");
    assert.strictEqual(plan.steps[1].capabilityURN, "lifeos.tasks.query");
    assert.strictEqual(plan.steps[2].capabilityURN, "synthesis");
  });

  it("4.5-03: WorldModelBridge projects bounded active constraints excluding stale, expired, superseded, low-confidence, and cross-tenant rows", async () => {
    const repo = new MemoryRepository(DEFAULT_MEMORY_POLICY, new DeterministicMockEmbeddingProvider(384));
    const now = Date.now();

    const active = await repo.createMemory({
      userId: userA,
      content: "User strictly avoids dairy products",
      summary: "No dairy constraint",
      memoryType: "semantic_fact",
      domain: "health",
      source: "explicit_user_statement",
      confidence: 0.95,
      importance: 0.9,
      validFrom: now - 10000,
    });

    const stale = await repo.createMemory({
      userId: userA,
      content: "Old stale running preference",
      summary: "Stale running preference",
      memoryType: "behavioral_pattern",
      domain: "health",
      source: "explicit_user_statement",
      confidence: 0.9,
    });
    await repo.update(stale.id, userA, { lifecycleStatus: "stale" });

    const lowConf = await repo.createMemory({
      userId: userA,
      content: "Weak guess about bedtime",
      summary: "Low confidence bedtime",
      memoryType: "semantic_fact",
      domain: "wellness",
      source: "system_inference",
      confidence: 0.4,
    });
    assert.ok(lowConf.id);

    const superseded = await repo.createMemory({
      userId: userA,
      content: "Superseded 5pm coffee habit",
      summary: "Superseded coffee habit",
      memoryType: "behavioral_pattern",
      domain: "wellness",
      source: "explicit_user_statement",
      confidence: 0.9,
    });
    await repo.supersedeMemory(userA, superseded.id, active.id);

    await repo.createMemory({
      userId: userB,
      content: "User B private constraint",
      summary: "User B secret constraint",
      memoryType: "semantic_fact",
      domain: "health",
      source: "explicit_user_statement",
      confidence: 0.99,
    });

    MemoryRepository.getInstance().clearInMemoryStore();

    const projA = await WorldModelBridge.getInstance().getProjection(userA, { forceRefresh: true });
    assert.strictEqual(projA.activeMemoryConstraints?.length, 1);
    assert.strictEqual(projA.activeMemoryConstraints?.[0].memoryId, active.id);

    const serialized = ContextProjectionSerializer.selectContext(projA, "HEALTH", 1400);
    assert.ok(serialized.serializedContext.includes("Remembered Constraints: No dairy constraint"));
    assert.ok(!serialized.serializedContext.includes("Stale running"));
    assert.ok(!serialized.serializedContext.includes("Superseded coffee"));
    assert.ok(!serialized.serializedContext.includes("User B secret"));
  });

  it("4.5-04: Exposes CASUAL_DIALOGUE semanticTurnMeta from SupervisorResponse", async () => {
    SemanticIntentInterpreter.getInstance().setMockChat(async () =>
      JSON.stringify({
        primaryClassification: "CASUAL_DIALOGUE",
        ambiguityStatus: "UNAMBIGUOUS",
        requiresRetrieval: false,
        relevanceDomains: ["GENERAL"],
        objectiveComplexity: "SIMPLE",
        conversationalSummary: "User said hello",
        operations: [],
      })
    );

    const supervisor = Supervisor.getInstance();
    const res = await supervisor.processRequest({
      userId: userA,
      userName: "Daksh",
      conversationId: "conv_45_casual",
      message: "Hey Aven!",
    });

    assert.strictEqual(res.routingDecision.strategy, "CONVERSATIONAL_LLM");
    assert.strictEqual(res.semanticTurnMeta?.primaryClassification, "CASUAL_DIALOGUE");
    assert.strictEqual(res.semanticTurnMeta?.operationsCount, 0);
    assert.strictEqual(res.semanticTurnMeta?.hasOperations, false);
  });
});
