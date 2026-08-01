import { generateId } from "../shared/ids";

/**
 * Insight Model
 * 
 * Represents a deterministic, descriptive observation of a recurring pattern
 * or historical trend in the user's world.
 */
export interface Insight {
  insightId: string;
  type: string;                        // E.g. 'consecutive_low_sleep_trend', 'sustained_task_accumulation'
  summary: string;                     // Human-readable pattern summary
  confidence: number;                  // 0.0 - 1.0 confidence score
  timestamp: number;
}

export function createInsight(
  type: string,
  summary: string,
  confidence: number = 0.9
): Insight {
  return {
    insightId: generateId("ins"),
    type,
    summary,
    confidence,
    timestamp: Date.now(),
  };
}
