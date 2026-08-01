import { groqChatStream } from "../shared/groq";
import { PromptPayload } from "./ContextBuilder";

/**
 * Response Generator Subsystem
 *
 * Streams an LLM response from a fully-assembled PromptPayload.
 * Receives only prompt-ready data — never constructs prompts itself.
 */
export class ResponseGenerator {
  static getInstance(): ResponseGenerator {
    return new ResponseGenerator();
  }

  async generateStream(payload: PromptPayload) {
    return await groqChatStream({
      messages: [
        { role: "system", content: payload.systemPrompt },
        { role: "user", content: payload.userMessage },
      ],
      model: payload.model || "llama-3.3-70b-versatile",
    });
  }
}
