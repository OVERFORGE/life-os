import { generateId } from "../shared/ids";

/**
 * Prediction Model
 * 
 * Represents a deterministic assessment of likely near-future conditions.
 */
export interface Prediction {
  predictionId: string;
  type: string;                        // E.g. 'poor_recovery_likely', 'task_backlog_growing', 'hydration_deficit'
  confidence: number;                  // 0.0 - 1.0 confidence score
  explanation: string;                 // Rationale string
  timestamp: number;
}

export function createPrediction(
  type: string,
  confidence: number,
  explanation: string
): Prediction {
  return {
    predictionId: generateId("pred"),
    type,
    confidence,
    explanation,
    timestamp: Date.now(),
  };
}
