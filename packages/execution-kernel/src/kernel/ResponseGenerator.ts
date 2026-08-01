import { groqChatStream } from "../shared/groq";

export interface ResponseGeneratorInput {
  input: string;
  context: any;
  toolResults?: any[];
  model?: string;
  intentConfidence?: number;
}

/**
 * Response Generator Subsystem
 * 
 * Generates user-facing assistant response streams.
 */
export class ResponseGenerator {
  static getInstance(): ResponseGenerator {
    return new ResponseGenerator();
  }

  async generateStream(params: ResponseGeneratorInput) {
    const renderedResults = params.toolResults && params.toolResults.length > 0 
      ? `SYSTEM EXECUTION TRUTHS (MANDATORY TO ACKNOWLEDGE):\n${JSON.stringify(params.toolResults, null, 2)}`
      : "SYSTEM EXECUTION TRUTHS: [] (No new DB actions taken)";

    const criticalInstructions = params.toolResults 
      ? params.toolResults.filter((tr) => tr.data?.ai_instruction).map((tr) => tr.data.ai_instruction).join("\n")
      : "";

    const now = new Date();
    const systemPrompt = `You are LifeOS, a strict behavioral intelligence assistant.
Today's date: ${now.toISOString().split("T")[0]}.
User Input: "${params.input}"

### SYSTEM CONTEXT:
${JSON.stringify(params.context, null, 2)}

### ${renderedResults}
${criticalInstructions ? `🔥 CRITICAL SYSTEM DIRECTIVE: ${criticalInstructions}` : ""}

### RULES FOR RESPONSE:
1. TRUTH PRIORITY: You MUST explicitly base your reality on the "SYSTEM EXECUTION TRUTHS".
2. Summarize what happened clearly.
3. Be direct, clear, and empathetic.`;

    return await groqChatStream({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: params.input },
      ],
      model: params.model || "llama-3.3-70b-versatile",
    });
  }
}
