import test from "node:test";
import assert from "node:assert/strict";
import {
  EmbeddingProviderRegistry,
  LocalSentenceTransformerEmbeddingProvider,
  DeterministicMockEmbeddingProvider,
  ProductionOpenAIEmbeddingProvider,
  validateEmbeddingCompatibility,
} from "../memory/EmbeddingProvider";
import { MemoryRepository, cosineSimilarity } from "../memory/MemoryRepository";
import { MemoryFormationPipeline } from "../memory/MemoryFormationPipeline";
import { DurableMemoryJobQueue } from "../memory/DurableMemoryJobQueue";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";

test("LifeOS: Zero-Cost Local Embedding Migration & Vector Compatibility Suite", async (t) => {
  const userA = "user_mig_alpha";
  const userB = "user_mig_beta";

  const memoryRepo = MemoryRepository.getInstance();
  const memoryPipeline = MemoryFormationPipeline.getInstance();
  const jobQueue = DurableMemoryJobQueue.getInstance();
  const kernelService = KernelCapabilityService.getInstance();

  memoryRepo.clearInMemoryStore();
  jobQueue.clear();

  // =========================================================================
  // 1. Model Initialization, Dimensions, and Inference
  // =========================================================================
  await t.test("MIG-01: LocalSentenceTransformerEmbeddingProvider initializes with 384 dimensions", async () => {
    const provider = new LocalSentenceTransformerEmbeddingProvider();
    assert.strictEqual(provider.modelName, "sentence-transformers/all-MiniLM-L6-v2");
    assert.strictEqual(provider.dimension, 384);
    assert.strictEqual(provider.modelVersion, 1);
    assert.strictEqual(provider.providerName, "sentence-transformers");
    assert.strictEqual(provider.similarityMetric, "cosine");

    // Warm embedding generation
    const vector = await provider.generateEmbedding("Test embedding generation for health domain");
    assert.strictEqual(vector.length, 384, "Embedding must have exactly 384 dimensions");

    // Verify unit length (L2 norm = 1.0)
    let sumSq = 0;
    for (const v of vector) sumSq += v * v;
    const norm = Math.sqrt(sumSq);
    assert.ok(Math.abs(norm - 1.0) < 1e-3, `Vector L2 norm must be ~1.0, got ${norm}`);
  });

  // =========================================================================
  // 2. Determinism and Numerical Tolerance
  // =========================================================================
  await t.test("MIG-02: Local embedding inference satisfies numerical determinism tolerance", async () => {
    const provider = new LocalSentenceTransformerEmbeddingProvider();
    const prompt = "Alpha prefers high-intensity interval workouts on Tuesday and Thursday mornings";

    const v1 = await provider.generateEmbedding(prompt);
    const v2 = await provider.generateEmbedding(prompt);

    assert.strictEqual(v1.length, 384);
    assert.strictEqual(v2.length, 384);

    let maxDelta = 0;
    for (let i = 0; i < 384; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(v1[i] - v2[i]));
    }

    // Defined numerical tolerance: < 1e-6 (in practice 0.0 with deterministic inference)
    assert.ok(maxDelta < 1e-6, `Numerical divergence ${maxDelta} exceeds tolerance 1e-6`);
    const cosSim = cosineSimilarity(v1, v2);
    assert.ok(Math.abs(cosSim - 1.0) < 1e-5, `Self-similarity must be 1.0, got ${cosSim}`);
  });

  // =========================================================================
  // 3. Batch Embedding Throughput & Dimensional Consistency
  // =========================================================================
  await t.test("MIG-03: Batch embedding returns matching dimensions for all texts", async () => {
    const provider = new LocalSentenceTransformerEmbeddingProvider();
    const batch = [
      "Client meeting scheduled for quarterly strategic planning",
      "Hydration log: drank 500ml water",
      "Completed 5km outdoor morning run",
      "Prioritize restful recovery sleep tonight",
    ];

    const vectors = await provider.generateBatchEmbeddings(batch);
    assert.strictEqual(vectors.length, 4, "Batch size must match input array");

    for (let i = 0; i < vectors.length; i++) {
      assert.strictEqual(vectors[i].length, 384, `Item ${i} must have 384 dimensions`);
    }

    // Cosine similarity between running and hydration should be lower than running and workout
    const workoutVec = await provider.generateEmbedding("Completed high intensity workout session");
    const simRunWorkout = cosineSimilarity(vectors[2], workoutVec);
    const simRunMeeting = cosineSimilarity(vectors[2], vectors[0]);

    assert.ok(
      simRunWorkout > simRunMeeting,
      `Running should be more semantically similar to Workout (${simRunWorkout.toFixed(3)}) than Meeting (${simRunMeeting.toFixed(3)})`
    );
  });

  // =========================================================================
  // 4. Provider Registry Selection and Zero-Fallback Verification
  // =========================================================================
  await t.test("MIG-04: Provider registry enforces production vs test separation with zero mock fallback", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalMode = process.env.LIFEOS_RUNTIME_MODE;

    try {
      // Production mode: selects LocalSentenceTransformerEmbeddingProvider
      process.env.LIFEOS_RUNTIME_MODE = "production";
      EmbeddingProviderRegistry.reset();
      const prodRegistry = new EmbeddingProviderRegistry();
      const prodProvider = prodRegistry.getProvider();

      assert.ok(
        prodProvider instanceof LocalSentenceTransformerEmbeddingProvider,
        "Must select LocalSentenceTransformerEmbeddingProvider in production"
      );
      assert.strictEqual(prodProvider.dimension, 384);
      assert.ok(
        !(prodProvider instanceof DeterministicMockEmbeddingProvider),
        "Production mode must NEVER fall back to DeterministicMockEmbeddingProvider"
      );

      // Test mode: selects DeterministicMockEmbeddingProvider
      process.env.LIFEOS_RUNTIME_MODE = "test";
      EmbeddingProviderRegistry.reset();
      const testRegistry = new EmbeddingProviderRegistry();
      const testProvider = testRegistry.getProvider();

      assert.ok(
        testProvider instanceof DeterministicMockEmbeddingProvider,
        "Test mode must select DeterministicMockEmbeddingProvider"
      );
      assert.strictEqual(testProvider.dimension, 384);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalMode !== undefined) {
        process.env.LIFEOS_RUNTIME_MODE = originalMode;
      } else {
        delete process.env.LIFEOS_RUNTIME_MODE;
      }
      EmbeddingProviderRegistry.reset();
    }
  });

  // =========================================================================
  // 5. Vector Compatibility Validation (384 vs 384, 1536 vs 1536, Cross-Dimension Fails)
  // =========================================================================
  await t.test("MIG-05: Vector compatibility validation strictly isolates dimension mismatches", async () => {
    const local384A = {
      modelName: "sentence-transformers/all-MiniLM-L6-v2",
      modelVersion: 1,
      dimension: 384,
    };
    const local384B = {
      modelName: "sentence-transformers/all-MiniLM-L6-v2",
      modelVersion: 1,
      dimension: 384,
    };
    const legacy1536 = {
      modelName: "text-embedding-3-small",
      modelVersion: 1,
      dimension: 1536,
    };
    const diffVersion384 = {
      modelName: "sentence-transformers/all-MiniLM-L6-v2",
      modelVersion: 2,
      dimension: 384,
    };

    // 384 -> 384 PASS
    assert.strictEqual(validateEmbeddingCompatibility(local384A, local384B).compatible, true);

    // 1536 -> 1536 PASS (same model)
    assert.strictEqual(validateEmbeddingCompatibility(legacy1536, legacy1536).compatible, true);

    // 384 -> 1536 FAIL (dimension mismatch)
    const dimMismatch = validateEmbeddingCompatibility(local384A, legacy1536);
    assert.strictEqual(dimMismatch.compatible, false);
    assert.ok(dimMismatch.reason?.includes("Dimension mismatch: 384 vs 1536"));

    // 1536 -> 384 FAIL
    const dimMismatchReverse = validateEmbeddingCompatibility(legacy1536, local384A);
    assert.strictEqual(dimMismatchReverse.compatible, false);

    // Version mismatch FAIL
    const verMismatch = validateEmbeddingCompatibility(local384A, diffVersion384);
    assert.strictEqual(verMismatch.compatible, false);
    assert.ok(verMismatch.reason?.includes("Model version mismatch"));
  });

  // =========================================================================
  // 6. Vector Index Selection & Dimension Mismatch Exception Gating
  // =========================================================================
  await t.test("MIG-06: MemoryRepository enforces index routing and throws on invalid dimensions", async () => {
    // 384 dimensions -> targets personal_memory_vector_index_v2
    const vec384 = new Array(384).fill(0.02);
    const results384 = await memoryRepo.findVectorNearest(userA, vec384, 5);
    assert.ok(Array.isArray(results384));

    // 1536 dimensions -> targets legacy personal_memory_vector_index
    const vec1536 = new Array(1536).fill(0.01);
    const results1536 = await memoryRepo.findVectorNearest(userA, vec1536, 5);
    assert.ok(Array.isArray(results1536));

    // Invalid dimension (e.g. 512 or 768) -> throws explicit mismatch error
    const vecInvalid = new Array(512).fill(0.03);
    await assert.rejects(
      async () => {
        await memoryRepo.findVectorNearest(userA, vecInvalid, 5);
      },
      (err: any) => err.message.includes("[VECTOR_INDEX_DIMENSION_MISMATCH]")
    );
  });

  // =========================================================================
  // 7. Complete Memory Lifecycle with 384-Dimensional Vectors
  // =========================================================================
  await t.test("MIG-07: Full memory lifecycle executes from formation to retrieval with 384-dim vector", async () => {
    const memory = await memoryRepo.createMemory({
      userId: userA,
      content: "User prefers cold brew coffee at 9:00 AM before coding sessions",
      summary: "Cold brew morning routine",
      memoryType: "behavioral_pattern",
      domain: "productivity",
      source: "explicit_user_statement",
      confidence: 0.92,
      importance: 0.80,
    });

    assert.ok(memory.id.startsWith("mem_"));
    assert.strictEqual(memory.userId, userA);
    assert.strictEqual(memory.embeddingModel, "deterministic-mock-v1");
    assert.ok(
      memory.embedding?.length === 1536 ||
      memory.embedding?.length === 384 ||
      memory.embedding384?.length === 384
    );

    // Hybrid search
    const searchResults = await memoryRepo.search({
      userId: userA,
      queryText: "morning cold brew coffee",
      limit: 5,
    });

    assert.ok(searchResults.length > 0);
    const topResult = searchResults[0];
    assert.strictEqual(topResult.memory.id, memory.id);
    assert.ok(topResult.finalScore > 0);
    assert.ok(topResult.similarityScore > 0);
  });

  // =========================================================================
  // 8. Replay Determinism with Live Mutation Shielding
  // =========================================================================
  await t.test("MIG-08: Replay uses pinned snapshot metadata and survives live memory mutation", async () => {
    const replayId = "exec_replay_mig_08";

    // 1. Create initial memory
    const originalMem = await memoryRepo.createMemory({
      userId: userA,
      content: "Alpha target heart rate zone during cardio is 145-160 bpm",
      summary: "Cardio heart rate zone",
      memoryType: "semantic_fact",
      domain: "health",
      source: "explicit_user_statement",
      confidence: 0.95,
      importance: 0.85,
    });

    // 2. Perform search & pin snapshot
    const results = await memoryRepo.search({
      userId: userA,
      queryText: "heart rate cardio",
      limit: 5,
    });

    const snapshot = memoryPipeline.pinRetrievalSnapshot(
      replayId,
      userA,
      "heart rate cardio",
      results,
      {
        policyVersion: "v1.0",
        projectionVersion: "v2.0",
        filterConfig: { domain: "health", limit: 5 },
      }
    );

    assert.strictEqual(snapshot.snapshotId, replayId);
    assert.strictEqual(snapshot.userId, userA);
    assert.strictEqual(snapshot.retrievedMemories.length, results.length);
    assert.strictEqual(snapshot.retrievedMemories[0].id, originalMem.id);

    // 3. Mutate live database: archive original memory and create contradictory memory
    await memoryRepo.archive(originalMem.id, userA);
    await memoryRepo.createMemory({
      userId: userA,
      content: "Alpha cardio target heart rate changed to 120-135 bpm low intensity",
      summary: "New low intensity cardio zone",
      memoryType: "semantic_fact",
      domain: "health",
      source: "explicit_user_statement",
      confidence: 0.95,
    });

    // 4. Live search reflects new state and does NOT return archived memory
    const liveSearch = await memoryRepo.search({
      userId: userA,
      queryText: "heart rate cardio",
      limit: 5,
    });
    assert.ok(!liveSearch.some((m) => m.memory.id === originalMem.id));

    // 5. Replay retrieves exact pinned snapshot preserving original memory
    const replayedSnapshot = memoryPipeline.getPinnedSnapshot(replayId);
    assert.ok(replayedSnapshot);
    assert.strictEqual(replayedSnapshot.retrievedMemories[0].id, originalMem.id);
    assert.ok(replayedSnapshot.retrievedMemories[0].content.includes("145-160 bpm"));
  });

  // =========================================================================
  // 9. Strict Tenant Boundary Isolation
  // =========================================================================
  await t.test("MIG-09: User A cannot retrieve or vector-search User B memories", async () => {
    // Seed confidential memory for User B
    const secretB = await memoryRepo.createMemory({
      userId: userB,
      content: "Beta confidential medical therapy notes: knee rehab protocol",
      summary: "Knee rehab",
      memoryType: "semantic_fact",
      domain: "health",
      source: "explicit_user_statement",
      confidence: 0.99,
    });

    // User A searches for knee rehab
    const searchA = await memoryRepo.search({
      userId: userA,
      queryText: "knee rehab protocol",
      limit: 10,
    });

    assert.ok(
      !searchA.some((m) => m.memory.id === secretB.id),
      "User A search must never return User B memories"
    );

    // User A direct getById
    const directGet = await memoryRepo.getById(secretB.id, userA);
    assert.strictEqual(directGet, null, "User A direct get must return null for User B memory");

    // User A vector nearest
    const queryVec = new Array(384).fill(0.01);
    const vectorMatchesA = await memoryRepo.findVectorNearest(userA, queryVec, 10);
    assert.ok(
      !vectorMatchesA.some((m) => m.memory.id === secretB.id),
      "User A vector nearest must never return User B memory"
    );
  });

  // =========================================================================
  // 10. Non-Destructive Legacy Backfill Mechanism
  // =========================================================================
  await t.test("MIG-10: Legacy backfill generates 384-dim vector without destroying 1536-dim vector", async () => {
    // Seed simulated legacy record with only 1536-dim embedding
    const legacyRec: any = {
      id: "mem_legacy_backfill_test",
      userId: userA,
      content: "Legacy habit: reads 30 minutes of technical books before sleep",
      summary: "Bedtime reading habit",
      memoryType: "behavioral_pattern",
      domain: "productivity",
      source: "explicit_user_statement",
      confidence: 0.88,
      importance: 0.60,
      evidenceCount: 1,
      firstObservedAt: Date.now() - 86400000,
      lastReinforcedAt: Date.now() - 86400000,
      isArchived: false,
      provenance: {},
      relatedEntityIds: [],
      embedding: new Array(1536).fill(0.01), // Legacy 1536 vector
      embeddingModel: "text-embedding-3-small",
      embeddingVersion: 1,
      lifecycleStatus: "verified",
      updatedAt: Date.now(),
      // Intentionally missing embedding384
    };

    // Manually insert into in-memory store
    (memoryRepo as any).inMemoryStore.set(legacyRec.id, legacyRec);

    // Run backfill
    const report = await memoryRepo.backfillLegacyEmbeddings(userA, 10);
    assert.ok(report.processed >= 1, "Must process legacy document");
    assert.ok(report.migrated >= 1, "Must migrate legacy document to 384 dimensions");

    // Verify migrated record
    const updated = await memoryRepo.getById(legacyRec.id, userA);
    assert.ok(updated);
    assert.strictEqual(updated?.embedding384?.length, 384, "Must have generated 384-dim vector");
    assert.strictEqual(updated?.embedding?.length, 1536, "Must preserve legacy 1536-dim vector");
    assert.strictEqual(updated?.embeddingModel, "deterministic-mock-v1");
  });

  // =========================================================================
  // 11. Durable Memory Job Recovery Across Worker Restart
  // =========================================================================
  await t.test("MIG-11: Durable memory queue recovers processing jobs on simulated restart", async () => {
    const job = await jobQueue.enqueueTurn(
      {
        userId: userA,
        conversationId: "conv_mig_11",
        userMessage: "Log a workout: 45 min strength session",
        assistantResponse: "Logged your 45 min strength session.",
      },
      { immediateProcess: false }
    );

    assert.strictEqual(job.status, "PENDING");

    // Simulate worker acquiring lease and crashing
    job.status = "PROCESSING";
    job.heartbeatAt = Date.now() - 45000; // 45s ago (lease expired)
    job.attempts = 1;

    // Reaper runs
    const recovered = jobQueue.reapStaleWorkers(30000);
    assert.ok(recovered >= 1, "Must recover stalled worker job");
    assert.strictEqual(job.status, "PENDING", "Job status must be reset to PENDING");

    // Next worker successfully processes job
    const completed = await jobQueue.processJob(job.jobId);
    assert.strictEqual(completed.status, "COMPLETED");
  });
});
