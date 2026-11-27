import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { DurableMemoryJobQueue } from "../memory/DurableMemoryJobQueue";
import { MemoryFormationPipeline, IMemorySemanticExtractor } from "../memory/MemoryFormationPipeline";
import { MemoryRepository } from "../memory/MemoryRepository";
import { DeterministicMockEmbeddingProvider } from "../memory/EmbeddingProvider";
import { DEFAULT_MEMORY_POLICY } from "../memory/PersonalMemoryContracts";
import { runHistoricalMemoryReplay } from "../../../../scripts/recover-stage4-memories";

describe("Stage 4 Increment 4.3: Durable Queue, Sweeper & Semantic Extraction", () => {
  const userA = new mongoose.Types.ObjectId().toString();
  let repo: MemoryRepository;
  let pipeline: MemoryFormationPipeline;

  before(async () => {
    await connectIsolatedTestDB({
      dbName: "life-os-stage4-inc43-test",
      useMemoryReplSet: true,
    });
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    const { MemoryJob } = await import("../../../../apps/web/server/db/models/MemoryJob");
    await PersonalMemory.syncIndexes();
    await MemoryJob.syncIndexes();
    repo = new MemoryRepository(DEFAULT_MEMORY_POLICY, new DeterministicMockEmbeddingProvider(384));
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    repo.clearInMemoryStore();
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    const { MemoryJob } = await import("../../../../apps/web/server/db/models/MemoryJob");
    await PersonalMemory.deleteMany({});
    await MemoryJob.deleteMany({});
  });

  it("4.3-01: Atomic claim prevents concurrent double-processing and survives event dispatch failure", async () => {
    const { MemoryJob } = await import("../../../../apps/web/server/db/models/MemoryJob");
    let extractCalls = 0;

    const extractor: IMemorySemanticExtractor = {
      async extract(turn) {
        extractCalls++;
        await new Promise((r) => setTimeout(r, 30));
        return [
          {
            userId: turn.userId,
            content: "Prefers black filter coffee in the morning",
            summary: "Black coffee preference",
            source: "explicit_user_statement",
            domain: "health",
            memoryType: "semantic_fact",
            slotKey: "beverage_preference",
          },
        ];
      },
    };

    pipeline = new MemoryFormationPipeline(
      repo,
      new DeterministicMockEmbeddingProvider(384),
      undefined,
      undefined,
      extractor
    );
    const queueA = new DurableMemoryJobQueue(pipeline, async () => {
      throw new Error("Simulated Inngest dispatch outage");
    });
    const queueB = new DurableMemoryJobQueue(pipeline);

    const job = await queueA.enqueueTurn({
      userId: userA,
      conversationId: "conv_atomic",
      requestId: "req_atomic_1",
      userMessage: "I love black filter coffee every morning",
      assistantResponse: "Noted!",
    });
    await queueA.drainInFlight();

    // Even though Inngest dispatch threw, DB persists PENDING job
    const persisted = await MemoryJob.findOne({ jobId: job.jobId }).lean();
    assert.strictEqual(persisted?.status, "PENDING");

    // Race two concurrent workers claiming the same jobId
    await Promise.all([queueA.processJob(job.jobId), queueB.processJob(job.jobId)]);

    assert.strictEqual(extractCalls, 1, "Atomic DB claim must execute extraction exactly once");
    const doneDoc = await MemoryJob.findOne({ jobId: job.jobId }).lean();
    assert.strictEqual(doneDoc?.status, "COMPLETED");
  });

  it("4.3-02: Enforces backoff retries, DEAD_LETTER halt, explicit requeue, and sweeper lease recovery", async () => {
    const { MemoryJob } = await import("../../../../apps/web/server/db/models/MemoryJob");
    let shouldFail = true;

    const extractor: IMemorySemanticExtractor = {
      async extract(turn) {
        if (shouldFail) {
          throw new Error("Simulated transient Groq timeout");
        }
        return [
          {
            userId: turn.userId,
            content: "Prefers evening reading before bed",
            summary: "Evening reading habit",
            source: "explicit_user_statement",
            domain: "wellness",
            memoryType: "behavioral_pattern",
            slotKey: "bedtime_habit",
          },
        ];
      },
    };

    pipeline = new MemoryFormationPipeline(
      repo,
      new DeterministicMockEmbeddingProvider(384),
      undefined,
      undefined,
      extractor
    );
    const queue = new DurableMemoryJobQueue(pipeline);

    const job = await queue.enqueueTurn(
      {
        userId: userA,
        conversationId: "conv_retry",
        requestId: "req_retry_1",
        userMessage: "I read books before sleep",
        assistantResponse: "Great habit.",
      },
      { maxAttempts: 2, immediateProcess: false }
    );

    // Attempt 1 fails -> FAILED with future nextRetryTimestamp
    await assert.rejects(() => queue.processJob(job.jobId), /transient Groq timeout/);
    let dbJob = await MemoryJob.findOne({ jobId: job.jobId }).lean();
    assert.strictEqual(dbJob?.status, "FAILED");
    assert.ok(dbJob?.nextRetryTimestamp);

    // Sweeper respects backoff before nextRetryTimestamp
    const earlySweep = await queue.sweepAndProcessDueJobs({ maxJobs: 10 });
    assert.strictEqual(earlySweep.claimedCount, 0);

    // Make retry due now and fail Attempt 2 -> DEAD_LETTER
    await MemoryJob.updateOne({ jobId: job.jobId }, { $set: { nextRetryTimestamp: new Date(Date.now() - 1000) } });
    await assert.rejects(() => queue.processJob(job.jobId), /transient Groq timeout/);
    dbJob = await MemoryJob.findOne({ jobId: job.jobId }).lean();
    assert.strictEqual(dbJob?.status, "DEAD_LETTER");

    // DEAD_LETTER must halt automatic processing
    await assert.rejects(() => queue.processJob(job.jobId), /DEAD_LETTER_HALT/);

    // Explicit requeue recovers after transient fault clears
    shouldFail = false;
    const requeued = await queue.requeueDeadLetterJob(job.jobId);
    assert.strictEqual(requeued, true);
    const sweepRes = await queue.sweepAndProcessDueJobs({ maxJobs: 10 });
    assert.strictEqual(sweepRes.completedCount, 1);
  });

  it("4.3-03: Supports multi-fact extraction, non-English input, selective slot supersession, and disputed conflicts", async () => {
    const extractor: IMemorySemanticExtractor = {
      async extract(turn) {
        if (turn.userMessage.includes("Soy vegetariano")) {
          return [
            {
              userId: turn.userId,
              content: "User follows a vegetarian diet",
              summary: "Vegetarian diet",
              source: "explicit_user_statement",
              domain: "health",
              memoryType: "semantic_fact",
              slotKey: "dietary_pattern",
            },
            {
              userId: turn.userId,
              content: "User works best in early morning focus blocks",
              summary: "Morning focus window",
              source: "explicit_user_statement",
              domain: "productivity",
              memoryType: "behavioral_pattern",
              slotKey: "focus_window",
            },
          ];
        }
        if (turn.userMessage.includes("pescatarian")) {
          return [
            {
              userId: turn.userId,
              content: "User now follows a pescatarian diet including fish",
              summary: "Pescatarian diet",
              source: "explicit_user_statement",
              domain: "health",
              memoryType: "semantic_fact",
              slotKey: "dietary_pattern",
            },
          ];
        }
        return [
          {
            userId: turn.userId,
            content: "User might prefer evening sprints sometimes",
            summary: "Possible evening sprint",
            source: "explicit_user_statement",
            domain: "productivity",
            memoryType: "behavioral_pattern",
            slotKey: "ambiguous_sprint_window",
          },
        ];
      },
      async classifyContradiction(candidate, existing) {
        if (candidate.slotKey === "dietary_pattern" && existing.slotKey === "dietary_pattern") {
          return "CONTRADICTS";
        }
        if (candidate.slotKey === "ambiguous_sprint_window" && existing.slotKey === "focus_window") {
          return "DISPUTED";
        }
        return "UNRELATED";
      },
    };

    pipeline = new MemoryFormationPipeline(
      repo,
      new DeterministicMockEmbeddingProvider(384),
      undefined,
      undefined,
      extractor
    );

    // Turn 1 (Spanish + multi-fact)
    const r1 = await pipeline.processConversationTurn({
      userId: userA,
      conversationId: "conv_multi",
      turnId: "turn_1",
      userMessage: "Soy vegetariano y trabajo mejor por la mañana.",
      assistantResponse: "Entendido.",
    });
    assert.strictEqual(r1.storedCount, 2);

    // Turn 2 (Selective correction on dietary_pattern ONLY)
    const r2 = await pipeline.processConversationTurn({
      userId: userA,
      conversationId: "conv_multi",
      turnId: "turn_2",
      userMessage: "Actually I switched to a pescatarian diet.",
      assistantResponse: "Updated your dietary preference.",
    });
    assert.strictEqual(r2.supersededCount, 1);
    assert.strictEqual(r2.storedCount, 1);

    const active = await repo.getActiveMemories(userA);
    assert.strictEqual(active.length, 2, "Unrelated morning focus window must remain active alongside corrected diet");
    assert.ok(active.some((m) => m.slotKey === "focus_window"));
    assert.ok(active.some((m) => m.content.includes("pescatarian")));
    assert.ok(!active.some((m) => m.content.includes("vegetarian")));

    // Turn 3 (Ambiguous conflict -> DISPUTED, preserving both)
    await pipeline.processConversationTurn({
      userId: userA,
      conversationId: "conv_multi",
      turnId: "turn_3",
      userMessage: "Sometimes I also sprint in the evening.",
    });
    const allPostDispute = await repo.getActiveMemories(userA);
    assert.ok(allPostDispute.some((m) => m.lifecycleStatus === "disputed"));
  });

  it("4.3-04: Skips trivial CASUAL_DIALOGUE only via structured semanticTurnMeta, and runs opt-in replay CLI idempotently", async () => {
    const { MemoryJob } = await import("../../../../apps/web/server/db/models/MemoryJob");
    let extractorCalls = 0;

    pipeline = new MemoryFormationPipeline(
      repo,
      new DeterministicMockEmbeddingProvider(384),
      undefined,
      undefined,
      {
        async extract(turn) {
          extractorCalls++;
          return [
            {
              userId: turn.userId,
              content: "Prefers standing desk in afternoons",
              summary: "Standing desk habit",
              source: "explicit_user_statement",
              domain: "wellness",
              memoryType: "behavioral_pattern",
              slotKey: "desk_posture",
            },
          ];
        },
      }
    );

    const skipped = await pipeline.processConversationTurn({
      userId: userA,
      conversationId: "conv_meta",
      userMessage: "Thanks!",
      semanticTurnMeta: { primaryClassification: "CASUAL_DIALOGUE", operationsCount: 0 },
    });
    assert.strictEqual(skipped.candidateCount, 0);
    assert.strictEqual(extractorCalls, 0);

    // Explicit memory bypasses casual skip and preserves summary/memoryType
    const explicitRes = await pipeline.processConversationTurn({
      userId: userA,
      conversationId: "conv_explicit",
      userMessage: "Raw input",
      explicitMemory: {
        content: "Always stretch shoulders before coding.",
        summary: "Shoulder stretch routine",
        domain: "health",
        memoryType: "behavioral_pattern",
      },
    });
    assert.strictEqual(explicitRes.storedCount, 1);

    // Seed failed historical job for opt-in CLI replay test
    await MemoryJob.create({
      jobId: "job_mem_hist_cli_1",
      userId: new mongoose.Types.ObjectId(userA),
      conversationId: "conv_hist",
      turn: {
        userId: userA,
        conversationId: "conv_hist",
        userMessage: "I use a standing desk in afternoons.",
        assistantResponse: "Got it.",
      },
      status: "FAILED",
      attempts: 1,
      maxAttempts: 3,
      nextRetryTimestamp: new Date(Date.now() + 60000),
    });

    const dryReport = await runHistoricalMemoryReplay({
      dryRun: true,
      batchSize: 10,
      statuses: ["FAILED"],
      userId: userA,
      requeueDeadLetter: false,
    });
    assert.strictEqual(dryReport.eligibleJobs, 1);
    assert.strictEqual(dryReport.replayedCompleted, 0);

    // Execute replay using our instance pipeline extractor via singleton swap
    MemoryFormationPipeline.getInstance().setSemanticExtractor({
      async extract(turn) {
        return [
          {
            userId: turn.userId,
            content: "Prefers standing desk in afternoons",
            summary: "Standing desk habit",
            source: "explicit_user_statement",
            domain: "wellness",
            memoryType: "behavioral_pattern",
            slotKey: "desk_posture",
          },
        ];
      },
    });

    const replay1 = await runHistoricalMemoryReplay({
      dryRun: false,
      batchSize: 10,
      statuses: ["FAILED"],
      userId: userA,
      requeueDeadLetter: false,
    });
    assert.strictEqual(replay1.replayedCompleted, 1);

    const replay2 = await runHistoricalMemoryReplay({
      dryRun: false,
      batchSize: 10,
      statuses: ["FAILED", "COMPLETED"],
      userId: userA,
      requeueDeadLetter: false,
    });
    assert.strictEqual(replay2.eligibleJobs, 0, "Replay must be strictly idempotent on rerun");
    MemoryFormationPipeline.getInstance().setSemanticExtractor(undefined);
  });
});
