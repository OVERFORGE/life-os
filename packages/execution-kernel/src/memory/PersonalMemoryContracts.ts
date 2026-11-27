/**
 * Personal Memory Contracts
 * 
 * Defines canonical data structures, epistemic classification,
 * lifecycle policies, and vector metadata for LifeOS long-term memory.
 */

export type MemoryType =
  | "semantic_fact"
  | "episodic_event"
  | "behavioral_pattern"
  | "goal_intelligence"
  | "incident"
  | "intervention";

export type MemoryDomain =
  | "productivity"
  | "health"
  | "wellness"
  | "identity"
  | "general";

export type EpistemicSource =
  | "explicit_user_statement"
  | "behavioral_telemetry"
  | "system_inference"
  | "user_reflection";

export type MemoryEmbeddingStatus =
  | "READY"
  | "PENDING_EMBEDDING"
  | "LEXICAL_ONLY"
  | "FAILED";
export type MemoryLifecycleStatus =
  | "provisional"
  | "verified"
  | "reinforced"
  | "stale"
  | "archived"
  | "superseded"
  | "disputed";

export type MemoryRetrievalMode = "hybrid" | "lexical_only" | "empty";

export interface MemoryProvenance {
  conversationId?: string;
  turnId?: string;
  requestId?: string;
  observedAt?: number;
  dailyLogDate?: string;
  observationIds?: string[];
  sourceActionId?: string;
  sourceContext?: string;
}

export interface PersonalMemoryRecord {
  id: string;
  memoryId?: string;
  userId: string;
  memoryType: MemoryType;
  domain: MemoryDomain;
  content: string;
  summary: string;
  
  // Epistemic Trust & Confidence
  source: EpistemicSource;
  confidence: number;       // 0.0 - 1.0
  importance: number;       // 0.0 - 1.0 (Permanence weight)
  evidenceCount: number;    // Number of observations corroborating this
  
  // Temporal Anchors
  firstObservedAt: number;  // Epoch ms
  lastReinforcedAt: number; // Epoch ms
  validFrom?: number;       // Epoch ms
  validTo?: number | null;  // Epoch ms or null for indefinite
  isArchived: boolean;
  
  // Provenance & Relations
  provenance: MemoryProvenance;
  relatedEntityIds: string[];
  
  // Vector Representation
  embedding?: number[];
  embedding384?: number[];
  embeddingStatus?: MemoryEmbeddingStatus;
  embeddingModel: string;
  embeddingVersion: number;
  
  // Lifecycle & Lineage
  lifecycleStatus: MemoryLifecycleStatus;
  sourceJobId?: string;
  contentHash?: string;
  slotKey?: string;
  supersededByMemoryId?: string;
  disputedWithMemoryIds?: string[];
  updatedAt: number;
}

export interface MemoryQuery {
  userId: string;
  queryText?: string;
  queryVector?: number[];
  domain?: MemoryDomain;
  memoryType?: MemoryType;
  minConfidence?: number;
  includeArchived?: boolean;
  includeStale?: boolean;
  includeSuperseded?: boolean;
  limit?: number;
  referenceTime?: number;
}

export interface ScoredMemoryResult {
  memory: PersonalMemoryRecord;
  similarityScore: number;
  lexicalScore?: number;
  vectorScore?: number;
  recencyScore: number;
  finalScore: number;
  retrievalMode?: MemoryRetrievalMode;
  explanation: string;
}

/**
 * Configurable Policy Parameters for Memory Operations
 */
export interface MemoryPolicyConfig {
  minImportanceForStorage: number;
  minConfidenceForAutonomousAction: number;
  duplicateSimilarityThreshold: number;
  temporalDecayHalfLifeDays: number;
  maxRetrievedMemoriesPerSpecialist: number;
  embeddingDimension: number;
}

export const DEFAULT_MEMORY_POLICY: MemoryPolicyConfig = {
  minImportanceForStorage: 0.50,
  minConfidenceForAutonomousAction: 0.70,
  duplicateSimilarityThreshold: 0.88,
  temporalDecayHalfLifeDays: 30.0,
  maxRetrievedMemoriesPerSpecialist: 5,
  embeddingDimension: 384,
};
