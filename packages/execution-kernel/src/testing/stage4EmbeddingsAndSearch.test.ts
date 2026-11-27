import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { MemoryRepository, cosineSimilarity } from "../memory/MemoryRepository";
import {
  IEmbeddingProvider,
  LocalSentenceTransformerEmbeddingProvider,
  DeterministicMockEmbeddingProvider,
} from "../memory/EmbeddingProvider";
import { DEFAULT_MEMORY_POLICY } from "../memory/PersonalMemoryContracts";

class FailingEmbeddingProvider implements IEmbeddingProvider {
  readonly modelName = "failing-local-wasm";
  readonly modelVersion = 1;
  readonly dimension = 384;

  async generateEmbedding(): Promise<number[]> {
    throw new Error("[LOCAL_EMBEDDING_UNAVAILABLE]: Simulated WASM/model unavailability");
  }

  async generateBatchEmbeddings(): Promise<number[][]> {
    throw new Error("[LOCAL_EMBEDDING_UNAVAILABLE]: Simulated batch failure");
  }
}

describe("Stage 4 Increment 4.2: Local WASM Embeddings & Hybrid Search", () => {
  const userA = new mongoose.Types.ObjectId().toString();

  before(async () => {
    await connectIsolatedTestDB({
      dbName: "life-os-stage4-inc42-test",
      useMemoryReplSet: true,
    });
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    await PersonalMemory.syncIndexes();
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    await PersonalMemory.deleteMany({});
  });

  it("4.2-01: LocalSentenceTransformerEmbeddingProvider runs sharp-free WASM 384-dim inference & batching", async () => {
    const provider = new LocalSentenceTransformerEmbeddingProvider();
    assert.strictEqual(provider.dimension, 384);
    assert.strictEqual(provider.modelName, "sentence-transformers/all-MiniLM-L6-v2");

    const v1 = await provider.generateEmbedding("Allergic to peanuts and prefers morning runs.");
    const v2 = await provider.generateEmbedding("Allergic to peanuts and prefers morning runs.");
    const vUnrelated = await provider.generateEmbedding("Quarterly tax spreadsheet invoice review.");

    assert.strictEqual(v1.length, 384);
    assert.ok(cosineSimilarity(v1, v2) > 0.9999, "Repeated identical input must be deterministic");
    assert.ok(
      cosineSimilarity(v1, vUnrelated) < 0.5,
      "Unrelated semantic query should have noticeably lower similarity"
    );

    const batch = await provider.generateBatchEmbeddings([
      "Avoids dairy products.",
      "Works best during morning deep work.",
    ]);
    assert.strictEqual(batch.length, 2);
    assert.strictEqual(batch[0].length, 384);
    assert.strictEqual(batch[1].length, 384);
  });

  it("4.2-02: Persists memories as PENDING_EMBEDDING when inference fails, retrieves via lexical_only, and repairs on backfill", async () => {
    const degradedRepo = new MemoryRepository(DEFAULT_MEMORY_POLICY, new FailingEmbeddingProvider());

    const saved = await degradedRepo.createMemory({
      userId: userA,
      content: "User strictly avoids shellfish due to severe allergy.",
      summary: "Shellfish allergy constraint",
      memoryType: "semantic_fact",
      domain: "health",
      source: "explicit_user_statement",
      confidence: 0.95,
      importance: 0.9,
    });

    assert.strictEqual(saved.embeddingStatus, "PENDING_EMBEDDING");

    degradedRepo.clearInMemoryStore();

    // Search while provider is STILL failing -> must degrade gracefully to lexical_only and find it!
    const lexicalResults = await degradedRepo.search({
      userId: userA,
      queryText: "shellfish allergy",
      limit: 5,
    });
    assert.strictEqual(lexicalResults.length, 1);
    assert.strictEqual(lexicalResults[0].memory.id, saved.id);
    assert.strictEqual(lexicalResults[0].retrievalMode, "lexical_only");
    assert.ok((lexicalResults[0].lexicalScore ?? 0) > 0.5);

    // Update while provider is failing -> content updates and stays PENDING_EMBEDDING
    const updated = await degradedRepo.update(saved.id, userA, {
      content: "User strictly avoids shellfish and crustaceans due to allergy.",
    });
    assert.strictEqual(updated?.embeddingStatus, "PENDING_EMBEDDING");

    // Backfill once WASM/mock 384 provider recovers
    const healthyRepo = new MemoryRepository(DEFAULT_MEMORY_POLICY, new DeterministicMockEmbeddingProvider(384));
    const repair = await healthyRepo.backfillPendingEmbeddings(10, userA);
    assert.strictEqual(repair.processed, 1);
    assert.strictEqual(repair.repaired, 1);

    const repairedDoc = await healthyRepo.getById(saved.id, userA);
    assert.strictEqual(repairedDoc?.embeddingStatus, "READY");
    assert.strictEqual(repairedDoc?.embedding384?.length, 384);
  });

  it("4.2-03: Supports mixed 384-dim + legacy 1536-dim records and deterministic tie-breaking", async () => {
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    const repo = new MemoryRepository(DEFAULT_MEMORY_POLICY, new DeterministicMockEmbeddingProvider(384));
    const now = Date.now();

    // Seed legacy 1536-dim record without embedding384 directly into MongoDB
    await PersonalMemory.create({
      userId: new mongoose.Types.ObjectId(userA),
      memoryId: "mem_legacy_1536_mix",
      memoryType: "semantic_fact",
      domain: "productivity",
      content: "Legacy espresso preference before standup",
      summary: "Espresso preference",
      source: "explicit_user_statement",
      confidence: 0.85,
      importance: 0.7,
      evidenceCount: 1,
      firstObservedAt: new Date(now - 5000),
      lastReinforcedAt: new Date(now - 5000),
      embedding: new Array(1536).fill(0.01),
      embeddingModel: "text-embedding-3-small",
      embeddingVersion: 1,
      lifecycleStatus: "verified",
    });

    await repo.createMemory({
      userId: userA,
      content: "Current espresso preference with oat milk",
      summary: "Oat milk espresso",
      memoryType: "semantic_fact",
      domain: "productivity",
      source: "explicit_user_statement",
      confidence: 0.9,
      importance: 0.8,
    });

    repo.clearInMemoryStore();
    const searchTime = Date.now() + 1000;

    const resultsA = await repo.search({
      userId: userA,
      queryText: "espresso preference",
      referenceTime: searchTime,
      limit: 5,
    });
    const resultsB = await repo.search({
      userId: userA,
      queryText: "espresso preference",
      referenceTime: searchTime,
      limit: 5,
    });

    assert.strictEqual(resultsA.length, 2);
    assert.deepStrictEqual(
      resultsA.map((r) => r.memory.id),
      resultsB.map((r) => r.memory.id),
      "Search ordering must be 100% deterministic at fixed referenceTime"
    );

    const backfill = await repo.backfillLegacyEmbeddings(userA, 10);
    assert.ok(backfill.migrated >= 1);
    const migrated = await repo.getById("mem_legacy_1536_mix", userA);
    assert.strictEqual(migrated?.embedding384?.length, 384);
    assert.strictEqual(migrated?.embedding?.length, 1536);
  });

  it("4.2-04: Downranks stale memories when includeStale is true and excludes stale by default", async () => {
    const repo = new MemoryRepository(DEFAULT_MEMORY_POLICY, new DeterministicMockEmbeddingProvider(384));
    const now = Date.now();

    const staleRec = await repo.createMemory({
      userId: userA,
      content: "User drinks green tea in the afternoon",
      summary: "Green tea habit",
      memoryType: "behavioral_pattern",
      domain: "wellness",
      source: "explicit_user_statement",
      confidence: 0.85,
      importance: 0.7,
    });
    await repo.update(staleRec.id, userA, { lifecycleStatus: "stale" });

    const freshRec = await repo.createMemory({
      userId: userA,
      content: "User drinks green tea in the morning",
      summary: "Morning green tea",
      memoryType: "behavioral_pattern",
      domain: "wellness",
      source: "explicit_user_statement",
      confidence: 0.85,
      importance: 0.7,
    });

    repo.clearInMemoryStore();
    const searchTime = Date.now() + 1000;

    const defaultRes = await repo.search({
      userId: userA,
      queryText: "green tea",
      referenceTime: searchTime,
      limit: 5,
    });
    assert.strictEqual(defaultRes.length, 1);
    assert.strictEqual(defaultRes[0].memory.id, freshRec.id);

    const withStaleRes = await repo.search({
      userId: userA,
      queryText: "green tea",
      includeStale: true,
      referenceTime: searchTime,
      limit: 5,
    });
    assert.strictEqual(withStaleRes.length, 2);
    assert.strictEqual(withStaleRes[0].memory.id, freshRec.id);
    assert.ok(withStaleRes[0].finalScore > withStaleRes[1].finalScore);
  });
});
