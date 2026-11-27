import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { DurableMemoryJobQueue } from "../memory/DurableMemoryJobQueue";
import { MemoryFormationPipeline, IMemorySemanticExtractor } from "../memory/MemoryFormationPipeline";
import { MemoryRepository } from "../memory/MemoryRepository";
import { DeterministicMockEmbeddingProvider } from "../memory/EmbeddingProvider";
import { DEFAULT_MEMORY_POLICY } from "../memory/PersonalMemoryContracts";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { buildExecutionEvidencePackage } from "../orchestration/grounding/EvidencePackageBuilder";
import { GroundedResponseGenerator } from "../orchestration/grounding/GroundedResponseGenerator";

describe("Stage 4 Increment 4.6: Epistemic Grounding & End-to-End Memory Quality Lifecycle", () => {
  const userA = new mongoose.Types.ObjectId().toString();
  let kernel: KernelCapabilityService;

  before(async () => {
    await connectIsolatedTestDB({
      dbName: "life-os-stage4-inc46-test",
      useMemoryReplSet: true,
    });
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    const { MemoryJob } = await import("../../../../apps/web/server/db/models/MemoryJob");
    const { Task } = await import("../../../../apps/web/server/db/models/Task");
    const { ActionAuditRecordModel } = await import("../../../../apps/web/server/db/models/ActionAuditRecordModel");
    await Promise.all([
      PersonalMemory.syncIndexes(),
      MemoryJob.syncIndexes(),
      Task.syncIndexes(),
      ActionAuditRecordModel.syncIndexes(),
    ]);

    const adapters = new ActionAdapterRegistry();
    registerDefaultActionAdapters(adapters);
    kernel = new KernelCapabilityService(adapters, { auditModel: ActionAuditRecordModel });
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    MemoryRepository.getInstance().clearInMemoryStore();
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    const { MemoryJob } = await import("../../../../apps/web/server/db/models/MemoryJob");
    const { Task } = await import("../../../../apps/web/server/db/models/Task");
    await Promise.all([
      PersonalMemory.deleteMany({}),
      MemoryJob.deleteMany({}),
      Task.deleteMany({}),
    ]);
  });

  it("4.6-01: End-to-End Memory Quality: original preference -> correction -> supersession -> retrieval -> temporal bounds -> grounded synthesis", async () => {
    const repo = new MemoryRepository(DEFAULT_MEMORY_POLICY, new DeterministicMockEmbeddingProvider(384));
    const extractor: IMemorySemanticExtractor = {
      async extract(turn) {
        if (turn.userMessage.includes("never work out after 6pm")) {
          return [
            {
              userId: turn.userId,
              content: "User never works out after 6pm and strictly avoids dairy.",
              summary: "No evening workouts and no dairy",
              source: "explicit_user_statement",
              domain: "health",
              memoryType: "semantic_fact",
              slotKey: "workout_and_diet_preference",
            },
          ];
        }
        return [
          {
            userId: turn.userId,
            content: "User now works out in the evening at 7pm and eats yogurt.",
            summary: "Evening 7pm workouts and yogurt allowed",
            source: "explicit_user_statement",
            domain: "health",
            memoryType: "semantic_fact",
            slotKey: "workout_and_diet_preference",
          },
        ];
      },
      async classifyContradiction(candidate, existing) {
        return candidate.slotKey === existing.slotKey ? "CONTRADICTS" : "UNRELATED";
      },
    };

    const pipeline = new MemoryFormationPipeline(
      repo,
      new DeterministicMockEmbeddingProvider(384),
      undefined,
      undefined,
      extractor
    );
    const queue = new DurableMemoryJobQueue(pipeline);

    // 1. Store original preference via DurableMemoryJobQueue
    const j1 = await queue.enqueueTurn(
      {
        userId: userA,
        conversationId: "conv_quality",
        requestId: "req_q_1",
        userMessage: "I never work out after 6pm and strictly avoid dairy.",
        assistantResponse: "Got it, noted.",
      },
      { immediateProcess: false }
    );
    await queue.processJob(j1.jobId);

    // 2. Store explicit later correction
    const j2 = await queue.enqueueTurn(
      {
        userId: userA,
        conversationId: "conv_quality",
        requestId: "req_q_2",
        userMessage: "Actually I switched to evening workouts at 7pm and eat yogurt again.",
        assistantResponse: "Updated!",
      },
      { immediateProcess: false }
    );
    await queue.processJob(j2.jobId);

    // 3. Retrieve via lifeos.memory.search capability
    MemoryRepository.getInstance().clearInMemoryStore();
    const searchRes = await kernel.executeAction(userA, {
      id: "prop_e2e_mem",
      domain: "context",
      actionType: "lifeos.memory.search",
      payload: { query: "workouts dairy preference", limit: 5 },
      rationale: "Check current user workout and dietary preferences",
      reversibility: "atomic_single_doc",
      idempotencyKey: "idem_e2e_mem",
    });

    assert.strictEqual(searchRes.success, true);
    assert.strictEqual(searchRes.data.returnedCount, 1);
    assert.ok(searchRes.data.items[0].content.includes("7pm"));
    assert.ok(!searchRes.data.items[0].content.includes("never works out after 6pm"));

    // 4. Verify expired referenceTime excludes records whose validFrom is in the future
    const pastWindowRes = await kernel.executeAction(userA, {
      id: "prop_e2e_past",
      domain: "context",
      actionType: "lifeos.memory.search",
      payload: { query: "workouts", referenceTime: "2020-01-01T00:00:00.000Z" },
      rationale: "Check historical window exclusion",
      reversibility: "atomic_single_doc",
      idempotencyKey: "idem_e2e_past",
    });
    assert.strictEqual(pastWindowRes.data.returnedCount, 0);

    // 5. Grounded synthesis must state current truth and NOT present superseded info as current
    const evidencePkg = buildExecutionEvidencePackage({
      objective: "What are my current workout and dairy preferences?",
      steps: [
        {
          stepId: "step_mem",
          capabilityURN: "lifeos.memory.search",
          actionType: "lifeos.memory.search",
          data: searchRes.data,
          success: true,
          auditId: searchRes.actionId,
        },
      ],
    });

    let capturedSynthesisPrompt = "";
    const answer = await GroundedResponseGenerator.getInstance().synthesizeFromEvidence(evidencePkg, {
      llmComplete: async (prompt) => {
        capturedSynthesisPrompt = prompt;
        return "You currently work out in the evening at 7pm and include yogurt in your diet.";
      },
    });

    assert.ok(capturedSynthesisPrompt.includes("NEVER present superseded or expired memories as active") || capturedSynthesisPrompt.includes("never present superseded or expired memories as active"));
    assert.ok(answer.includes("7pm") && answer.includes("yogurt"));
    assert.ok(!answer.includes("never work out after 6pm"));
    assert.ok(!answer.includes("strictly avoid dairy"));

    // Also verify deterministic fallback renders current truth cleanly without superseded claims
    const fallbackAnswer = await GroundedResponseGenerator.getInstance().synthesizeFromEvidence(evidencePkg, {
      llmComplete: async () => "",
    });
    assert.ok(fallbackAnswer.includes("Evening 7pm workouts"));
    assert.ok(!fallbackAnswer.includes("No evening workouts"));
  });

  it("4.6-02: Live authoritative Tasks override contradictory historical memory and disputed/empty cases are disclosed honestly", async () => {
    const { Task } = await import("../../../../apps/web/server/db/models/Task");
    const repo = new MemoryRepository(DEFAULT_MEMORY_POLICY, new DeterministicMockEmbeddingProvider(384));

    await repo.createMemory({
      userId: userA,
      content: "User keeps forgetting to finish the Q4 tax filing task",
      summary: "Q4 tax filing pending memory",
      memoryType: "episodic_event",
      domain: "productivity",
      source: "explicit_user_statement",
      confidence: 0.85,
    });

    await Task.create({
      userId: new mongoose.Types.ObjectId(userA),
      title: "Q4 tax filing",
      status: "completed",
      priority: "high",
      dueDate: "2026-11-30",
    });

    const memRes = await kernel.executeAction(userA, {
      id: "prop_mem_conflict",
      domain: "context",
      actionType: "lifeos.memory.search",
      payload: { query: "Q4 tax filing" },
      rationale: "Read memory",
      reversibility: "atomic_single_doc",
      idempotencyKey: "idem_mem_conflict",
    });

    const taskRes = await kernel.executeAction(userA, {
      id: "prop_tasks_live",
      domain: "productivity",
      actionType: "lifeos.tasks.query",
      payload: { search: "Q4 tax filing", status: "all" },
      rationale: "Read authoritative live tasks",
      reversibility: "atomic_single_doc",
      idempotencyKey: "idem_tasks_live",
    });

    const pkg = buildExecutionEvidencePackage({
      objective: "Did I finish Q4 tax filing?",
      steps: [
        { stepId: "s1", capabilityURN: "lifeos.memory.search", data: memRes.data, success: true },
        { stepId: "s2", capabilityURN: "lifeos.tasks.query", data: taskRes.data, success: true },
      ],
    });

    let promptSeen = "";
    const reply = await GroundedResponseGenerator.getInstance().synthesizeFromEvidence(pkg, {
      llmComplete: async (p) => {
        promptSeen = p;
        return "Your Q4 tax filing task is marked completed in your live LifeOS tasks.";
      },
    });
    assert.ok(promptSeen.includes("treat the live record as authoritative"));
    assert.ok(reply.includes("completed"));

    // READ_EMPTY honest fallback check
    const emptyPkg = buildExecutionEvidencePackage({
      objective: "What do you remember about my favorite guitar brand?",
      steps: [
        {
          stepId: "s_empty",
          capabilityURN: "lifeos.memory.search",
          data: { items: [], totalCount: 0, returnedCount: 0, hasMore: false, retrievalMode: "empty", emptyReason: "No matching active personal memories found." },
          success: true,
        },
      ],
    });
    const emptyFallback = await GroundedResponseGenerator.getInstance().synthesizeFromEvidence(emptyPkg, {
      llmComplete: async () => "",
    });
    assert.ok(emptyFallback.includes("No matching records found"));
  });
});
