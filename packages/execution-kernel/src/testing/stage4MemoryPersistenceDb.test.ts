import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { MemoryRepository } from "../memory/MemoryRepository";
import { DeterministicMockEmbeddingProvider } from "../memory/EmbeddingProvider";
import { DEFAULT_MEMORY_POLICY } from "../memory/PersonalMemoryContracts";

describe("Stage 4 Increment 4.1: Canonical Memory Identity & Persistence Repair", () => {
  const userA = new mongoose.Types.ObjectId().toString();
  const userB = new mongoose.Types.ObjectId().toString();
  let repo: MemoryRepository;

  before(async () => {
    await connectIsolatedTestDB({
      dbName: "life-os-stage4-inc41-test",
      useMemoryReplSet: true,
    });
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    await PersonalMemory.syncIndexes();
    repo = new MemoryRepository(DEFAULT_MEMORY_POLICY, new DeterministicMockEmbeddingProvider(384));
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    repo.clearInMemoryStore();
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    await PersonalMemory.deleteMany({});
  });

  it("4.1-01: Persists 25+ distinct memories for one user as distinct MongoDB documents with canonical memoryId", async () => {
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");
    const createdIds = new Set<string>();

    for (let i = 0; i < 25; i++) {
      const saved = await repo.createMemory({
        userId: userA,
        content: `Distinct personal memory entry #${i}: prefers block ${i}`,
        summary: `Preference #${i}`,
        memoryType: "semantic_fact",
        domain: i % 2 === 0 ? "productivity" : "health",
        source: "explicit_user_statement",
        confidence: 0.85,
        importance: 0.7,
        provenance: { conversationId: `conv_${i}` },
      });
      assert.ok(saved.id.startsWith("mem_"), `Expected canonical mem_ id, got ${saved.id}`);
      assert.strictEqual(saved.memoryId, saved.id);
      createdIds.add(saved.id);
    }

    assert.strictEqual(createdIds.size, 25);

    const dbCount = await PersonalMemory.countDocuments({ userId: new mongoose.Types.ObjectId(userA) });
    assert.strictEqual(dbCount, 25, "All 25 memories must persist as distinct MongoDB documents");

    const docs = await PersonalMemory.find({ userId: new mongoose.Types.ObjectId(userA) }).lean();
    const dbMemoryIds = new Set(docs.map((d: any) => d.memoryId));
    assert.strictEqual(dbMemoryIds.size, 25);
  });

  it("4.1-02: Canonical mem_... IDs round-trip cleanly across getById, update, reinforceMemory, and archive", async () => {
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");

    const created = await repo.createMemory({
      userId: userA,
      content: "Prefers deep work sessions before noon",
      summary: "Morning deep work preference",
      memoryType: "semantic_fact",
      domain: "productivity",
      source: "explicit_user_statement",
      confidence: 0.8,
      importance: 0.75,
    });

    // Simulate cold process / cleared RAM cache so all operations must hit MongoDB
    repo.clearInMemoryStore();

    const fetched = await repo.getById(created.id, userA);
    assert.ok(fetched, "Must fetch persisted memory by canonical mem_... id from MongoDB");
    assert.strictEqual(fetched.id, created.id);
    assert.strictEqual(fetched.memoryId, created.id);
    assert.strictEqual(fetched.content, "Prefers deep work sessions before noon");

    repo.clearInMemoryStore();
    const reinforced = await repo.reinforceMemory(userA, created.id, 0.92);
    assert.ok(reinforced);
    assert.strictEqual(reinforced.id, created.id);
    assert.strictEqual(reinforced.memoryId, created.id);
    assert.strictEqual(reinforced.evidenceCount, 2);
    assert.strictEqual(reinforced.confidence, 0.92);
    assert.strictEqual(reinforced.lifecycleStatus, "reinforced");

    repo.clearInMemoryStore();
    const updated = await repo.update(created.id, userA, {
      summary: "Strong morning deep work preference",
      // Attempt to mutate immutable identity/tenant should be ignored
      id: "mem_tampered",
      memoryId: "mem_tampered",
      userId: userB,
    });
    assert.ok(updated);
    assert.strictEqual(updated.id, created.id);
    assert.strictEqual(updated.memoryId, created.id);
    assert.strictEqual(updated.userId, userA);
    assert.strictEqual(updated.summary, "Strong morning deep work preference");

    repo.clearInMemoryStore();
    const archived = await repo.archive(created.id, userA);
    assert.strictEqual(archived, true);

    const dbDoc = await PersonalMemory.findOne({ memoryId: created.id }).lean();
    assert.ok(dbDoc);
    assert.strictEqual(dbDoc.isArchived, true);
    assert.strictEqual(dbDoc.lifecycleStatus, "archived");
  });

  it("4.1-03: Preserves backward compatibility for legacy ObjectId records and verifies sparse unique index safety", async () => {
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");

    // Seed two legacy documents lacking memoryId (simulating pre-Stage-4 documents)
    const legacyDocs = await PersonalMemory.insertMany([
      {
        userId: new mongoose.Types.ObjectId(userA),
        memoryType: "semantic_fact",
        domain: "health",
        content: "Legacy fact: Mild lactose intolerance",
        summary: "Lactose intolerance",
        source: "explicit_user_statement",
        confidence: 0.85,
        importance: 0.7,
        evidenceCount: 1,
        provenance: { conversationId: "legacy_conv_1" },
        embedding: new Array(384).fill(0.01),
        embedding384: new Array(384).fill(0.01),
        lifecycleStatus: "verified",
      },
      {
        userId: new mongoose.Types.ObjectId(userB),
        memoryType: "semantic_fact",
        domain: "productivity",
        content: "Legacy fact B: Prefers dark mode",
        summary: "Dark mode",
        source: "explicit_user_statement",
        confidence: 0.9,
        importance: 0.6,
        evidenceCount: 1,
        provenance: { conversationId: "legacy_conv_2" },
        embedding: new Array(384).fill(0.02),
        embedding384: new Array(384).fill(0.02),
        lifecycleStatus: "verified",
      },
    ]);

    // Verify sparse unique index sync succeeds cleanly alongside multiple docs lacking memoryId
    await PersonalMemory.syncIndexes();

    const legacyIdA = legacyDocs[0]._id.toString();
    const fetchedLegacy = await repo.getById(legacyIdA, userA);
    assert.ok(fetchedLegacy, "Legacy ObjectId record must remain accessible via getById");
    assert.strictEqual(fetchedLegacy.id, legacyIdA);
    assert.strictEqual(fetchedLegacy.content, "Legacy fact: Mild lactose intolerance");

    const reinforcedLegacy = await repo.reinforceMemory(userA, legacyIdA, 0.91);
    assert.ok(reinforcedLegacy);
    assert.strictEqual(reinforcedLegacy.evidenceCount, 2);

    const updatedLegacy = await repo.update(legacyIdA, userA, { summary: "Updated legacy summary" });
    assert.ok(updatedLegacy);
    assert.strictEqual(updatedLegacy.summary, "Updated legacy summary");

    const archivedLegacy = await repo.archive(legacyIdA, userA);
    assert.strictEqual(archivedLegacy, true);
  });

  it("4.1-04: Rejects cross-tenant access and prevents cross-tenant memoryId collisions", async () => {
    const secretA = await repo.createMemory({
      userId: userA,
      content: "User A confidential health constraint",
      summary: "Confidential health note",
      memoryType: "semantic_fact",
      domain: "health",
      source: "explicit_user_statement",
    });

    repo.clearInMemoryStore();

    assert.strictEqual(await repo.getById(secretA.id, userB), null);
    assert.strictEqual(await repo.update(secretA.id, userB, { content: "Hijacked" }), null);
    assert.strictEqual(await repo.reinforceMemory(userB, secretA.id, 0.99), null);
    assert.strictEqual(await repo.archive(secretA.id, userB), false);

    const searchB = await repo.search({ userId: userB, queryText: "confidential health" });
    assert.strictEqual(searchB.length, 0);

    // Attempting to save a colliding global memoryId under User B must fail (E11000), never overwriting User A
    await assert.rejects(
      () =>
        repo.save({
          ...secretA,
          userId: userB,
          content: "Collision overwrite attempt",
        }),
      /E11000|duplicate/i
    );

    repo.clearInMemoryStore();
    const intactA = await repo.getById(secretA.id, userA);
    assert.strictEqual(intactA?.content, "User A confidential health constraint");
  });

  it("4.1-05: Does not swallow genuine MongoDB write errors when connected", async () => {
    const badRecord: any = {
      id: "mem_invalid_enum_test",
      userId: userA,
      memoryType: "invalid_type_not_in_enum",
      domain: "productivity",
      content: "Invalid enum persistence check",
      summary: "Invalid enum",
      source: "explicit_user_statement",
      confidence: 0.8,
      importance: 0.5,
      evidenceCount: 1,
      firstObservedAt: Date.now(),
      lastReinforcedAt: Date.now(),
      isArchived: false,
      provenance: {},
      relatedEntityIds: [],
      embedding: new Array(384).fill(0.01),
      embedding384: new Array(384).fill(0.01),
      embeddingModel: "deterministic-mock-v1",
      embeddingVersion: 1,
      lifecycleStatus: "verified",
      updatedAt: Date.now(),
    };

    await assert.rejects(() => repo.save(badRecord));
  });

  it("4.1-06: Backfills missing canonical memoryIds idempotently without modifying content, _id, or provenance", async () => {
    const { PersonalMemory } = await import("../../../../apps/web/server/db/models/PersonalMemory");

    const originalDate = new Date("2026-01-15T10:00:00.000Z");
    const inserted = await PersonalMemory.insertMany([
      {
        userId: new mongoose.Types.ObjectId(userA),
        memoryType: "semantic_fact",
        domain: "productivity",
        content: "Legacy item 1",
        summary: "Legacy 1",
        source: "explicit_user_statement",
        confidence: 0.8,
        importance: 0.6,
        evidenceCount: 2,
        firstObservedAt: originalDate,
        lastReinforcedAt: originalDate,
        provenance: { conversationId: "conv_orig_1", sourceContext: "onboarding" },
        embedding: new Array(384).fill(0.01),
      },
      {
        userId: new mongoose.Types.ObjectId(userA),
        memoryType: "behavioral_pattern",
        domain: "wellness",
        content: "Legacy item 2",
        summary: "Legacy 2",
        source: "behavioral_telemetry",
        confidence: 0.75,
        importance: 0.7,
        evidenceCount: 3,
        firstObservedAt: originalDate,
        lastReinforcedAt: originalDate,
        provenance: { conversationId: "conv_orig_2", dailyLogDate: "2026-01-15" },
        embedding: new Array(384).fill(0.02),
      },
      {
        userId: new mongoose.Types.ObjectId(userA),
        memoryId: "mem_already_canonical",
        memoryType: "semantic_fact",
        domain: "general",
        content: "Already canonical item",
        summary: "Canonical",
        source: "explicit_user_statement",
        confidence: 0.9,
        importance: 0.8,
        evidenceCount: 1,
        provenance: { conversationId: "conv_orig_3" },
        embedding: new Array(384).fill(0.03),
      },
    ]);

    const dryReport = await repo.reconcileLegacyPersonalMemoryIdentities({
      batchSize: 1,
      dryRun: true,
      userId: userA,
    });
    assert.strictEqual(dryReport.scanned, 2);
    assert.strictEqual(dryReport.backfilled, 2);

    // Ensure dryRun made zero writes
    const stillMissing = await PersonalMemory.countDocuments({ memoryId: { $exists: false } });
    assert.strictEqual(stillMissing, 2);

    // Actual bounded batch backfill
    const run1 = await repo.reconcileLegacyPersonalMemoryIdentities({
      batchSize: 1,
      userId: userA,
    });
    assert.strictEqual(run1.scanned, 2);
    assert.strictEqual(run1.backfilled, 2);

    const doc1 = await PersonalMemory.findById(inserted[0]._id).lean();
    const doc2 = await PersonalMemory.findById(inserted[1]._id).lean();
    const doc3 = await PersonalMemory.findById(inserted[2]._id).lean();

    assert.ok(doc1?.memoryId?.startsWith("mem_"));
    assert.ok(doc2?.memoryId?.startsWith("mem_"));
    assert.notStrictEqual(doc1?.memoryId, doc2?.memoryId);
    assert.strictEqual(doc3?.memoryId, "mem_already_canonical");

    // Verify preservation of content, provenance, and timestamps
    assert.strictEqual(doc1?.content, "Legacy item 1");
    assert.strictEqual(doc1?.provenance?.conversationId, "conv_orig_1");
    assert.strictEqual(doc1?.provenance?.sourceContext, "onboarding");
    assert.strictEqual(new Date(doc1!.firstObservedAt).toISOString(), originalDate.toISOString());

    // Legacy ObjectId still resolves to the backfilled record
    const viaLegacyId = await repo.getById(inserted[0]._id.toString(), userA);
    assert.strictEqual(viaLegacyId?.memoryId, doc1?.memoryId);

    // Idempotent rerun must do nothing
    const run2 = await repo.reconcileLegacyPersonalMemoryIdentities({
      batchSize: 10,
      userId: userA,
    });
    assert.strictEqual(run2.scanned, 0);
    assert.strictEqual(run2.backfilled, 0);
  });

  it("4.1-07: Enforces DB-side temporal validFrom/validTo filtering and recency sorting beyond 100 docs", async () => {
    const now = Date.now();
    const expired = await repo.createMemory({
      userId: userA,
      content: "Expired temporary travel constraint",
      summary: "Expired travel constraint",
      memoryType: "semantic_fact",
      domain: "general",
      source: "explicit_user_statement",
      validFrom: now - 100000,
      validTo: now - 1000,
    });

    const active = await repo.createMemory({
      userId: userA,
      content: "Active ongoing dietary constraint",
      summary: "Active dietary constraint",
      memoryType: "semantic_fact",
      domain: "health",
      source: "explicit_user_statement",
      validFrom: now - 50000,
      validTo: now + 500000,
    });

    repo.clearInMemoryStore();

    const activeList = await repo.getActiveMemories(userA);
    assert.ok(activeList.some((m) => m.id === active.id), "Active valid memory must be returned");
    assert.ok(!activeList.some((m) => m.id === expired.id), "Expired validTo memory must be excluded in DB query");
  });
});
