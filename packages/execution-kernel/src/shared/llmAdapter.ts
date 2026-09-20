import { groqChat, cleanLLMResponse } from "./groq";

/**
 * LLM Provider Adapter Interface
 * 
 * ARCHITECTURAL DESIGN NOTE:
 * Decouples reasoning and planning strategies from specific LLM providers, prompts,
 * and SDK implementations. Allows kernel strategies to remain orchestration-only.
 */
export interface LLMProvider {
  chat(prompt: string, systemPrompt: string, model?: string): Promise<string>;
}

export class DefaultLLMProvider implements LLMProvider {
  static getInstance(): DefaultLLMProvider {
    return new DefaultLLMProvider();
  }

  async chat(prompt: string, systemPrompt: string, model?: string): Promise<string> {
    const rawResponse = await groqChat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      model: model || process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    });
    return cleanLLMResponse(rawResponse);
  }
}
