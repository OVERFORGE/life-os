import { MemoryScoringEngine, ScorableMemoryItem, MemoryScore } from "./MemoryScoringEngine";
import { LearningSignal } from "./LearningSignal";

export interface RankedAdaptiveContextItem<T = any> {
  item: T;
  score: MemoryScore;
  boostReason?: string;
}

/**
 * AdaptiveContextEngine Subsystem
 * 
 * SOLE OWNER of choosing which memories, routines, and patterns receive prompt budget.
 * Consumes MemoryScoringEngine scores and active LearningSignals.
 */
export class AdaptiveContextEngine {
  private static instance: AdaptiveContextEngine;

  static getInstance(): AdaptiveContextEngine {
    if (!AdaptiveContextEngine.instance) {
      AdaptiveContextEngine.instance = new AdaptiveContextEngine();
    }
    return AdaptiveContextEngine.instance;
  }

  selectAdaptiveMemories(
    memories: ScorableMemoryItem[],
    signals: LearningSignal[],
    query?: string,
    topK: number = 5
  ): RankedAdaptiveContextItem<ScorableMemoryItem>[] {
    const scorer = MemoryScoringEngine.getInstance();

    const ranked = memories.map((item) => {
      const baseScore = scorer.scoreMemory(item, query);

      // Boost score if learning signals match memory content
      let boostReason = "";
      let boostedScore = baseScore.totalScore;

      for (const sig of signals) {
        if (
          sig.confidenceScore >= 0.7 &&
          item.content.toLowerCase().includes(sig.type.toLowerCase())
        ) {
          boostedScore = Math.min(1.0, boostedScore + 0.2);
          boostReason = `Boosted by high-confidence signal: [${sig.type}] "${sig.title}"`;
        }
      }

      return {
        item,
        score: {
          ...baseScore,
          totalScore: boostedScore,
        },
        boostReason,
      };
    });

    return ranked
      .sort((a, b) => b.score.totalScore - a.score.totalScore)
      .slice(0, topK);
  }
}
