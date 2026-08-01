/**
 * ConversationSemantics
 * 
 * Typed contract emitted by the Reasoner for conversational intents,
 * entity references, and historical retrieval parameters.
 */

export type ConversationIntent =
  | "confirm_pending_action" // User affirms a pending proposal or action
  | "cancel_pending_action"  // User cancels or dismisses a pending proposal
  | "update_entity"          // User wants to modify an existing entity
  | "delete_entity"          // User wants to remove/delete an entity
  | "reference_entity"       // User refers to an entity without mutating it
  | "new_request"            // User is starting a completely new request
  | "continue_workflow"      // User wants to continue current active workflow
  | "query_history"          // User is asking a historical HRAG question about the past
  | null;                    // Pure domain request with no conversational meta-intent

export interface SemanticEntityReference {
  type: string;             // e.g. "goal", "task", "meal", "workout", "weight", "sleep", "diet_mode"
  mention: string;          // Natural language description — NEVER a DB ID
  recency?: "active" | "recent" | "historical";
}

export interface ConversationSemantics {
  conversationIntent: ConversationIntent;
  entityReference: SemanticEntityReference | null;
  confidence: number;
  isMutation: boolean;       // true if intent modifies or deletes user state

  // HRAG (Historical Retrieval) parameters — Phase 7
  historicalQuery?: boolean;
  timeWindow?: "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "all_time";
  historicalKeywords?: string[];

  // Extensibility slots for future phases
  workflowIntent?: string;
  moduleContext?: string;
  topicShift?: boolean;
  conversationState?: string;
  interruptionReason?: string;
  continuationType?: string;
}
