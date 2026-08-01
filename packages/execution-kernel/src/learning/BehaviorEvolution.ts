import { BehaviorPattern } from "./BehaviorPattern";
import { BehaviorPatternLibrary } from "./BehaviorPatternLibrary";
import { ConfidenceEngine } from "./ConfidenceEngine";
import { LearningHistory } from "./LearningHistory";
import { generateId } from "../shared/ids";

/**
 * BehaviorEvolution Subsystem
 * 
 * SOLE OWNER of pattern confidence evolution over time.
 * Updates confidence tiers and scores incrementally while recording immutable audit trails.
 */
export class BehaviorEvolution {
  private static instance: BehaviorEvolution;

  static getInstance(): BehaviorEvolution {
    if (!BehaviorEvolution.instance) {
      BehaviorEvolution.instance = new BehaviorEvolution();
    }
    return BehaviorEvolution.instance;
  }

  recordObservation(params: {
    pattern: BehaviorPattern;
    observation: string;
    isPositive: boolean;
    timestamp?: number;
  }): BehaviorPattern {
    const { pattern, observation, isPositive, timestamp = Date.now() } = params;

    const library = BehaviorPatternLibrary.getInstance();
    const confidenceEngine = ConfidenceEngine.getInstance();
    const history = LearningHistory.getInstance();

    const previousConfidence = pattern.confidence;
    const newEvidenceCount = pattern.evidenceCount + (isPositive ? 1 : 0);

    // Calculate positive observation consistency ratio
    const positiveRatio = isPositive ? 1.0 : Math.max(0.2, (pattern.evidenceCount / (pattern.evidenceCount + 1)));

    const assessment = confidenceEngine.evaluate(newEvidenceCount, positiveRatio);

    const updatedPattern: BehaviorPattern = {
      ...pattern,
      confidence: assessment.tier,
      confidenceScore: assessment.score,
      evidenceCount: newEvidenceCount,
      lastObserved: timestamp,
      evidenceDetails: [...pattern.evidenceDetails, `[${new Date(timestamp).toISOString().split("T")[0]}] ${observation}`].slice(-20),
    };

    library.savePattern(updatedPattern);

    history.addRecord({
      learningId: generateId("lrn"),
      timestamp,
      observation,
      previousConfidence,
      newConfidence: assessment.tier,
      evidenceCount: newEvidenceCount,
      affectedPatternId: pattern.patternId,
    });

    console.log(
      `📈 [BEHAVIOR_EVOLUTION] Pattern "${pattern.title}" evolved: ${previousConfidence} -> ${assessment.tier} (Score: ${assessment.score})`
    );

    return updatedPattern;
  }
}
