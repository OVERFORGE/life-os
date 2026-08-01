export interface MemoryScoreFactors {
  importance: number;
  recency: number;
  frequency: number;
  emotionalWeight: number;
  executionRelevance: number;
  goalRelevance: number;
  historicalReinforcement: number;
}

export interface MemoryScore {
  totalScore: number; // 0.0 to 1.0
  factors: MemoryScoreFactors;
  explanation: string;
}

export interface ScorableMemoryItem {
  id: string;
  content: string;
  category?: string;
  timestamp: number;
  accessCount?: number;
  tags?: string[];
}

/**
 * MemoryScoringEngine Subsystem
 * 
 * SOLE OWNER of deterministic memory scoring.
 * Scores every memory record explicitly using explainable factor weights.
 */
export class MemoryScoringEngine {
  private static instance: MemoryScoringEngine;

  static getInstance(): MemoryScoringEngine {
    if (!MemoryScoringEngine.instance) {
      MemoryScoringEngine.instance = new MemoryScoringEngine();
    }
    return MemoryScoringEngine.instance;
  }

  scoreMemory(item: ScorableMemoryItem, contextQuery?: string): MemoryScore {
    const now = Date.now();
    const ageHours = (now - item.timestamp) / (1000 * 60 * 60);

    // 1. Recency Score (Half-life decay: 48 hours)
    const recency = Math.max(0.05, Math.exp(-ageHours / 48));

    // 2. Frequency Score
    const accessCount = item.accessCount || 1;
    const frequency = Math.min(1.0, Math.log2(accessCount + 1) / 5);

    // 3. Importance Score (Derived from category or tags)
    let importance = 0.5;
    if (item.category === "core_values" || item.category === "goals") importance = 0.9;
    else if (item.category === "preferences") importance = 0.7;

    // 4. Emotional Weight
    const emotionalWeight = 0.5;

    // 5. Execution Relevance
    let executionRelevance = 0.5;
    if (contextQuery && item.content.toLowerCase().includes(contextQuery.toLowerCase())) {
      executionRelevance = 0.95;
    }

    // 6. Goal Relevance
    const goalRelevance = item.category === "goals" ? 0.9 : 0.4;

    // 7. Historical Reinforcement
    const historicalReinforcement = Math.min(1.0, accessCount * 0.1);

    // Composite Weighted Sum
    const weights = {
      recency: 0.25,
      importance: 0.20,
      executionRelevance: 0.20,
      frequency: 0.15,
      goalRelevance: 0.10,
      historicalReinforcement: 0.10,
    };

    const totalScore = Number(
      (
        recency * weights.recency +
        importance * weights.importance +
        executionRelevance * weights.executionRelevance +
        frequency * weights.frequency +
        goalRelevance * weights.goalRelevance +
        historicalReinforcement * weights.historicalReinforcement
      ).toFixed(3)
    );

    const explanation = `Memory "${item.id}" scored ${totalScore} (Recency: ${recency.toFixed(2)}, Relevance: ${executionRelevance.toFixed(2)}, Importance: ${importance.toFixed(2)})`;

    return {
      totalScore,
      factors: {
        importance,
        recency,
        frequency,
        emotionalWeight,
        executionRelevance,
        goalRelevance,
        historicalReinforcement,
      },
      explanation,
    };
  }
}
