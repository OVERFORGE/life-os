import mongoose from "mongoose";
import {
  PersonalMemoryRecord,
  MemoryDomain,
  MemoryQuery,
  ScoredMemoryResult,
  DEFAULT_MEMORY_POLICY,
  MemoryPolicyConfig,
} from "./PersonalMemoryContracts";
import {
  IEmbeddingProvider,
  EmbeddingProviderRegistry,
  DeterministicMockEmbeddingProvider,
  LocalSentenceTransformerEmbeddingProvider,
} from "./EmbeddingProvider";
import { generateId } from "../shared/ids";

/**
 * Compute cosine similarity between two unit vectors (dot product).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return Math.max(-1.0, Math.min(1.0, dot));
}

/**
 * MemoryRepository
 * 
 * SOLE OWNER of storing, indexing, and retrieving persistent PersonalMemory records.
 * Enforces strict user tenant isolation on every read, write, and vector search.
 */
export class MemoryRepository {
  private static instance: MemoryRepository;

  // In-Memory storage backing for deterministic tests and offline mode
  private inMemoryStore: Map<string, PersonalMemoryRecord> = new Map();
  private policy: MemoryPolicyConfig;
  private embeddingProvider: IEmbeddingProvider;

  constructor(
    policy: MemoryPolicyConfig = DEFAULT_MEMORY_POLICY,
    embeddingProvider?: IEmbeddingProvider
  ) {
    this.policy = policy;
    this.embeddingProvider =
      embeddingProvider || EmbeddingProviderRegistry.getInstance().getProvider();
  }

  static getInstance(): MemoryRepository {
    if (!MemoryRepository.instance) {
      MemoryRepository.instance = new MemoryRepository();
    }
    return MemoryRepository.instance;
  }

  clearInMemoryStore(): void {
    this.inMemoryStore.clear();
  }

  private isDbConnected(): boolean {
    return mongoose.connection && mongoose.connection.readyState === 1;
  }

  private castTenantUserId(userId: string): mongoose.Types.ObjectId | string {
    return mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;
  }

  private buildTenantRecordFilter(id: string, userId: string): Record<string, any> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to access memory");
    }
    if (!id) {
      throw new Error("[INVALID_MEMORY_ID]: memory identifier is required");
    }

    const tenantUserId = this.castTenantUserId(userId);
    if (mongoose.Types.ObjectId.isValid(id)) {
      return {
        userId: tenantUserId,
        $or: [{ memoryId: id }, { _id: new mongoose.Types.ObjectId(id) }],
      };
    }

    return {
      userId: tenantUserId,
      memoryId: id,
    };
  }

  /**
   * Save or update a PersonalMemory record with automatic vector generation if missing.
   */
  async save(record: PersonalMemoryRecord): Promise<PersonalMemoryRecord> {
    if (!record.userId) {
      throw new Error("[SECURITY_VIOLATION]: Cannot persist memory without userId");
    }

    if (!record.id) {
      record.id = record.memoryId || generateId("mem");
    }

    const canonicalMemoryId =
      record.memoryId || (!mongoose.Types.ObjectId.isValid(record.id) ? record.id : undefined);
    if (canonicalMemoryId) {
      record.memoryId = canonicalMemoryId;
    }

    // Auto-generate vector if not provided; degrade gracefully without failing write durability
    if (
      (!record.embedding || record.embedding.length === 0) &&
      (!record.embedding384 || record.embedding384.length === 0)
    ) {
      if (process.env.LIFEOS_DISABLE_EMBEDDINGS === "true") {
        record.embedding = [];
        record.embedding384 = undefined;
        record.embeddingStatus = "LEXICAL_ONLY";
      } else {
        try {
          const vec = await this.embeddingProvider.generateEmbedding(record.content);
          if (this.embeddingProvider.dimension === 384) {
            record.embedding384 = vec;
            record.embedding = vec;
          } else {
            record.embedding = vec;
          }
          record.embeddingModel = this.embeddingProvider.modelName;
          record.embeddingVersion = this.embeddingProvider.modelVersion;
          record.embeddingStatus = "READY";
        } catch (embedErr: any) {
          console.warn("[EMBEDDING_DEGRADED_LEXICAL_ONLY] save():", embedErr?.message || embedErr);
          record.embedding = [];
          record.embedding384 = undefined;
          record.embeddingStatus = "PENDING_EMBEDDING";
        }
      }
    } else if (record.embedding && record.embedding.length === 384 && !record.embedding384) {
      record.embedding384 = record.embedding;
      record.embeddingStatus = record.embeddingStatus || "READY";
    } else if (record.embedding384 && (!record.embedding || record.embedding.length === 0)) {
      record.embedding = record.embedding384;
      record.embeddingStatus = record.embeddingStatus || "READY";
    } else if (!record.embeddingStatus) {
      record.embeddingStatus = "READY";
    }

    record.updatedAt = Date.now();

    // Persist to MongoDB first if connected; never swallow genuine write errors
    if (this.isDbConnected()) {
      const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
      const filter = this.buildTenantRecordFilter(record.id, record.userId);
      const setFields: Record<string, any> = {
        userId: this.castTenantUserId(record.userId),
        memoryType: record.memoryType,
        domain: record.domain,
        content: record.content,
        summary: record.summary,
        source: record.source,
        confidence: record.confidence,
        importance: record.importance,
        evidenceCount: record.evidenceCount,
        firstObservedAt: new Date(record.firstObservedAt),
        lastReinforcedAt: new Date(record.lastReinforcedAt),
        validFrom: record.validFrom ? new Date(record.validFrom) : new Date(record.firstObservedAt),
        validTo: record.validTo ? new Date(record.validTo) : null,
        isArchived: record.isArchived,
        provenance: record.provenance,
        relatedEntityIds: record.relatedEntityIds,
        embedding: record.embedding,
        embedding384: record.embedding384,
        embeddingStatus: record.embeddingStatus || "READY",
        embeddingModel: record.embeddingModel,
        embeddingVersion: record.embeddingVersion,
        lifecycleStatus: record.lifecycleStatus,
        ...(record.sourceJobId ? { sourceJobId: record.sourceJobId } : {}),
        ...(record.contentHash ? { contentHash: record.contentHash } : {}),
        ...(record.slotKey ? { slotKey: record.slotKey } : {}),
        ...(record.supersededByMemoryId ? { supersededByMemoryId: record.supersededByMemoryId } : {}),
        ...(record.disputedWithMemoryIds?.length ? { disputedWithMemoryIds: record.disputedWithMemoryIds } : {}),
      };

      // Idempotent job+content check before upsert
      if (record.sourceJobId && record.contentHash) {
        const existingJobDoc = await PersonalMemory.findOne({
          userId: this.castTenantUserId(record.userId),
          sourceJobId: record.sourceJobId,
          contentHash: record.contentHash,
        }).lean();
        if (existingJobDoc) {
          const mappedExisting = this.mapDocToRecord(existingJobDoc);
          this.inMemoryStore.set(mappedExisting.id, { ...mappedExisting });
          return { ...mappedExisting };
        }
      }

      const updateDoc: Record<string, any> = { $set: setFields };
      if (canonicalMemoryId) {
        updateDoc.$setOnInsert = { memoryId: canonicalMemoryId };
      }

      const savedDoc = await PersonalMemory.findOneAndUpdate(filter, updateDoc, {
        upsert: true,
        new: true,
        runValidators: true,
      }).lean();

      const savedRecord = savedDoc ? this.mapDocToRecord(savedDoc) : { ...record };
      this.inMemoryStore.set(savedRecord.id, { ...savedRecord });
      return { ...savedRecord };
    }

    // Persist in-memory store for offline/unit-test mode (with idempotent sourceJobId+contentHash guard)
    if (record.sourceJobId && record.contentHash) {
      for (const existing of this.inMemoryStore.values()) {
        if (
          existing.userId === record.userId &&
          existing.sourceJobId === record.sourceJobId &&
          existing.contentHash === record.contentHash
        ) {
          return { ...existing };
        }
      }
    }
    this.inMemoryStore.set(record.id, { ...record });
    return { ...record };
  }

  /**
   * Fetch memory by ID strictly scoped by userId.
   */
  async getById(id: string, userId: string): Promise<PersonalMemoryRecord | null> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to access memory");
    }

    const inMem = this.inMemoryStore.get(id);
    if (inMem) {
      if (inMem.userId !== userId) return null; // Tenant barrier
      return { ...inMem };
    }

    if (this.isDbConnected()) {
      const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
      const doc = await PersonalMemory.findOne(this.buildTenantRecordFilter(id, userId)).lean();
      if (doc) {
        return this.mapDocToRecord(doc);
      }
    }

    return null;
  }

  /**
   * Convenience builder for creating and saving a new PersonalMemory record.
   */
  async createMemory(
    params: {
      userId: string;
      content: string;
      summary: string;
      memoryType: PersonalMemoryRecord["memoryType"];
      domain: PersonalMemoryRecord["domain"];
      source: PersonalMemoryRecord["source"];
      confidence?: number;
      importance?: number;
      relatedEntityIds?: string[];
      provenance?: PersonalMemoryRecord["provenance"];
      embedding?: number[];
      embeddingModel?: string;
      embeddingVersion?: number;
      validFrom?: number;
      validTo?: number | null;
      lifecycleStatus?: PersonalMemoryRecord["lifecycleStatus"];
      sourceJobId?: string;
      contentHash?: string;
      slotKey?: string;
      supersededByMemoryId?: string;
      disputedWithMemoryIds?: string[];
    }
  ): Promise<PersonalMemoryRecord> {
    const now = Date.now();
    const record: PersonalMemoryRecord = {
      id: generateId("mem"),
      userId: params.userId,
      content: params.content,
      summary: params.summary,
      memoryType: params.memoryType,
      domain: params.domain,
      source: params.source,
      confidence: params.confidence ?? 0.75,
      importance: params.importance ?? 0.50,
      evidenceCount: 1,
      firstObservedAt: now,
      lastReinforcedAt: now,
      validFrom: params.validFrom ?? now,
      validTo: params.validTo ?? null,
      isArchived: false,
      provenance: params.provenance ?? {},
      relatedEntityIds: params.relatedEntityIds ?? [],
      embedding: params.embedding,
      embeddingModel: params.embeddingModel ?? this.embeddingProvider.modelName,
      embeddingVersion: params.embeddingVersion ?? this.embeddingProvider.modelVersion,
      lifecycleStatus: params.lifecycleStatus ?? "verified",
      sourceJobId: params.sourceJobId,
      contentHash: params.contentHash,
      slotKey: params.slotKey,
      supersededByMemoryId: params.supersededByMemoryId,
      disputedWithMemoryIds: params.disputedWithMemoryIds,
      updatedAt: now,
    };

    return await this.save(record);
  }

  /**
   * Marks an older memory as superseded by a newer canonical memoryId,
   * closing its validTo window while preserving audit lineage.
   */
  async supersedeMemory(
    userId: string,
    targetMemoryId: string,
    supersededByMemoryId: string,
    validToMs: number = Date.now()
  ): Promise<boolean> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to supersede memory");
    }

    const inMem = this.inMemoryStore.get(targetMemoryId);
    if (inMem && inMem.userId !== userId) {
      return false;
    }

    if (this.isDbConnected()) {
      const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
      const res = await PersonalMemory.updateOne(
        this.buildTenantRecordFilter(targetMemoryId, userId),
        {
          $set: {
            isArchived: true,
            lifecycleStatus: "superseded",
            validTo: new Date(validToMs),
            supersededByMemoryId,
            updatedAt: new Date(validToMs),
          },
        }
      );
      if (res.matchedCount > 0 && inMem && inMem.userId === userId) {
        inMem.isArchived = true;
        inMem.lifecycleStatus = "superseded";
        inMem.validTo = validToMs;
        inMem.supersededByMemoryId = supersededByMemoryId;
        inMem.updatedAt = validToMs;
      }
      return res.matchedCount > 0;
    }

    if (inMem && inMem.userId === userId) {
      inMem.isArchived = true;
      inMem.lifecycleStatus = "superseded";
      inMem.validTo = validToMs;
      inMem.supersededByMemoryId = supersededByMemoryId;
      inMem.updatedAt = validToMs;
      return true;
    }

    return false;
  }

  /**
   * Marks a pair or group of conflicting memories as disputed without discarding either.
   */
  async markDisputed(userId: string, memoryId: string, conflictIds: string[]): Promise<boolean> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to mark disputed");
    }
    const cleanConflicts = conflictIds.filter((c) => c && c !== memoryId);
    if (cleanConflicts.length === 0) return false;

    const inMem = this.inMemoryStore.get(memoryId);
    if (inMem && inMem.userId !== userId) return false;

    if (this.isDbConnected()) {
      const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
      const res = await PersonalMemory.updateOne(
        this.buildTenantRecordFilter(memoryId, userId),
        {
          $set: { lifecycleStatus: "disputed", updatedAt: new Date() },
          $addToSet: { disputedWithMemoryIds: { $each: cleanConflicts } },
        }
      );
      if (res.matchedCount > 0 && inMem && inMem.userId === userId) {
        inMem.lifecycleStatus = "disputed";
        inMem.disputedWithMemoryIds = Array.from(
          new Set([...(inMem.disputedWithMemoryIds || []), ...cleanConflicts])
        );
        inMem.updatedAt = Date.now();
      }
      return res.matchedCount > 0;
    }

    if (inMem && inMem.userId === userId) {
      inMem.lifecycleStatus = "disputed";
      inMem.disputedWithMemoryIds = Array.from(
        new Set([...(inMem.disputedWithMemoryIds || []), ...cleanConflicts])
      );
      inMem.updatedAt = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Reinforces an existing memory by incrementing evidence count and updating lastReinforcedAt.
   */
  async reinforceMemory(
    userId: string,
    memoryId: string,
    updatedConfidence?: number
  ): Promise<PersonalMemoryRecord | null> {
    const existing = await this.getById(memoryId, userId);
    if (!existing) return null;

    const updates: Partial<PersonalMemoryRecord> = {
      evidenceCount: existing.evidenceCount + 1,
      lastReinforcedAt: Date.now(),
      lifecycleStatus: "reinforced",
    };
    if (updatedConfidence !== undefined) {
      updates.confidence = updatedConfidence;
    }

    return await this.update(memoryId, userId, updates);
  }

  /**
   * Finds nearest vector matches strictly scoped by user.
   * Utilizes MongoDB Atlas Vector Search ($vectorSearch) when connected,
   * with strict mode error gating and deterministic fallback for offline testing.
   */
  async findVectorNearest(
    userId: string,
    queryVector: number[],
    limit: number = 5,
    minSimilarity: number = 0.50
  ): Promise<Array<{ memory: PersonalMemoryRecord; similarityScore: number }>> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required for vector search");
    }

    // Determine target index and field path based on vector dimensionality
    let indexName: string;
    let vectorPath: string;

    if (queryVector.length === 384) {
      indexName = "personal_memory_vector_index_v2";
      vectorPath = "embedding384";
    } else if (queryVector.length === 1536) {
      indexName = "personal_memory_vector_index";
      vectorPath = "embedding";
    } else {
      throw new Error(
        `[VECTOR_INDEX_DIMENSION_MISMATCH]: Query vector dimension ${queryVector.length} does not match any configured index (expected 384 for v2 index or 1536 for legacy v1 index)`
      );
    }

    // 1. Try real Atlas Vector Search if DB is connected
    if (this.isDbConnected()) {
      try {
        const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
        const pipeline = [
          {
            $vectorSearch: {
              index: indexName,
              path: vectorPath,
              queryVector,
              numCandidates: Math.max(50, limit * 5),
              limit: limit * 2,
              filter: {
                userId: mongoose.Types.ObjectId.isValid(userId)
                  ? new mongoose.Types.ObjectId(userId)
                  : userId,
                isArchived: false,
              },
            },
          },
          {
            $addFields: {
              vectorScore: { $meta: "vectorSearchScore" },
            },
          },
        ];

        const atlasResults = await PersonalMemory.aggregate(pipeline).exec();
        if (Array.isArray(atlasResults) && atlasResults.length > 0) {
          const mapped: Array<{ memory: PersonalMemoryRecord; similarityScore: number }> = [];
          for (const doc of atlasResults) {
            const score = typeof doc.vectorScore === "number" ? doc.vectorScore : 0.5;
            if (score >= minSimilarity) {
              mapped.push({
                memory: this.mapDocToRecord(doc),
                similarityScore: Number(score.toFixed(4)),
              });
            }
          }
          if (mapped.length > 0) {
            return mapped.slice(0, limit);
          }
        }
      } catch (atlasErr: any) {
        if (process.env.REQUIRE_ATLAS_VECTOR_SEARCH === "true") {
          throw new Error(
            `[ATLAS_VECTOR_SEARCH_UNAVAILABLE]: Atlas Vector Search aggregation failed on index '${indexName}': ${atlasErr.message}`
          );
        }
        // Graceful fallback for offline / local mongod development
      }
    }

    // 2. Deterministic candidate evaluation (offline & mock layer)
    const candidates = await this.fetchUserCandidates({ userId, includeArchived: false });
    const matches: Array<{ memory: PersonalMemoryRecord; similarityScore: number }> = [];

    for (const mem of candidates) {
      const targetVec: number[] | undefined =
        queryVector.length === 384
          ? (mem.embedding384 && mem.embedding384.length === 384
            ? mem.embedding384
            : mem.embedding && mem.embedding.length === 384
              ? mem.embedding
              : undefined)
          : (mem.embedding && mem.embedding.length === 1536
            ? mem.embedding
            : undefined);

      if (!targetVec || targetVec.length !== queryVector.length) continue;
      const sim = cosineSimilarity(queryVector, targetVec);
      if (sim >= minSimilarity) {
        matches.push({ memory: mem, similarityScore: sim });
      }
    }

    matches.sort((a, b) => b.similarityScore - a.similarityScore);
    return matches.slice(0, limit);
  }

  /**
   * Retrieves active (non-archived, temporally valid) memories for a user.
   */
  async getActiveMemories(userId: string, domain?: MemoryDomain): Promise<PersonalMemoryRecord[]> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to fetch active memories");
    }
    return await this.fetchUserCandidates({
      userId,
      domain,
      includeArchived: false,
      referenceTime: Date.now(),
    });
  }

  /**
   * Convenience alias for archive with (userId, memoryId) signature.
   */
  async archiveMemory(userId: string, memoryId: string): Promise<boolean> {
    return await this.archive(memoryId, userId);
  }

  /**
   * Soft-delete / archive memory. Excludes it from future vector and hybrid retrieval.
   */
  async archive(id: string, userId: string): Promise<boolean> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to archive memory");
    }

    const inMem = this.inMemoryStore.get(id);
    if (inMem && inMem.userId !== userId) {
      return false;
    }

    if (this.isDbConnected()) {
      const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
      const res = await PersonalMemory.updateOne(
        this.buildTenantRecordFilter(id, userId),
        { $set: { isArchived: true, lifecycleStatus: "archived", updatedAt: new Date() } }
      );
      if (res.matchedCount > 0 && inMem && inMem.userId === userId) {
        inMem.isArchived = true;
        inMem.lifecycleStatus = "archived";
        inMem.updatedAt = Date.now();
      }
      return res.matchedCount > 0;
    }

    if (inMem && inMem.userId === userId) {
      inMem.isArchived = true;
      inMem.lifecycleStatus = "archived";
      inMem.updatedAt = Date.now();
      return true;
    }

    return false;
  }

  /**
   * Update fields on an existing memory with tenant boundary checks.
   */
  async update(
    id: string,
    userId: string,
    updates: Partial<PersonalMemoryRecord>
  ): Promise<PersonalMemoryRecord | null> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to update memory");
    }

    const existing = await this.getById(id, userId);
    if (!existing) return null;

    const merged: PersonalMemoryRecord = {
      ...existing,
      ...updates,
      id: existing.id,
      memoryId: existing.memoryId, // Canonical identity is immutable
      userId: existing.userId, // Prevent re-assignment to another tenant
      updatedAt: Date.now(),
    };

    if (updates.content && updates.content !== existing.content) {
      if (process.env.LIFEOS_DISABLE_EMBEDDINGS === "true") {
        merged.embedding = [];
        merged.embedding384 = undefined;
        merged.embeddingStatus = "LEXICAL_ONLY";
      } else {
        try {
          const vec = await this.embeddingProvider.generateEmbedding(updates.content);
          if (this.embeddingProvider.dimension === 384) {
            merged.embedding384 = vec;
            merged.embedding = vec;
          } else {
            merged.embedding = vec;
          }
          merged.embeddingModel = this.embeddingProvider.modelName;
          merged.embeddingVersion = this.embeddingProvider.modelVersion;
          merged.embeddingStatus = "READY";
        } catch (embedErr: any) {
          console.warn("[EMBEDDING_DEGRADED_LEXICAL_ONLY] update():", embedErr?.message || embedErr);
          merged.embedding = [];
          merged.embedding384 = undefined;
          merged.embeddingStatus = "PENDING_EMBEDDING";
        }
      }
    }

    return await this.save(merged);
  }

  private computeLexicalScore(queryText: string, mem: PersonalMemoryRecord): number {
    const cleanQuery = (queryText || "").toLowerCase().trim();
    if (!cleanQuery) return 0;

    const haystack = `${mem.summary || ""} ${mem.content || ""}`.toLowerCase();
    if (!haystack.trim()) return 0;

    const queryTokens = Array.from(
      new Set(
        cleanQuery
          .split(/[^\p{L}\p{N}_]+/u)
          .map((t) => t.trim())
          .filter((t) => t.length >= 2)
      )
    );

    let tokenHits = 0;
    for (const token of queryTokens) {
      if (haystack.includes(token)) {
        tokenHits++;
      }
    }

    const tokenCoverage = queryTokens.length > 0 ? tokenHits / queryTokens.length : 0;
    const exactPhraseBonus = haystack.includes(cleanQuery) ? 0.3 : 0;
    return Math.min(1.0, Number((tokenCoverage * 0.8 + exactPhraseBonus).toFixed(4)));
  }

  /**
   * Hybrid Vector + Metadata Search with Strict Tenant Isolation
   */
  async search(query: MemoryQuery): Promise<ScoredMemoryResult[]> {
    if (!query.userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required for memory search");
    }

    const refTime = query.referenceTime || Date.now();
    const limit = query.limit || 5;

    // Generate query vector if text is provided, degrading cleanly to lexical-only if unavailable
    let queryVector = query.queryVector;
    let vectorInferenceAvailable = Boolean(queryVector && queryVector.length > 0);

    if (!queryVector && query.queryText && process.env.LIFEOS_DISABLE_EMBEDDINGS !== "true") {
      try {
        queryVector = await this.embeddingProvider.generateEmbedding(query.queryText);
        vectorInferenceAvailable = Boolean(queryVector && queryVector.length > 0);
      } catch (embedErr: any) {
        console.warn("[EMBEDDING_DEGRADED_LEXICAL_ONLY] search():", embedErr?.message || embedErr);
        queryVector = undefined;
        vectorInferenceAvailable = false;
      }
    }

    // Retrieve candidate memories for user
    const candidates = await this.fetchUserCandidates(query);
    if (candidates.length === 0) {
      return [];
    }

    const scored: ScoredMemoryResult[] = [];
    let usedAnyVector = false;

    for (const mem of candidates) {
      // 1. Always-on Lexical Similarity
      const lexicalScore = query.queryText ? this.computeLexicalScore(query.queryText, mem) : 0.5;

      // 2. Semantic Vector Similarity (same dimension only; never compare mismatched dimensions)
      let vectorScore: number | undefined = undefined;
      const memVec: number[] | undefined =
        queryVector && queryVector.length === 384
          ? (mem.embedding384 && mem.embedding384.length === 384
            ? mem.embedding384
            : mem.embedding && mem.embedding.length === 384
              ? mem.embedding
              : undefined)
          : queryVector && queryVector.length === 1536
            ? (mem.embedding && mem.embedding.length === 1536 ? mem.embedding : undefined)
            : undefined;

      if (queryVector && memVec && memVec.length === queryVector.length) {
        vectorScore = cosineSimilarity(queryVector, memVec);
        usedAnyVector = true;
      }

      const similarity =
        vectorScore !== undefined
          ? query.queryText
            ? Number((0.70 * Math.max(0, vectorScore) + 0.30 * lexicalScore).toFixed(4))
            : Number(Math.max(0, vectorScore).toFixed(4))
          : lexicalScore;

      // 3. Exponential Recency Decay
      const ageHours = Math.max(0, (refTime - mem.lastReinforcedAt) / (1000 * 3600));
      const halfLifeHours = this.policy.temporalDecayHalfLifeDays * 24;
      const recencyScore = Math.max(0.05, Math.exp(-ageHours / halfLifeHours));

      // 4. Composite Weighted Scoring + Stale/Disputed Downranking
      const lifecycleMultiplier =
        mem.lifecycleStatus === "stale" || (mem.lifecycleStatus as string) === "disputed" ? 0.65 : 1.0;

      const finalScore = Number(
        (
          (0.45 * Math.max(0, similarity) +
            0.25 * recencyScore +
            0.15 * mem.importance +
            0.15 * mem.confidence) *
          lifecycleMultiplier
        ).toFixed(4)
      );

      const mode: ScoredMemoryResult["retrievalMode"] =
        vectorInferenceAvailable && vectorScore !== undefined ? "hybrid" : "lexical_only";

      const explanation = `Memory [${mem.id}] scored ${finalScore} (${mode}; Sim: ${similarity.toFixed(2)}, Lex: ${lexicalScore.toFixed(2)}${vectorScore !== undefined ? `, Vec: ${vectorScore.toFixed(2)}` : ""}, Recency: ${recencyScore.toFixed(2)})`;

      scored.push({
        memory: mem,
        similarityScore: similarity,
        lexicalScore,
        vectorScore,
        recencyScore,
        finalScore,
        retrievalMode: mode,
        explanation,
      });
    }

    // Deterministic sorting with explicit tie-breakers (Score DESC -> lastReinforcedAt DESC -> id ASC)
    scored.sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      if (b.memory.lastReinforcedAt !== a.memory.lastReinforcedAt) {
        return b.memory.lastReinforcedAt - a.memory.lastReinforcedAt;
      }
      return a.memory.id.localeCompare(b.memory.id);
    });

    const resolvedMode: ScoredMemoryResult["retrievalMode"] = usedAnyVector ? "hybrid" : "lexical_only";
    return scored.slice(0, limit).map((item) => ({
      ...item,
      retrievalMode: item.retrievalMode || resolvedMode,
    }));
  }

  private async fetchUserCandidates(query: MemoryQuery): Promise<PersonalMemoryRecord[]> {
    const list: PersonalMemoryRecord[] = [];
    const seenIds = new Set<string>();
    const scanLimit = Math.max(200, (query.limit || 5) * 20);

    // In-memory filter
    for (const mem of this.inMemoryStore.values()) {
      if (mem.userId !== query.userId) continue; // Strict tenant isolation
      if (!query.includeArchived && mem.isArchived) continue;
      if (!query.includeSuperseded && (mem.lifecycleStatus as string) === "superseded") continue;
      if (!query.includeStale && mem.lifecycleStatus === "stale") continue;
      if (query.domain && mem.domain !== query.domain) continue;
      if (query.memoryType && mem.memoryType !== query.memoryType) continue;
      if (query.minConfidence !== undefined && mem.confidence < query.minConfidence) continue;

      // Temporal validity window check
      if (query.referenceTime) {
        if (mem.validFrom && mem.validFrom > query.referenceTime) continue;
        if (mem.validTo && mem.validTo < query.referenceTime) continue;
      }

      list.push({ ...mem });
      seenIds.add(mem.id);
    }

    // Merge with DB if connected
    if (this.isDbConnected()) {
      try {
        const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
        const filter: any = { userId: this.castTenantUserId(query.userId) };
        if (!query.includeArchived) filter.isArchived = false;
        if (!query.includeSuperseded) filter.lifecycleStatus = { $ne: "superseded" };
        if (!query.includeStale) {
          filter.lifecycleStatus = filter.lifecycleStatus
            ? { $nin: ["superseded", "stale"] }
            : { $ne: "stale" };
        }
        if (query.domain) filter.domain = query.domain;
        if (query.memoryType) filter.memoryType = query.memoryType;
        if (query.minConfidence !== undefined) filter.confidence = { $gte: query.minConfidence };

        if (query.referenceTime) {
          const refDate = new Date(query.referenceTime);
          filter.$and = [
            { $or: [{ validFrom: { $exists: false } }, { validFrom: null }, { validFrom: { $lte: refDate } }] },
            { $or: [{ validTo: { $exists: false } }, { validTo: null }, { validTo: { $gte: refDate } }] },
          ];
        }

        const recentDocs = await PersonalMemory.find(filter)
          .sort({ lastReinforcedAt: -1, confidence: -1 })
          .limit(scanLimit)
          .lean();

        for (const doc of recentDocs) {
          const rec = this.mapDocToRecord(doc);
          if (!seenIds.has(rec.id)) {
            list.push(rec);
            seenIds.add(rec.id);
          }
        }

        // Supplement with DB-level text/lexical slice so >scanLimit users do not miss older exact matches
        if (query.queryText && query.queryText.trim().length > 0) {
          const tokens = Array.from(
            new Set(
              query.queryText
                .toLowerCase()
                .split(/[^\p{L}\p{N}_]+/u)
                .filter((t) => t.length >= 2)
            )
          ).slice(0, 8);

          if (tokens.length > 0) {
            const escapedPattern = tokens
              .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
              .join("|");
            const lexFilter = {
              ...filter,
              $or: [
                { content: { $regex: escapedPattern, $options: "i" } },
                { summary: { $regex: escapedPattern, $options: "i" } },
              ],
            };
            const lexDocs = await PersonalMemory.find(lexFilter)
              .sort({ lastReinforcedAt: -1 })
              .limit(100)
              .lean();
            for (const doc of lexDocs) {
              const rec = this.mapDocToRecord(doc);
              if (!seenIds.has(rec.id)) {
                list.push(rec);
                seenIds.add(rec.id);
              }
            }
          }
        }
      } catch (err) {
        console.warn("[MEMORY_REPOSITORY] fetchUserCandidates db warning:", err);
      }
    }

    return list;
  }

  /**
   * Repairs memories stored with embeddingStatus === "PENDING_EMBEDDING" once local
   * WASM embedding inference is available. Safe, bounded, and non-destructive.
   */
  async backfillPendingEmbeddings(
    limit: number = 50,
    userId?: string,
    targetProvider?: IEmbeddingProvider
  ): Promise<{ processed: number; repaired: number; failed: number }> {
    const provider = targetProvider || this.embeddingProvider;
    let processed = 0;
    let repaired = 0;
    let failed = 0;

    for (const record of this.inMemoryStore.values()) {
      if (userId && record.userId !== userId) continue;
      if (record.embeddingStatus === "PENDING_EMBEDDING") {
        processed++;
        try {
          const vec = await provider.generateEmbedding(record.content);
          if (vec.length === 384) {
            record.embedding384 = vec;
            record.embedding = vec;
          } else {
            record.embedding = vec;
          }
          record.embeddingModel = provider.modelName;
          record.embeddingVersion = provider.modelVersion;
          record.embeddingStatus = "READY";
          record.updatedAt = Date.now();
          repaired++;
        } catch {
          failed++;
        }
      }
      if (processed >= limit) break;
    }

    if (this.isDbConnected() && processed < limit) {
      const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
      const query: Record<string, any> = { embeddingStatus: "PENDING_EMBEDDING" };
      if (userId) {
        query.userId = this.castTenantUserId(userId);
      }
      const docs = await PersonalMemory.find(query).limit(limit - processed).exec();
      for (const doc of docs) {
        processed++;
        try {
          const vec = await provider.generateEmbedding(doc.content);
          if (vec.length === 384) {
            doc.embedding384 = vec;
            doc.embedding = vec;
          } else {
            doc.embedding = vec;
          }
          doc.embeddingModel = provider.modelName;
          doc.embeddingVersion = provider.modelVersion;
          doc.embeddingStatus = "READY";
          await doc.save();
          repaired++;
        } catch {
          failed++;
        }
      }
    }

    return {
      processed,
      repaired,
      failed,
    };
  }

  /**
   * Structured, allowlisted read query backing `lifeos.memory.search`.
   * Strips raw embedding vectors and enforces deterministic pagination and temporal/lifecycle filtering.
   */
  async queryMemories(
    userId: string,
    params: {
      query?: string;
      domain?: PersonalMemoryRecord["domain"];
      memoryType?: PersonalMemoryRecord["memoryType"];
      includeStale?: boolean;
      includeSuperseded?: boolean;
      minConfidence?: number;
      referenceTime?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    items: Array<{
      memoryId: string;
      summary: string;
      content: string;
      memoryType: PersonalMemoryRecord["memoryType"];
      domain: PersonalMemoryRecord["domain"];
      source: PersonalMemoryRecord["source"];
      confidence: number;
      importance: number;
      evidenceCount: number;
      lifecycleStatus: PersonalMemoryRecord["lifecycleStatus"];
      isStale: boolean;
      isDisputed: boolean;
      validFrom?: string;
      validTo?: string | null;
      firstObservedAt: string;
      lastReinforcedAt: string;
      provenance: PersonalMemoryRecord["provenance"];
      disputedWithMemoryIds?: string[];
      score: number;
      retrievalSignal: string;
    }>;
    totalCount: number;
    returnedCount: number;
    hasMore: boolean;
    retrievalMode: "hybrid" | "lexical_only" | "empty";
    emptyReason: string;
  }> {
    if (!userId) {
      throw new Error("[SECURITY_VIOLATION]: userId required to query memories");
    }

    let refMs = Date.now();
    if (params.referenceTime !== undefined) {
      const parsed = Date.parse(params.referenceTime);
      if (Number.isNaN(parsed)) {
        throw new Error(`[INVALID_PARAMETER]: Invalid referenceTime ISO string: ${params.referenceTime}`);
      }
      refMs = parsed;
    }

    const limit = Math.max(1, Math.min(Number(params.limit ?? 8), 25));
    const offset = Math.max(0, Math.min(Number(params.offset ?? 0), 500));

    const scoredAll = await this.search({
      userId,
      queryText: typeof params.query === "string" ? params.query : undefined,
      domain: params.domain,
      memoryType: params.memoryType,
      minConfidence: params.minConfidence,
      includeArchived: false,
      includeStale: Boolean(params.includeStale),
      includeSuperseded: Boolean(params.includeSuperseded),
      referenceTime: refMs,
      limit: offset + limit,
    });

    const page = scoredAll.slice(offset, offset + limit);
    const retrievalMode: "hybrid" | "lexical_only" | "empty" =
      page.length === 0
        ? "empty"
        : page.some((p) => p.retrievalMode === "hybrid")
          ? "hybrid"
          : "lexical_only";

    let emptyReason = "";
    if (page.length === 0) {
      const anyHistorical = await this.fetchUserCandidates({
        userId,
        includeArchived: true,
        includeStale: true,
        includeSuperseded: true,
      });
      emptyReason =
        anyHistorical.length > 0
          ? "Only archived, expired, or superseded memories exist for these criteria."
          : "No matching active personal memories found.";
    }

    return {
      items: page.map((r) => ({
        memoryId: r.memory.memoryId || r.memory.id,
        summary: r.memory.summary,
        content: r.memory.content,
        memoryType: r.memory.memoryType,
        domain: r.memory.domain,
        source: r.memory.source,
        confidence: r.memory.confidence,
        importance: r.memory.importance,
        evidenceCount: r.memory.evidenceCount,
        lifecycleStatus: r.memory.lifecycleStatus,
        isStale: r.memory.lifecycleStatus === "stale",
        isDisputed: r.memory.lifecycleStatus === "disputed",
        validFrom: r.memory.validFrom ? new Date(r.memory.validFrom).toISOString() : undefined,
        validTo: r.memory.validTo ? new Date(r.memory.validTo).toISOString() : null,
        firstObservedAt: new Date(r.memory.firstObservedAt).toISOString(),
        lastReinforcedAt: new Date(r.memory.lastReinforcedAt).toISOString(),
        provenance: r.memory.provenance || {},
        ...(r.memory.disputedWithMemoryIds?.length
          ? { disputedWithMemoryIds: r.memory.disputedWithMemoryIds }
          : {}),
        score: r.finalScore,
        retrievalSignal: r.retrievalMode || retrievalMode,
      })),
      totalCount: scoredAll.length,
      returnedCount: page.length,
      hasMore: offset + page.length < scoredAll.length,
      retrievalMode,
      emptyReason,
    };
  }

  /**
   * Backfills 384-dimensional embeddings for legacy documents lacking embedding384.
   * Safe and non-destructive: Preserves original 1536-dimensional embedding untouched.
   */
  async backfillLegacyEmbeddings(
    userId?: string,
    limit: number = 100,
    targetProvider?: IEmbeddingProvider
  ): Promise<{ processed: number; migrated: number }> {
    let processed = 0;
    let migrated = 0;

    const provider =
      targetProvider ||
      (this.embeddingProvider.dimension === 384
        ? this.embeddingProvider
        : process.env.NODE_ENV === "production" ||
          process.env.LIFEOS_RUNTIME_MODE === "production" ||
          process.env.USE_LOCAL_EMBEDDINGS === "true"
          ? new LocalSentenceTransformerEmbeddingProvider()
          : new DeterministicMockEmbeddingProvider(384));

    // 1. Backfill in-memory store
    for (const record of this.inMemoryStore.values()) {
      if (userId && record.userId !== userId) continue;
      if (!record.embedding384 || record.embedding384.length !== 384) {
        processed++;
        const vec = await provider.generateEmbedding(record.content);
        if (vec.length === 384) {
          record.embedding384 = vec;
          if (!record.embedding || record.embedding.length === 0) {
            record.embedding = vec;
          }
          record.embeddingModel = provider.modelName;
          record.embeddingVersion = provider.modelVersion;
          record.updatedAt = Date.now();
          migrated++;
        }
      }
      if (processed >= limit) break;
    }

    // 2. Backfill MongoDB documents if connected
    if (this.isDbConnected()) {
      try {
        const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
        const query: any = {
          $or: [
            { embedding384: { $exists: false } },
            { embedding384: { $size: 0 } },
          ],
        };
        if (userId) {
          query.userId = mongoose.Types.ObjectId.isValid(userId)
            ? new mongoose.Types.ObjectId(userId)
            : userId;
        }

        const docs = await PersonalMemory.find(query).limit(limit).exec();
        for (const doc of docs) {
          processed++;
          const vec = await provider.generateEmbedding(doc.content);
          if (vec.length === 384) {
            doc.embedding384 = vec;
            doc.embeddingModel = provider.modelName;
            doc.embeddingVersion = provider.modelVersion;
            await doc.save();
            migrated++;
          }
        }
      } catch (err) {
        console.warn("[MEMORY_REPOSITORY] backfillLegacyEmbeddings DB warning:", err);
      }
    }

    return { processed, migrated };
  }

  /**
   * Non-destructive, idempotent backfill assigning canonical `memoryId` to legacy
   * PersonalMemory documents that lack one. Preserves existing _id, content,
   * timestamps, and provenance. Safe to rerun and handles partial completion.
   */
  async reconcileLegacyPersonalMemoryIdentities(
    options: { batchSize?: number; dryRun?: boolean; userId?: string } = {}
  ): Promise<{ scanned: number; backfilled: number; skipped: number }> {
    const batchSize = Math.max(1, Math.min(options.batchSize ?? 100, 500));
    const dryRun = options.dryRun ?? false;
    let scanned = 0;
    let backfilled = 0;
    let skipped = 0;

    if (!this.isDbConnected()) {
      return { scanned, backfilled, skipped };
    }

    const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
    const missingFilter: Record<string, any> = {
      $or: [{ memoryId: { $exists: false } }, { memoryId: null }, { memoryId: "" }],
    };
    if (options.userId) {
      missingFilter.userId = this.castTenantUserId(options.userId);
    }

    let lastSeenId: any = null;
    while (true) {
      const pageFilter: Record<string, any> = lastSeenId
        ? { ...missingFilter, _id: { $gt: lastSeenId } }
        : missingFilter;

      const docs = await PersonalMemory.find(pageFilter)
        .sort({ _id: 1 })
        .limit(batchSize)
        .select({ _id: 1, memoryId: 1 })
        .lean();

      if (docs.length === 0) break;

      for (const doc of docs) {
        scanned++;
        lastSeenId = doc._id;

        if (typeof doc.memoryId === "string" && doc.memoryId.trim().length > 0) {
          skipped++;
          continue;
        }

        if (dryRun) {
          backfilled++;
          continue;
        }

        const newMemoryId = generateId("mem");
        const res = await PersonalMemory.updateOne(
          {
            _id: doc._id,
            $or: [{ memoryId: { $exists: false } }, { memoryId: null }, { memoryId: "" }],
          },
          { $set: { memoryId: newMemoryId } },
          { timestamps: false }
        );

        if (res.modifiedCount > 0) {
          backfilled++;
        } else {
          skipped++;
        }
      }

      if (docs.length < batchSize) break;
    }

    return { scanned, backfilled, skipped };
  }

  private mapDocToRecord(doc: any): PersonalMemoryRecord {
    const canonicalId = doc.memoryId || doc._id?.toString() || doc.id;
    return {
      id: canonicalId,
      memoryId: doc.memoryId || undefined,
      userId: doc.userId?.toString() || doc.userId,
      memoryType: doc.memoryType || "semantic_fact",
      domain: doc.domain || "general",
      content: doc.content || "",
      summary: doc.summary || "",
      source: doc.source || "explicit_user_statement",
      confidence: typeof doc.confidence === "number" ? doc.confidence : 0.8,
      importance: typeof doc.importance === "number" ? doc.importance : 0.5,
      evidenceCount: typeof doc.evidenceCount === "number" ? doc.evidenceCount : 1,
      firstObservedAt: doc.firstObservedAt ? new Date(doc.firstObservedAt).getTime() : Date.now(),
      lastReinforcedAt: doc.lastReinforcedAt ? new Date(doc.lastReinforcedAt).getTime() : Date.now(),
      validFrom: doc.validFrom ? new Date(doc.validFrom).getTime() : undefined,
      validTo: doc.validTo ? new Date(doc.validTo).getTime() : null,
      isArchived: Boolean(doc.isArchived),
      provenance: doc.provenance || {},
      relatedEntityIds: doc.relatedEntityIds || [],
      embedding: doc.embedding || doc.embedding384 || [],
      embedding384: doc.embedding384 || (doc.embedding?.length === 384 ? doc.embedding : undefined),
      embeddingStatus: doc.embeddingStatus || "READY",
      embeddingModel: doc.embeddingModel || "sentence-transformers/all-MiniLM-L6-v2",
      embeddingVersion: doc.embeddingVersion || 1,
      lifecycleStatus: doc.lifecycleStatus || "verified",
      sourceJobId: doc.sourceJobId || undefined,
      contentHash: doc.contentHash || undefined,
      slotKey: doc.slotKey || undefined,
      supersededByMemoryId: doc.supersededByMemoryId || undefined,
      disputedWithMemoryIds: Array.isArray(doc.disputedWithMemoryIds) ? doc.disputedWithMemoryIds : undefined,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).getTime() : Date.now(),
    };
  }
}
