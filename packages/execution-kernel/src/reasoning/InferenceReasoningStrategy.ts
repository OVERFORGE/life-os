import { DefaultLLMProvider, LLMProvider } from "../shared/llmAdapter";

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

export class InferenceReasoningStrategy {
  constructor(private llmProvider: LLMProvider = DefaultLLMProvider.getInstance()) {}

  static getInstance(): InferenceReasoningStrategy {
    return new InferenceReasoningStrategy();
  }

  async infer(
    message: string,
    history: string = "",
    model?: string,
    hasPendingProposal: boolean = false
  ): Promise<InferenceResult> {
    // Stage 1: Hard guard check for pending goal confirmation
    if (hasPendingProposal) {
      const msgLower = message.toLowerCase();
      const acceptWords = ["yes", "yeah", "yep", "sure", "ok", "go ahead", "do it", "create", "make it", "looks good", "perfect", "approved", "sounds good", "correct", "fine"];
      const rejectWords = ["no", "nope", "don't", "change", "modify", "instead", "different"];
      if (acceptWords.some((kw) => msgLower.includes(kw)) || rejectWords.some((kw) => msgLower.includes(kw))) {
        return { intent: "confirm_goal", confidence: 0.95 };
      }
    }

    // Stage 2: LLM semantic interpretation
    const systemPrompt = `You are a precision intent classifier for a personal life-tracking assistant called LifeOS.
Your ONLY job is to classify the user's message into exactly one intent from the list below.
Return ONLY valid JSON: {"intent": "<intent_key>", "confidence": <0.0-1.0>}

## Intent Options:
${INTENT_DESCRIPTIONS}`;

    const userPrompt = `History:\n${history}\n\nUser Message:\n${message}`;

    try {
      const responseText = await this.llmProvider.chat(userPrompt, systemPrompt, model);
      const parsed = JSON.parse(responseText);
      return {
        intent: (parsed.intent as InferenceIntent) || "casual_chat",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
      };
    } catch {
      return { intent: "casual_chat", confidence: 0.5 };
    }
  }
}
