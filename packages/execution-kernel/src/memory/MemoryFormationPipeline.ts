import * as crypto from "node:crypto";
import { z } from "zod";
import {
  PersonalMemoryRecord,
  MemoryDomain,
  MemoryType,
  EpistemicSource,
  DEFAULT_MEMORY_POLICY,
} from "./PersonalMemoryContracts";
import {
  EpistemicVerificationEngine,
  CandidateMemory,
  VerificationAssessment,
} from "./EpistemicVerificationEngine";
import {
  ContradictionResolver,
  ContradictionResolution,
  ContradictionDecision,
} from "./ContradictionResolver";
import { MemoryRepository } from "./MemoryRepository";
import { EmbeddingProviderRegistry, IEmbeddingProvider } from "./EmbeddingProvider";
import { groqChat, cleanLLMResponse } from "../shared/groq";
import { resolveGroqModel } from "../shared/modelRegistry";

export interface ConversationTurnInput {
  userId: string;
  userMessage: string;
  assistantResponse?: string;
  conversationId?: string;
  turnId?: string;
  requestId?: string;
  sourceJobId?: string;
  domainHint?: MemoryDomain;
  semanticTurnMeta?: {
    primaryClassification?: string;
    operationsCount?: number;
    hasOperations?: boolean;
  };
  explicitMemory?: {
    content: string;
    summary?: string;
    domain?: MemoryDomain;
    memoryType?: MemoryType;
  };
}

export interface IMemorySemanticExtractor {
  extract(turn: ConversationTurnInput): Promise<CandidateMemory[]>;
  classifyContradiction?(
    candidate: CandidateMemory,
    existing: PersonalMemoryRecord
  ): Promise<ContradictionDecision>;
}

const ExtractedCandidateSchema = z.object({
  content: z.string().min(5).max(800),
  summary: z.string().min(3).max(200),
  memoryType: z.enum([
    "semantic_fact",
    "episodic_event",
    "behavioral_pattern",
    "goal_intelligence",
    "incident",
    "intervention",
  ]),
  domain: z.enum(["productivity", "health", "wellness", "identity", "general"]),
  source: z
    .enum([
      "explicit_user_statement",
      "behavioral_telemetry",
      "system_inference",
      "user_reflection",
    ])
    .default("explicit_user_statement"),
  confidence: z.number().min(0).max(1).optional(),
  importance: z.number().min(0).max(1).optional(),
  slotKey: z.string().min(2).max(80).optional(),
  validFrom: z.string().optional(),
  validTo: z.string().nullable().optional(),
  isTransient: z.boolean().optional(),
});

const ExtractedMemoryBatchSchema = z.object({
  candidates: z.array(ExtractedCandidateSchema).max(10),
});

function sha256Content(text: string): string {
  return crypto
    .createHash("sha256")
    .update((text || "").trim().toLowerCase())
    .digest("hex");
}

export interface MemoryFormationResult {
  candidateCount: number;
  storedCount: number;
  reinforcedCount: number;
  supersededCount: number;
  rejectedCount: number;
  auditTrail: Array<{
    candidate: CandidateMemory;
    assessment: VerificationAssessment;
    resolution?: ContradictionResolution;
    storedId?: string;
  }>;
}

export interface PinnedRetrievedMemory {
  id: string;
  memoryVersion: number;
  content: string;
  summary: string;
  domain: MemoryDomain;
  similarityScore: number;
  recencyScore: number;
  finalScore: number;
  score: number;
  ranking: number;
  embeddingModel: string;
  embeddingVersion: number;
}

export interface MemoryRetrievalSnapshot {
  snapshotId: string;
  userId: string;
  query: string;
  retrievedMemoryIds: string[];
  retrievedMemories: PinnedRetrievedMemory[];
  timestamp: number;
  policyVersion: string;
  projectionVersion: string;
  filterConfig?: {
    domain?: MemoryDomain;
    limit?: number;
    minConfidence?: number;
  };
}

/**
 * MemoryFormationPipeline
 * 
 * Central orchestration for transforming user interactions and system telemetry
 * into verified, long-term personal memories.
 * 
 * Enforces:
 * - Deterministic epistemic verification before any persistence.
 * - Noise rejection (Invariant 1).
 * - Deduplication and reinforcement (Invariant 2).
 * - Contradiction detection and temporal supersession (Invariant 3).
 * - Strict tenant isolation (Invariant 6).
 * - System inference non-sovereignty (Invariant 9).
 */
export class MemoryFormationPipeline {
  private static instance: MemoryFormationPipeline;
  private verificationEngine: EpistemicVerificationEngine;
  private contradictionResolver: ContradictionResolver;
  private repository: MemoryRepository;
  private embeddingProvider: IEmbeddingProvider;
  private semanticExtractor?: IMemorySemanticExtractor;

  // Snapshot cache for deterministic replay
  private pinnedSnapshots: Map<string, MemoryRetrievalSnapshot> = new Map();

  constructor(
    repository?: MemoryRepository,
    embeddingProvider?: IEmbeddingProvider,
    verificationEngine?: EpistemicVerificationEngine,
    contradictionResolver?: ContradictionResolver,
    semanticExtractor?: IMemorySemanticExtractor
  ) {
    this.repository = repository || MemoryRepository.getInstance();
    this.embeddingProvider =
      embeddingProvider || EmbeddingProviderRegistry.getInstance().getProvider();
    this.verificationEngine = verificationEngine || EpistemicVerificationEngine.getInstance();
    this.contradictionResolver = contradictionResolver || ContradictionResolver.getInstance();
    this.semanticExtractor = semanticExtractor;
  }

  static getInstance(): MemoryFormationPipeline {
    if (!MemoryFormationPipeline.instance) {
      MemoryFormationPipeline.instance = new MemoryFormationPipeline();
    }
    return MemoryFormationPipeline.instance;
  }

  setSemanticExtractor(extractor?: IMemorySemanticExtractor): void {
    this.semanticExtractor = extractor;
  }

  private evictUserWorldCache(userId: string): void {
    try {
      const { WorldModelBridge } = require("../worldv2/WorldModelBridge");
      WorldModelBridge.getInstance().evictUserCache(userId);
    } catch {
      // Non-blocking if WorldModelBridge is not initialized
    }
  }

  /**
   * Processes a complete conversation turn, extracting candidates semantically
   * and forming/reinforcing/superseding memories.
   */
  async processConversationTurn(turn: ConversationTurnInput): Promise<MemoryFormationResult> {
    const result: MemoryFormationResult = {
      candidateCount: 0,
      storedCount: 0,
      reinforcedCount: 0,
      supersededCount: 0,
      rejectedCount: 0,
      auditTrail: [],
    };

    // Structured SemanticTurn metadata gating (zero regexes / keyword lists)
    if (
      !turn.explicitMemory &&
      turn.semanticTurnMeta?.primaryClassification === "CASUAL_DIALOGUE" &&
      (turn.semanticTurnMeta.operationsCount ?? 0) === 0
    ) {
      return result;
    }

    const candidates = await this.extractCandidates(turn);
    result.candidateCount = candidates.length;
    if (candidates.length === 0) {
      return result;
    }

    const observedAt = Date.now();
    let mutatedAny = false;

    for (const candidate of candidates) {
      candidate.provenance = {
        ...(candidate.provenance || {}),
        conversationId: turn.conversationId,
        ...(turn.turnId ? { turnId: turn.turnId } : {}),
        ...(turn.requestId ? { requestId: turn.requestId } : {}),
        observedAt,
      };

      // 1. Epistemic Verification
      const assessment = this.verificationEngine.verifyCandidate(candidate);

      if (!assessment.shouldStore) {
        result.rejectedCount++;
        result.auditTrail.push({
          candidate,
          assessment,
        });
        continue;
      }

      // 2. Generate Embedding non-blockingly (degrades cleanly to lexical matching if unavailable)
      let embedding: number[] | undefined = undefined;
      if (process.env.LIFEOS_DISABLE_EMBEDDINGS !== "true") {
        try {
          embedding = await this.embeddingProvider.generateEmbedding(candidate.content);
        } catch (embedErr: any) {
          console.warn("[MEMORY_PIPELINE] Embedding generation degraded to lexical search:", embedErr?.message || embedErr);
          embedding = undefined;
        }
      }

      // 3. Query existing related memories (vector + lexical hybrid fallback) for contradiction/duplicate check
      const nearest = embedding
        ? await this.repository.findVectorNearest(candidate.userId, embedding, 8, 0.20)
        : (
          await this.repository.search({
            userId: candidate.userId,
            queryText: candidate.content,
            limit: 8,
          })
        ).map((r) => ({ memory: r.memory, similarityScore: r.similarityScore }));

      // Evaluate semantic contradiction verdicts before resolver runs
      const verdictMap = new Map<string, ContradictionDecision>();
      if (this.semanticExtractor?.classifyContradiction) {
        for (const n of nearest) {
          const verdict = await this.semanticExtractor.classifyContradiction(candidate, n.memory);
          verdictMap.set(n.memory.id, verdict);
        }
      }

      const resolver = new ContradictionResolver();
      if (verdictMap.size > 0) {
        resolver.setClassifier((_cand, existing) => verdictMap.get(existing.id) ?? "UNRELATED");
      }

      // 4. Resolve Contradictions, Disputes & Duplicates
      const resolution = resolver.resolve(
        candidate,
        nearest.map((n: { memory: PersonalMemoryRecord; similarityScore: number }) => ({
          memory: n.memory,
          score: n.similarityScore,
        }))
      );

      const contentHash = sha256Content(candidate.content);

      switch (resolution.action) {
        case "REINFORCED": {
          if (resolution.targetMemoryId) {
            await this.repository.reinforceMemory(
              candidate.userId,
              resolution.targetMemoryId,
              resolution.updatedConfidence
            );
            mutatedAny = true;
            result.reinforcedCount++;
            result.auditTrail.push({
              candidate,
              assessment,
              resolution,
              storedId: resolution.targetMemoryId,
            });
          }
          break;
        }

        case "SUPERSEDED": {
          const created = await this.repository.createMemory({
            userId: candidate.userId,
            content: candidate.content,
            summary: candidate.summary,
            memoryType: candidate.memoryType,
            domain: candidate.domain,
            source: candidate.source,
            confidence: candidate.confidence ?? assessment.confidence,
            importance: candidate.importance ?? assessment.importance,
            relatedEntityIds: candidate.relatedEntityIds,
            provenance: candidate.provenance,
            embedding,
            embeddingModel: this.embeddingProvider.modelName,
            embeddingVersion: this.embeddingProvider.modelVersion,
            validFrom: candidate.validFrom,
            validTo: candidate.validTo,
            sourceJobId: turn.sourceJobId,
            contentHash,
            slotKey: candidate.slotKey,
          });
          if (resolution.supersededMemoryIds) {
            for (const supId of resolution.supersededMemoryIds) {
              await this.repository.supersedeMemory(candidate.userId, supId, created.id, observedAt);
            }
          }
          mutatedAny = true;
          result.supersededCount++;
          result.storedCount++;
          result.auditTrail.push({
            candidate,
            assessment,
            resolution,
            storedId: created.id,
          });
          break;
        }

        case "DISPUTED": {
          const conflictIds = resolution.disputedMemoryIds || [];
          const created = await this.repository.createMemory({
            userId: candidate.userId,
            content: candidate.content,
            summary: candidate.summary,
            memoryType: candidate.memoryType,
            domain: candidate.domain,
            source: candidate.source,
            confidence: candidate.confidence ?? assessment.confidence,
            importance: candidate.importance ?? assessment.importance,
            relatedEntityIds: candidate.relatedEntityIds,
            provenance: candidate.provenance,
            embedding,
            embeddingModel: this.embeddingProvider.modelName,
            embeddingVersion: this.embeddingProvider.modelVersion,
            validFrom: candidate.validFrom,
            validTo: candidate.validTo,
            lifecycleStatus: "disputed",
            sourceJobId: turn.sourceJobId,
            contentHash,
            slotKey: candidate.slotKey,
            disputedWithMemoryIds: conflictIds,
          });
          for (const cid of conflictIds) {
            await this.repository.markDisputed(candidate.userId, cid, [created.id]);
          }
          mutatedAny = true;
          result.storedCount++;
          result.auditTrail.push({
            candidate,
            assessment,
            resolution,
            storedId: created.id,
          });
          break;
        }

        case "REJECTED_CONTRADICTION": {
          result.rejectedCount++;
          result.auditTrail.push({
            candidate,
            assessment,
            resolution,
          });
          break;
        }

        case "NEW":
        default: {
          const created = await this.repository.createMemory({
            userId: candidate.userId,
            content: candidate.content,
            summary: candidate.summary,
            memoryType: candidate.memoryType,
            domain: candidate.domain,
            source: candidate.source,
            confidence: candidate.confidence ?? assessment.confidence,
            importance: candidate.importance ?? assessment.importance,
            relatedEntityIds: candidate.relatedEntityIds,
            provenance: candidate.provenance,
            embedding,
            embeddingModel: this.embeddingProvider.modelName,
            embeddingVersion: this.embeddingProvider.modelVersion,
            validFrom: candidate.validFrom,
            validTo: candidate.validTo,
            sourceJobId: turn.sourceJobId,
            contentHash,
            slotKey: candidate.slotKey,
          });
          mutatedAny = true;
          result.storedCount++;
          result.auditTrail.push({
            candidate,
            assessment,
            resolution,
            storedId: created.id,
          });
          break;
        }
      }
    }

    if (mutatedAny) {
      this.evictUserWorldCache(turn.userId);
    }

    return result;
  }

  /**
   * Extracts structured personal memory candidates semantically via configured LLM extractor
   * or explicit structured API input. Zero English regexes.
   */
  private async extractCandidates(turn: ConversationTurnInput): Promise<CandidateMemory[]> {
    if (turn.explicitMemory && turn.explicitMemory.content.trim().length > 0) {
      const em = turn.explicitMemory;
      const content = em.content.trim();
      return [
        {
          userId: turn.userId,
          content,
          summary: em.summary?.trim() || (content.length > 80 ? `${content.slice(0, 77)}...` : content),
          source: "explicit_user_statement",
          domain: em.domain || turn.domainHint || "general",
          memoryType: em.memoryType || "semantic_fact",
          provenance: { conversationId: turn.conversationId },
        },
      ];
    }

    if (this.semanticExtractor) {
      return await this.semanticExtractor.extract(turn);
    }

    const hasGroqKey =
      Boolean(process.env.GROQ_API_KEY) && process.env.GROQ_API_KEY !== "mock_key_for_dev";
    if (!hasGroqKey) {
      // Offline / no-key unit mode without an injected extractor: return no fabricated memories
      return [];
    }

    const prompt = `Extract durable, non-transient personal memory facts, preferences, constraints, corrections, or goals from this conversation turn.
Works in ANY language. If the turn is a trivial acknowledgment, greeting, or contains no lasting user-specific facts, return {"candidates": []}.
For multiple facts in one turn, return separate candidate items with distinct semantic slotKey values (snake_case, e.g. "dietary_restriction", "workout_schedule", "allergy_shellfish").

User Message: ${JSON.stringify(turn.userMessage)}
Assistant Response: ${JSON.stringify(turn.assistantResponse || "")}
Domain Hint: ${JSON.stringify(turn.domainHint || "none")}

Return STRICT JSON ONLY:
{
  "candidates": [
    {
      "content": "Concise canonical statement of the enduring user fact/preference/constraint",
      "summary": "Short label (3-12 words)",
      "memoryType": "semantic_fact" | "episodic_event" | "behavioral_pattern" | "goal_intelligence" | "incident" | "intervention",
      "domain": "productivity" | "health" | "wellness" | "identity" | "general",
      "source": "explicit_user_statement" | "user_reflection" | "behavioral_telemetry" | "system_inference",
      "confidence": 0.0-1.0,
      "importance": 0.0-1.0,
      "slotKey": "stable_semantic_slot_key",
      "isTransient": false
    }
  ]
}`;

    const raw = await (await import("../shared/langchain/LifeOSChatModel")).invokeLifeOSChat({
      messages: [{ role: "user", content: prompt }],
      model: resolveGroqModel(),
      temperature: 0.1,
      maxTokens: 900,
    });

    const cleaned = cleanLLMResponse(raw);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`[MEMORY_EXTRACTION_PARSE_ERROR]: Extractor response did not contain JSON`);
    }

    const parsed = ExtractedMemoryBatchSchema.parse(JSON.parse(jsonMatch[0]));
    return parsed.candidates.map((c) => ({
      userId: turn.userId,
      content: c.content.trim(),
      summary: c.summary.trim(),
      memoryType: c.memoryType,
      domain: turn.domainHint || c.domain,
      source: c.source,
      confidence: c.confidence,
      importance: c.importance,
      slotKey: c.slotKey,
      validFrom: c.validFrom ? Date.parse(c.validFrom) || undefined : undefined,
      validTo: c.validTo ? Date.parse(c.validTo) || null : null,
      isTransient: c.isTransient ?? false,
      provenance: { conversationId: turn.conversationId },
    }));
  }

  /**
   * Pins a retrieval snapshot for deterministic execution and replay (Invariant 11).
   */
  pinRetrievalSnapshot(
    snapshotId: string,
    userId: string,
    query: string,
    memories: Array<{
      memory: PersonalMemoryRecord;
      finalScore: number;
      similarityScore?: number;
      recencyScore?: number;
    }>,
    options: {
      policyVersion?: string;
      projectionVersion?: string;
      filterConfig?: MemoryRetrievalSnapshot["filterConfig"];
    } = {}
  ): MemoryRetrievalSnapshot {
    const snapshot: MemoryRetrievalSnapshot = {
      snapshotId,
      userId,
      query,
      retrievedMemoryIds: memories.map((m) => m.memory.id),
      retrievedMemories: memories.map((m, idx) => ({
        id: m.memory.id,
        memoryVersion: (m.memory as any).version || 1,
        content: m.memory.content,
        summary: m.memory.summary,
        domain: m.memory.domain,
        similarityScore: m.similarityScore ?? 0.8,
        recencyScore: m.recencyScore ?? 0.8,
        finalScore: m.finalScore,
        score: m.finalScore,
        ranking: idx + 1,
        embeddingModel: m.memory.embeddingModel || "deterministic-mock-v1",
        embeddingVersion: m.memory.embeddingVersion || 1,
      })),
      timestamp: Date.now(),
      policyVersion: options.policyVersion || "v1.0",
      projectionVersion: options.projectionVersion || "v2.0",
      filterConfig: options.filterConfig,
    };
    this.pinnedSnapshots.set(snapshotId, snapshot);
    return snapshot;
  }

  /**
   * Retrieves a pinned snapshot for replay.
   */
  getPinnedSnapshot(snapshotId: string): MemoryRetrievalSnapshot | undefined {
    return this.pinnedSnapshots.get(snapshotId);
  }
}
