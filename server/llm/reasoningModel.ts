import { groqChatStream } from "./groq";

export async function generateResponse({
  input,
  context,
  toolResults,
  model
}: {
  input: string;
  context: any;
  toolResults?: any[];
  model?: string;
}) {
  const renderedResults = toolResults && toolResults.length > 0 
    ? `TOOL EXECUTION RESULTS:\n${toolResults.map(tr => JSON.stringify(tr, null, 2)).join("\n---\n")}\n(Multiple tools may have just been executed. Acknowledge these sequentially.)`
    : "";

  const criticalInstructions = toolResults 
    ? toolResults.filter(tr => tr.result?.ai_instruction).map(tr => tr.result.ai_instruction).join("\n")
    : "";

  const prompt = `
You are LifeOS, an intelligent behavior intelligence assistant.

User Input: "${input}"

SYSTEM STATE & CONTEXT:
${JSON.stringify(context, null, 2)}

${renderedResults}

${criticalInstructions ? `CRITICAL INSTRUCTION FROM BACKEND SYSTEM: ${criticalInstructions}` : ""}

INSTRUCTIONS:
- You are not a generic chatbot. You are analyzing the user's data.
- Reference their actual data (e.g. phases, trends, logs) EXCLUSIVELY if provided in the context matrix. 
- CRITICAL: DO NOT invent, hallucinate, or assert any data points whatsoever. If the context does not contain metrics (like tracking phone 50 times), absolutely do not guess or makeup numbers to sound conversational. Acknowledge that they have no data logged yet instead!
- Give actionable, concise suggestions based on their true state.
- Adapt your tone: if they are low energy or in recovery, suggest lighter days. If they are in high performance, suggest structured productivity.
- DO NOT use JSON, DO NOT use markdown codeblocks for data. Speak naturally like a human assistant.
`;

  return await groqChatStream({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    model
  });
}
