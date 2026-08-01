import { DefaultLLMProvider, LLMProvider } from "../shared/llmAdapter";
import { ConversationSemantics, ConversationIntent, SemanticEntityReference } from "../kernel/ConversationSemantics";

export type InferenceIntent =
  | "log_activity"
  | "complete_task"
  | "create_task"
  | "update_task"
  | "delete_task"
  | "ask_advice"
  | "get_insights"
  | "create_goal"
  | "confirm_goal"
  | "delete_goal"
  | "propose_diet_mode"
  | "confirm_diet_mode"
  | "casual_chat";

export interface InferenceResult {
  intent: InferenceIntent;
  confidence: number;
  semantics: ConversationSemantics;
}

const INTENT_DESCRIPTIONS = `
- log_activity: User is reporting an ongoing activity, a physical/mental state, or a general life event — e.g. slept 7 hours, mood is 8/10, worked out for 45 minutes, drank 3L water.
- complete_task: User is reporting that a specific named task or to-do item is now done.
- create_task: User wants to create a new task, reminder, or to-do item.
- update_task: User wants to change properties of an existing task.
- delete_task: User wants to permanently remove/delete/cancel a task.
- ask_advice: User is asking for a recommendation, plan, strategy, or guidance about what to do NOW or in the NEAR FUTURE.
- get_insights: User wants to review HISTORICAL data or TRENDS over a past time window.
- create_goal: User wants to set up a new long-term goal, habit, or tracking objective.
- confirm_goal: User is responding to a previously proposed goal plan.
- delete_goal: User wants to remove or abandon a goal, habit, or tracking objective.
- propose_diet_mode: User wants to INITIATE or SWITCH their nutrition strategy.
- confirm_diet_mode: User is ACCEPTING a diet mode change that was ALREADY PROPOSED.
- casual_chat: General conversation, greetings, questions, or vague/unclear messages.
`.trim();

const CONVERSATION_INTENT_DESCRIPTIONS = `
- confirm_pending_action: User is agreeing to, confirming, or accepting a pending proposal or action.
- cancel_pending_action: User is cancelling, rejecting, or saying "never mind" to a pending proposal.
- update_entity: User wants to modify or change an existing entity (e.g. "make it 7.5 hours", "rename the goal").
- delete_entity: User wants to delete or remove an entity (e.g. "delete that goal", "remove task").
- reference_entity: User mentions or asks about a specific entity without changing it.
- continue_workflow: User wants to proceed with the ongoing workflow.
- new_request: User is starting a completely new, unrelated topic or task.
- null: No conversational meta-intent (regular domain message).
`.trim();

export class InferenceReasoningStrategy {
  constructor(private llmProvider: LLMProvider = DefaultLLMProvider.getInstance()) {}

  static getInstance(): InferenceReasoningStrategy {
    return new InferenceReasoningStrategy();
  }

  async infer(
    message: string,
    history: string = "",
    model?: string,
    hasPendingProposal: boolean = false,
    activeEntityName?: string
  ): Promise<InferenceResult> {
    const systemPrompt = `You are a precision natural language understanding subsystem for LifeOS.
Your job is to analyze the user's input and extract BOTH the domain intent AND conversational semantics.
Return ONLY valid JSON matching this schema:
{
  "intent": "<domain_intent_key>",
  "confidence": <0.0-1.0>,
  "conversationIntent": "<conversation_intent_key or null>",
  "isMutation": <true if intent modifies or deletes user state, otherwise false>,
  "entityMention": "<natural language entity description or null>",
  "entityType": "<goal|task|meal|workout|weight|diet_mode|null>"
}

## Domain Intents:
${INTENT_DESCRIPTIONS}

## Conversational Intents:
${CONVERSATION_INTENT_DESCRIPTIONS}
${activeEntityName ? `Currently active entity in discussion: "${activeEntityName}"` : ""}`;

    const userPrompt = `History:\n${history}\n\nUser Message:\n"${message}"`;

    try {
      const responseText = await this.llmProvider.chat(userPrompt, systemPrompt, model);
      const parsed = JSON.parse(responseText);

      const domainIntent = (parsed.intent as InferenceIntent) || "casual_chat";
      const confidence = typeof parsed.confidence === "number" ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.85;

      const conversationIntent: ConversationIntent =
        parsed.conversationIntent && parsed.conversationIntent !== "null"
          ? (parsed.conversationIntent as ConversationIntent)
          : null;

      const entityReference: SemanticEntityReference | null =
        parsed.entityMention
          ? {
              type: parsed.entityType || "entity",
              mention: parsed.entityMention,
              recency: activeEntityName && parsed.entityMention.toLowerCase().includes("it") ? "active" : "recent",
            }
          : null;

      const isMutation = Boolean(parsed.isMutation) || ["update_entity", "delete_entity", "delete_task", "delete_goal", "complete_task"].includes(domainIntent);

      const semantics: ConversationSemantics = {
        conversationIntent,
        entityReference,
        confidence,
        isMutation,
      };

      return {
        intent: domainIntent,
        confidence,
        semantics,
      };
    } catch {
      // Fallback
      return {
        intent: "casual_chat",
        confidence: 0.5,
        semantics: {
          conversationIntent: null,
          entityReference: null,
          confidence: 0.5,
          isMutation: false,
        },
      };
    }
  }
}
