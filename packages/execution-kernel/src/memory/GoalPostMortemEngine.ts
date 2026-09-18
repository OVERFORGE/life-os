import {
  PersonalMemoryRecord,
  MemoryDomain,
  MemoryType,
  EpistemicSource,
} from "./PersonalMemoryContracts";
import { MemoryRepository } from "./MemoryRepository";
import { EmbeddingProviderRegistry, IEmbeddingProvider } from "./EmbeddingProvider";
import { MemoryFormationPipeline } from "./MemoryFormationPipeline";

export interface GoalFailureDetails {
  userId: string;
  goalId: string;
  goalTitle: string;
  progressPercent: number;
  reason: string;
  frictionFactors: string[];
  daysActive?: number;
  workloadTensionScore?: number;
}

export interface GoalPostMortemRecord {
  memoryId: string;
  goalId: string;
  summary: string;
  derivedLesson: string;
  timestamp: number;
}

/**
 * GoalPostMortemEngine
 * 
 * Automatically captures and analyzes stalled or failed goals to create
 * persistent behavioral memory records.
 * Ensures future Goal Intelligence evaluations factor in historical failure modes
 * and friction patterns without requiring tedious user questionnaires.
 */
export class GoalPostMortemEngine {
  private static instance: GoalPostMortemEngine;
  private repository: MemoryRepository;
  private embeddingProvider: IEmbeddingProvider;

  constructor(repository?: MemoryRepository, embeddingProvider?: IEmbeddingProvider) {
    this.repository = repository || MemoryRepository.getInstance();
    this.embeddingProvider =
      embeddingProvider || EmbeddingProviderRegistry.getInstance().getProvider();
  }

  static getInstance(): GoalPostMortemEngine {
    if (!GoalPostMortemEngine.instance) {
      GoalPostMortemEngine.instance = new GoalPostMortemEngine();
    }
    return GoalPostMortemEngine.instance;
  }

  /**
   * Generates and persists a behavioral post-mortem memory from a stalled/failed goal.
   */
  async recordGoalPostMortem(details: GoalFailureDetails): Promise<GoalPostMortemRecord> {
    const lesson = `Goal "${details.goalTitle}" stalled at ${details.progressPercent}% progress due to ${details.reason}. Key friction factors: ${details.frictionFactors.join(", ") || "capacity mismatch"}.`;
    const summary = `Goal Post-Mortem: ${details.goalTitle} stalled (${details.reason})`;

    const embedding = await this.embeddingProvider.generateEmbedding(lesson);

    const memory = await this.repository.createMemory({
      userId: details.userId,
      content: lesson,
      summary,
      domain: "productivity",
      memoryType: "goal_intelligence",
      source: "behavioral_telemetry",
      confidence: 0.85,
      importance: 0.70,
      relatedEntityIds: [details.goalId],
      provenance: {
        sourceActionId: details.goalId,
        sourceContext: "goal_post_mortem",
        dailyLogDate: new Date().toISOString().split("T")[0],
      },
      embedding,
      embeddingModel: this.embeddingProvider.modelName,
      embeddingVersion: this.embeddingProvider.modelVersion,
    });

    return {
      memoryId: memory.id,
      goalId: details.goalId,
      summary,
      derivedLesson: lesson,
      timestamp: memory.firstObservedAt,
    };
  }

  /**
   * Retrieves relevant historical post-mortems for a candidate or active goal
   * to inform Dynamic Goal Intelligence tension and risk factors.
   */
  async getHistoricalFriction(
    userId: string,
    goalTitle: string,
    limit: number = 3
  ): Promise<PersonalMemoryRecord[]> {
    const results = await this.repository.search({
      userId,
      queryText: goalTitle,
      domain: "productivity",
      limit,
    });

    return results
      .filter(
        (r) =>
          r.memory.memoryType === "goal_intelligence" ||
          r.memory.memoryType === "behavioral_pattern"
      )
      .map((r) => r.memory);
  }
}
