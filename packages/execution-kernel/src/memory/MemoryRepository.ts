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

  /**
   * Save or update a PersonalMemory record with automatic vector generation if missing.
   */
  async save(record: PersonalMemoryRecord): Promise<PersonalMemoryRecord> {
    if (!record.userId) {
      throw new Error("[SECURITY_VIOLATION]: Cannot persist memory without userId");
    }

    if (!record.id) {
      record.id = generateId("mem");
    }

    // Auto-generate vector if not provided
    if (
      (!record.embedding || record.embedding.length === 0) &&
      (!record.embedding384 || record.embedding384.length === 0)
    ) {
      const vec = await this.embeddingProvider.generateEmbedding(record.content);
      if (this.embeddingProvider.dimension === 384) {
        record.embedding384 = vec;
        record.embedding = vec;
      } else {
        record.embedding = vec;
      }
      record.embeddingModel = this.embeddingProvider.modelName;
      record.embeddingVersion = this.embeddingProvider.modelVersion;
    } else if (record.embedding && record.embedding.length === 384 && !record.embedding384) {
      record.embedding384 = record.embedding;
    } else if (record.embedding384 && (!record.embedding || record.embedding.length === 0)) {
      record.embedding = record.embedding384;
    }

    record.updatedAt = Date.now();

    // Persist in-memory store
    this.inMemoryStore.set(record.id, { ...record });

    // Persist to MongoDB if connected
    if (this.isDbConnected()) {
      try {
        const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
        await PersonalMemory.findOneAndUpdate(
          { _id: record.id.startsWith("mem_") ? undefined : record.id, userId: record.userId },
          {
            $set: {
              userId: record.userId,
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
              embeddingModel: record.embeddingModel,
              embeddingVersion: record.embeddingVersion,
              lifecycleStatus: record.lifecycleStatus,
            },
          },
          { upsert: true, new: true }
        );
      } catch (dbErr) {
        console.warn("[MEMORY_REPOSITORY] MongoDB write warning:", dbErr);
      }
    }

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
      try {
        const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
        const doc = await PersonalMemory.findOne({ _id: id, userId }).lean();
        if (doc) {
          return this.mapDocToRecord(doc);
        }
      } catch (err) {
        console.warn("[MEMORY_REPOSITORY] getById db warning:", err);
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
      lifecycleStatus: "verified",
      updatedAt: now,
    };

    return await this.save(record);
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
    if (inMem && inMem.userId === userId) {
      inMem.isArchived = true;
      inMem.lifecycleStatus = "archived";
      inMem.updatedAt = Date.now();
    }

    if (this.isDbConnected()) {
      try {
        const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
        const res = await PersonalMemory.updateOne(
          { _id: id, userId },
          { $set: { isArchived: true, lifecycleStatus: "archived", updatedAt: new Date() } }
        );
        return res.matchedCount > 0;
      } catch (err) {
        console.warn("[MEMORY_REPOSITORY] archive db warning:", err);
      }
    }

    return inMem !== undefined && inMem.userId === userId;
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
      userId: existing.userId, // Prevent re-assignment to another tenant
      updatedAt: Date.now(),
    };

    if (updates.content && updates.content !== existing.content) {
      merged.embedding = await this.embeddingProvider.generateEmbedding(updates.content);
    }

    return await this.save(merged);
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

    // Generate query vector if text is provided
    let queryVector = query.queryVector;
    if (!queryVector && query.queryText) {
      queryVector = await this.embeddingProvider.generateEmbedding(query.queryText);
    }

    // Retrieve candidate memories for user
    const candidates = await this.fetchUserCandidates(query);

    const scored: ScoredMemoryResult[] = [];

    for (const mem of candidates) {
      // 1. Semantic Similarity
      let similarity = 0.5;
      const memVec: number[] | undefined =
        queryVector && queryVector.length === 384
          ? (mem.embedding384 && mem.embedding384.length === 384
              ? mem.embedding384
              : mem.embedding && mem.embedding.length === 384
              ? mem.embedding
              : undefined)
          : (mem.embedding && mem.embedding.length === 1536
              ? mem.embedding
              : undefined);

      if (queryVector && memVec && memVec.length === queryVector.length) {
        similarity = cosineSimilarity(queryVector, memVec);
      } else if (query.queryText) {
        // Fallback substring relevance
        if (mem.content.toLowerCase().includes(query.queryText.toLowerCase())) {
          similarity = 0.9;
        }
      }

      // 2. Exponential Recency Decay
      const ageHours = Math.max(0, (refTime - mem.lastReinforcedAt) / (1000 * 3600));
      const halfLifeHours = this.policy.temporalDecayHalfLifeDays * 24;
      const recencyScore = Math.max(0.05, Math.exp(-ageHours / halfLifeHours));

      // 3. Composite Weighted Scoring
      // Similarity (40%), Recency (25%), Importance (20%), Confidence (15%)
      const finalScore = Number(
        (
          0.40 * Math.max(0, similarity) +
          0.25 * recencyScore +
          0.20 * mem.importance +
          0.15 * mem.confidence
        ).toFixed(4)
      );

      const explanation = `Memory [${mem.id}] scored ${finalScore} (Sim: ${similarity.toFixed(2)}, Recency: ${recencyScore.toFixed(2)}, Imp: ${mem.importance.toFixed(2)}, Conf: ${mem.confidence.toFixed(2)})`;

      scored.push({
        memory: mem,
        similarityScore: similarity,
        recencyScore,
        finalScore,
        explanation,
      });
    }

    // Sort descending by finalScore
    scored.sort((a, b) => b.finalScore - a.finalScore);

    return scored.slice(0, limit);
  }

  private async fetchUserCandidates(query: MemoryQuery): Promise<PersonalMemoryRecord[]> {
    const list: PersonalMemoryRecord[] = [];

    // In-memory filter
    for (const mem of this.inMemoryStore.values()) {
      if (mem.userId !== query.userId) continue; // Strict tenant isolation
      if (!query.includeArchived && mem.isArchived) continue;
      if (query.domain && mem.domain !== query.domain) continue;
      if (query.memoryType && mem.memoryType !== query.memoryType) continue;
      if (query.minConfidence !== undefined && mem.confidence < query.minConfidence) continue;

      // Temporal validity window check
      if (query.referenceTime) {
        if (mem.validFrom && mem.validFrom > query.referenceTime) continue;
        if (mem.validTo && mem.validTo < query.referenceTime) continue;
      }

      list.push({ ...mem });
    }

    // Merge with DB if connected
    if (this.isDbConnected()) {
      try {
        const { PersonalMemory } = await import("@/server/db/models/PersonalMemory");
        const filter: any = { userId: query.userId };
        if (!query.includeArchived) filter.isArchived = false;
        if (query.domain) filter.domain = query.domain;
        if (query.memoryType) filter.memoryType = query.memoryType;
        if (query.minConfidence !== undefined) filter.confidence = { $gte: query.minConfidence };

        const docs = await PersonalMemory.find(filter).limit(100).lean();
        for (const doc of docs) {
          const rec = this.mapDocToRecord(doc);
          if (!list.some((existing) => existing.id === rec.id)) {
            list.push(rec);
          }
        }
      } catch (err) {
        console.warn("[MEMORY_REPOSITORY] fetchUserCandidates db warning:", err);
      }
    }

    return list;
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

  private mapDocToRecord(doc: any): PersonalMemoryRecord {
    return {
      id: doc._id?.toString() || doc.id,
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
      embeddingModel: doc.embeddingModel || "sentence-transformers/all-MiniLM-L6-v2",
      embeddingVersion: doc.embeddingVersion || 1,
      lifecycleStatus: doc.lifecycleStatus || "verified",
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).getTime() : Date.now(),
    };
  }
}
