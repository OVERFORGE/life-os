import { generateId } from "../shared/ids";
import { ConversationSemantics } from "../kernel/ConversationSemantics";

/**
 * Understanding Model
 * 
 * Represents the Reasoner's interpretation of current reality.
 * Describes situations, conditions, and context without executor or tool coupling.
 */
export interface Understanding {
  understandingId: string;
  situation: string;                   // E.g. 'task_completion', 'health_log', 'general_query'
  confidence: number;                  // 0.0 - 1.0 confidence score
  detectedConditions: string[];        // E.g. ['high_fatigue', 'pending_proposal']
  inferredContext: Record<string, any>; // Context fetched/derived from Brain state
  priorities: string[];                // E.g. ['rest', 'recovery']
  requiresPlanning: boolean;           // True if strategic action is needed
  conversationSemantics?: ConversationSemantics; // NEW — emitted by Reasoner for STM/Entity resolution
}

export function createUnderstanding(
  situation: string,
  confidence: number,
  detectedConditions: string[] = [],
  inferredContext: Record<string, any> = {},
  priorities: string[] = [],
  requiresPlanning: boolean = true,
  conversationSemantics?: ConversationSemantics
): Understanding {
  return {
    understandingId: generateId("und"),
    situation,
    confidence,
    detectedConditions,
    inferredContext,
    priorities,
    requiresPlanning,
    conversationSemantics,
  };
}
