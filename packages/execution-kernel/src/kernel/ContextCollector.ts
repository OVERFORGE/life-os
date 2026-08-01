import { WorldSnapshot } from "../world/WorldSnapshot";
import { MemoryRecord } from "../brain/memory/Memory";
import { Entity } from "../brain/knowledge/Entity";
import { IConversationShortTermMemory } from "@/server/db/models/ConversationShortTermMemory";
import { HistoricalSearchResult } from "./HistoricalRetrievalEngine";
import { ExecutionGraphSnapshot } from "./ExecutionGraph";
import { RepairPlan, RepairDiagnostics } from "./AdaptiveRepairEngine";
import { LearningSignal } from "../learning/LearningSignal";
import { UserBehavioralProfile } from "../learning/BehaviorProfile";
import { WorldSnapshotV2 } from "../worldv2/WorldSnapshotV2";

// ──────────────────────────────────────────────
// Configurable Top-K limits
// ──────────────────────────────────────────────
export const CONTEXT_LIMITS = {
  RECENT_MESSAGE_LIMIT: 20,
  WORLD_TOP_K: 10,
  MEMORY_TOP_K: 8,
  KNOWLEDGE_TOP_K: 5,
  HISTORICAL_TOP_K: 15,
} as const;

// ──────────────────────────────────────────────
// Structured context types (raw, un-formatted)
// ──────────────────────────────────────────────
export interface RankedEntity {
  id: string;
  type: string;
  name: string;
  attributes: Record<string, any>;
  score: number;
}

export interface RankedMemory {
  id: string;
  content: string;
  category: string;
  weight: number;
  createdAt: number;
  score: number;
}

export interface RankedKnowledge {
  id: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: number;
  score: number;
}

export interface RecentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CollectedContext {
  conversationSummary: string;
  recentMessages: RecentMessage[];
  shortTermMemory: IConversationShortTermMemory | null;
  worldEntities: RankedEntity[];
  worldState: WorldSnapshot["userState"];
  predictions: WorldSnapshot["predictions"];
  insights: WorldSnapshot["insights"];
  suggestions: WorldSnapshot["suggestions"];
  longTermMemory: RankedMemory[];
  knowledge: RankedKnowledge[];
  historicalContext: HistoricalSearchResult | null;
  executionGraphSnapshot: ExecutionGraphSnapshot | null;
  repairPlan: RepairPlan | null;
  repairDiagnostics: RepairDiagnostics | null;
  stabilityScore: number | null;
  learningSignals: LearningSignal[];
  behavioralProfile: UserBehavioralProfile | null;
  worldSnapshotV2: WorldSnapshotV2 | null; // Phase 11 World Model V2 Canonical Reality
  toolResults: any[];
}

export interface ContextCollectionParams {
  conversationSummary: string;
  recentMessages: RecentMessage[];
  stm: IConversationShortTermMemory | null;
  snapshot: WorldSnapshot;
  toolResults: any[];
  historicalContext?: HistoricalSearchResult | null;
  executionGraphSnapshot?: ExecutionGraphSnapshot | null;
  repairPlan?: RepairPlan | null;
  repairDiagnostics?: RepairDiagnostics | null;
  stabilityScore?: number | null;
  learningSignals?: LearningSignal[];
  behavioralProfile?: UserBehavioralProfile | null;
  worldSnapshotV2?: WorldSnapshotV2 | null;
  moduleContext?: string;
}

/**
 * ContextCollector
 *
 * Collects and ranks raw context from all system sources including WorldModelV2 outputs.
 */
export class ContextCollector {
  private static instance: ContextCollector;

  static getInstance(): ContextCollector {
    if (!ContextCollector.instance) {
      ContextCollector.instance = new ContextCollector();
    }
    return ContextCollector.instance;
  }

  collect(params: ContextCollectionParams): CollectedContext {
    const {
      conversationSummary,
      recentMessages,
      stm,
      snapshot,
      toolResults,
      historicalContext,
      executionGraphSnapshot,
      repairPlan,
      repairDiagnostics,
      stabilityScore,
      learningSignals = [],
      behavioralProfile = null,
      worldSnapshotV2 = null,
      moduleContext,
    } = params;

    // 1. Recent Messages — bounded by RECENT_MESSAGE_LIMIT
    const boundedMessages = recentMessages.slice(-CONTEXT_LIMITS.RECENT_MESSAGE_LIMIT);

    // 2. World Entities — Top-K
    const rankedEntities = this.rankEntities(snapshot.activeEntities);

    // 3. Long-Term Memory — Top-K
    const rankedMemory = this.rankMemory(snapshot.recentMemories);

    // 4. Knowledge — Top-K
    const rankedKnowledge = this.rankKnowledge(snapshot.activeContext, moduleContext);

    return {
      conversationSummary,
      recentMessages: boundedMessages,
      shortTermMemory: stm,
      worldEntities: rankedEntities,
      worldState: snapshot.userState,
      predictions: snapshot.predictions,
      insights: snapshot.insights,
      suggestions: snapshot.suggestions,
      longTermMemory: rankedMemory,
      knowledge: rankedKnowledge,
      historicalContext: historicalContext || null,
      executionGraphSnapshot: executionGraphSnapshot || null,
      repairPlan: repairPlan || null,
      repairDiagnostics: repairDiagnostics || null,
      stabilityScore: typeof stabilityScore === "number" ? stabilityScore : null,
      learningSignals,
      behavioralProfile,
      worldSnapshotV2,
      toolResults: toolResults || [],
    };
  }

  private rankEntities(entities: Entity[]): RankedEntity[] {
    return [...entities]
      .map((e) => {
        const score = e.updatedAt || e.createdAt || 0;
        const name: string =
          (e.attributes?.name as string) ||
          (e.attributes?.title as string) ||
          e.id;
        return {
          id: e.id,
          type: e.type,
          name,
          attributes: e.attributes,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, CONTEXT_LIMITS.WORLD_TOP_K);
  }

  private rankMemory(memories: MemoryRecord[]): RankedMemory[] {
    if (!memories.length) return [];

    const now = Date.now();
    const oldest = Math.min(...memories.map((m) => m.timestamp));
    const range = now - oldest || 1;

    return [...memories]
      .map((m) => {
        const recencyScore = (m.timestamp - oldest) / range;
        const content = typeof m.value === "string" ? m.value : JSON.stringify(m.value);
        return {
          id: m.id,
          content: `[${m.key}] ${content}`,
          category: m.category,
          weight: 0.5,
          createdAt: m.timestamp,
          score: recencyScore,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, CONTEXT_LIMITS.MEMORY_TOP_K);
  }

  private rankKnowledge(
    activeContext: Record<string, any>,
    moduleContext?: string
  ): RankedKnowledge[] {
    if (!activeContext || !Object.keys(activeContext).length) return [];

    const entries = Object.entries(activeContext)
      .map(([key, value], idx) => {
        const content =
          typeof value === "string" ? value : JSON.stringify(value);
        const topicMatch =
          moduleContext && key.toLowerCase().includes(moduleContext.toLowerCase())
            ? 1
            : 0;
        const score = topicMatch + 1 / (idx + 1);
        return {
          id: `ctx-${key}`,
          title: key,
          content,
          tags: moduleContext ? [moduleContext] : [],
          updatedAt: Date.now(),
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, CONTEXT_LIMITS.KNOWLEDGE_TOP_K);

    return entries;
  }
}
