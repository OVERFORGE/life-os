import { DefaultLLMProvider, LLMProvider } from "../shared/llmAdapter";
import { IntendedAction } from "./Plan";

export class NativePlanningStrategy {
  constructor(private llmProvider: LLMProvider = DefaultLLMProvider.getInstance()) {}

  static getInstance(): NativePlanningStrategy {
    return new NativePlanningStrategy();
  }

  async extractIntendedActions(
    message: string,
    situation: string,
    goalTitles: string = "",
    historyText: string = "",
    model?: string
  ): Promise<IntendedAction[]> {
    if (["get_insights", "ask_advice", "general_chat", "casual_chat"].includes(situation)) {
      return [];
    }

    if (situation === "confirm_goal") {
      return [{ domain: "goal", action: "confirm", parameters: { userMessage: message } }];
    }

    if (situation === "create_goal") {
      return [{ domain: "goal", action: "propose", parameters: { userMessage: message } }];
    }

    const systemPrompt = `You are a precision action extractor for LifeOS.
Parse the user's message and situation into a JSON array of IntendedAction objects:
[
  { "domain": "task" | "health" | "goal" | "general", "action": "complete" | "create" | "log" | "update", "parameters": {} }
]
Return ONLY valid JSON array. No explanation.`;

    const userPrompt = `Situation: ${situation}\nGoals: ${goalTitles}\nMessage: ${message}`;

    try {
      const responseText = await this.llmProvider.chat(userPrompt, systemPrompt, model);
      const parsed = JSON.parse(responseText);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          domain: item.domain || "general",
          action: item.action || "execute",
          parameters: item.parameters || {},
        }));
      }
      return [];
    } catch {
      return [];
    }
  }
}
