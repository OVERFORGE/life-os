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
} from "./ContradictionResolver";
import { MemoryRepository } from "./MemoryRepository";
import { EmbeddingProviderRegistry, IEmbeddingProvider } from "./EmbeddingProvider";
import { generateId } from "../shared/ids";

export interface ConversationTurnInput {
  userId: string;
  userMessage: string;
  assistantResponse?: string;
  conversationId?: string;
  domainHint?: MemoryDomain;
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

  // Snapshot cache for deterministic replay
  private pinnedSnapshots: Map<string, MemoryRetrievalSnapshot> = new Map();

  constructor(
    repository?: MemoryRepository,
    embeddingProvider?: IEmbeddingProvider,
    verificationEngine?: EpistemicVerificationEngine,
    contradictionResolver?: ContradictionResolver
  ) {
    this.repository = repository || MemoryRepository.getInstance();
    this.embeddingProvider =
      embeddingProvider || EmbeddingProviderRegistry.getInstance().getProvider();
    this.verificationEngine = verificationEngine || EpistemicVerificationEngine.getInstance();
    this.contradictionResolver = contradictionResolver || ContradictionResolver.getInstance();
  }

  static getInstance(): MemoryFormationPipeline {
    if (!MemoryFormationPipeline.instance) {
      MemoryFormationPipeline.instance = new MemoryFormationPipeline();
    }
    return MemoryFormationPipeline.instance;
  }

  /**
   * Processes a complete conversation turn, extracting candidates and forming memories.
   */
  async processConversationTurn(turn: ConversationTurnInput): Promise<MemoryFormationResult> {
    const candidates = this.extractCandidates(turn);
    const result: MemoryFormationResult = {
      candidateCount: candidates.length,
      storedCount: 0,
      reinforcedCount: 0,
      supersededCount: 0,
      rejectedCount: 0,
      auditTrail: [],
    };

    for (const candidate of candidates) {
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

      // 2. Generate Embedding
      const embedding = await this.embeddingProvider.generateEmbedding(candidate.content);

      // 3. Query existing related memories for contradiction/duplicate check
      const nearest = await this.repository.findVectorNearest(
        candidate.userId,
        embedding,
        5,
        0.20
      );

      // 4. Resolve Contradictions & Duplicates
      const resolution = this.contradictionResolver.resolve(
        candidate,
        nearest.map((n: { memory: PersonalMemoryRecord; similarityScore: number }) => ({
          memory: n.memory,
          score: n.similarityScore,
        }))
      );

      switch (resolution.action) {
        case "REINFORCED": {
          if (resolution.targetMemoryId) {
            await this.repository.reinforceMemory(
              candidate.userId,
              resolution.targetMemoryId,
              resolution.updatedConfidence
            );
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
          // Invalidate superseded memories by archiving and setting validTo
          if (resolution.supersededMemoryIds) {
            for (const supId of resolution.supersededMemoryIds) {
              await this.repository.archiveMemory(candidate.userId, supId);
            }
          }
          // Store new memory
          const created = await this.repository.createMemory({
            userId: candidate.userId,
            content: candidate.content,
            summary: candidate.summary,
            memoryType: candidate.memoryType,
            domain: candidate.domain,
            source: candidate.source,
            confidence: assessment.confidence,
            importance: assessment.importance,
            relatedEntityIds: candidate.relatedEntityIds,
            provenance: candidate.provenance,
            embedding,
            embeddingModel: this.embeddingProvider.modelName,
            embeddingVersion: this.embeddingProvider.modelVersion,
          });
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
            confidence: assessment.confidence,
            importance: assessment.importance,
            relatedEntityIds: candidate.relatedEntityIds,
            provenance: candidate.provenance,
            embedding,
            embeddingModel: this.embeddingProvider.modelName,
            embeddingVersion: this.embeddingProvider.modelVersion,
          });
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

    return result;
  }

  /**
   * Deterministically extracts candidate statements from user input.
   */
  private extractCandidates(turn: ConversationTurnInput): CandidateMemory[] {
    const candidates: CandidateMemory[] = [];
    const text = turn.userMessage.trim();

    // Pattern 1: Explicit preference or habit
    const preferenceRegex = /\b(i prefer|i like|i dislike|i love|i always|i never|i usually|i work (best|better) at|routine|schedule)\b\s*([^\.\!\?]+)/i;
    const prefMatch = text.match(preferenceRegex);
    if (prefMatch) {
      const statement = prefMatch[0].trim();
      const domain = this.inferDomain(statement, turn.domainHint);
      candidates.push({
        userId: turn.userId,
        content: statement,
        summary: `User preference: ${statement}`,
        source: "explicit_user_statement",
        domain,
        memoryType: "semantic_fact",
        provenance: { conversationId: turn.conversationId },
      });
    }

    // Pattern 2: Explicit physical / health / medical condition
    const healthRegex = /\b(diagnosed with|allergic to|allergy to|injury|injured|asthma|diabetes|illness|sick)\b\s*([^\.\!\?]+)/i;
    const healthMatch = text.match(healthRegex);
    if (healthMatch) {
      const statement = healthMatch[0].trim();
      candidates.push({
        userId: turn.userId,
        content: statement,
        summary: `Health condition: ${statement}`,
        source: "explicit_user_statement",
        domain: "health",
        memoryType: "semantic_fact",
        provenance: { conversationId: turn.conversationId },
      });
    }

    // Pattern 3: Explicit Goal or Milestone
    const goalRegex = /\b(my goal is|i want to achieve|training for|preparing for)\b\s*([^\.\!\?]+)/i;
    const goalMatch = text.match(goalRegex);
    if (goalMatch) {
      const statement = goalMatch[0].trim();
      candidates.push({
        userId: turn.userId,
        content: statement,
        summary: `Personal goal: ${statement}`,
        source: "explicit_user_statement",
        domain: "productivity",
        memoryType: "goal_intelligence",
        provenance: { conversationId: turn.conversationId },
      });
    }

    // Fallback: If turn itself looks like an explicit concise fact and not caught by patterns
    if (
      candidates.length === 0 &&
      text.length >= 10 &&
      text.length <= 150 &&
      /\b(i|my|we)\b/i.test(text)
    ) {
      candidates.push({
        userId: turn.userId,
        content: text,
        summary: text.length > 50 ? `${text.slice(0, 47)}...` : text,
        source: "explicit_user_statement",
        domain: this.inferDomain(text, turn.domainHint),
        memoryType: "semantic_fact",
        provenance: { conversationId: turn.conversationId },
      });
    }

    return candidates;
  }

  /**
   * Classifies domain based on keywords.
   */
  private inferDomain(text: string, hint?: MemoryDomain): MemoryDomain {
    if (hint) return hint;
    const lower = text.toLowerCase();
    if (/\b(sleep|stress|meditat|relax|burnout|mental|anxiety|energy)\b/.test(lower)) {
      return "wellness";
    }
    if (/\b(workout|gym|run|heart|diet|nutrition|calorie|protein|injury|sick|health)\b/.test(lower)) {
      return "health";
    }
    if (/\b(task|project|work|deep work|focus|code|deadline|study|meeting)\b/.test(lower)) {
      return "productivity";
    }
    return "general";
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
