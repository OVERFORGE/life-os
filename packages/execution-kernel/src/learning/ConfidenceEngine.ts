import { ConfidenceTier } from "./BehaviorPattern";

export interface ConfidenceAssessment {
  score: number;
  tier: ConfidenceTier;
  explanation: string;
}

/**
 * ConfidenceEngine Subsystem
 * 
 * SOLE OWNER of deterministic confidence calculation.
 * Computes explicit confidence tiers and scores from evidence counts and observation consistency.
 * 
 * DETERMINISTIC THRESHOLDS:
 * - 1-4 evidence counts: Low (0.10 - 0.39)
 * - 5-14 evidence counts: Moderate (0.40 - 0.69)
 * - 15-49 evidence counts: High (0.70 - 0.89)
 * - 50+ evidence counts: Stable (0.90 - 1.00)
 */
export class ConfidenceEngine {
  private static instance: ConfidenceEngine;

  static getInstance(): ConfidenceEngine {
    if (!ConfidenceEngine.instance) {
      ConfidenceEngine.instance = new ConfidenceEngine();
    }
    return ConfidenceEngine.instance;
  }

  evaluate(evidenceCount: number, positiveRatio: number = 1.0): ConfidenceAssessment {
    if (evidenceCount <= 0) {
      return {
        score: 0,
        tier: "Low",
        explanation: "No observations recorded.",
      };
    }

    let baseScore = 0;
    if (evidenceCount < 5) {
      baseScore = 0.1 + (evidenceCount / 5) * 0.29;
    } else if (evidenceCount < 15) {
      baseScore = 0.4 + ((evidenceCount - 5) / 10) * 0.29;
    } else if (evidenceCount < 50) {
      baseScore = 0.7 + ((evidenceCount - 15) / 35) * 0.19;
    } else {
      baseScore = 0.9 + Math.min(0.1, ((evidenceCount - 50) / 100) * 0.1);
    }

    const finalScore = Number(Math.min(1.0, Math.max(0.0, baseScore * positiveRatio)).toFixed(3));

    let tier: ConfidenceTier = "Low";
    if (finalScore >= 0.9) tier = "Stable";
    else if (finalScore >= 0.7) tier = "High";
    else if (finalScore >= 0.4) tier = "Moderate";

    return {
      score: finalScore,
      tier,
      explanation: `Evaluated ${evidenceCount} evidence observation(s) with ${Math.round(positiveRatio * 100)}% consistency -> Score: ${finalScore} (${tier})`,
    };
  }
}
