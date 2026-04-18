import { groqChatStream } from "./groq";

export async function generateResponse({
  input,
  context,
  toolResult,
}: {
  input: string;
  context: any;
  toolResult?: any;
}) {
  const prompt = `
You are LifeOS, an intelligent behavior intelligence assistant.

User Input: "${input}"

SYSTEM STATE & CONTEXT:
${JSON.stringify(context, null, 2)}

${
  toolResult
    ? `TOOL EXECUTION RESULT:\n${JSON.stringify(toolResult, null, 2)}\n(A tool was just executed. Acknowledge this appropriately.)`
    : ""
}

INSTRUCTIONS:
- You are not a generic chatbot. You are analyzing the user's data.
- Reference their actual data (e.g. phases, trends, logs) if provided in the context.
- Give actionable, concise suggestions based on their current state.
- Adapt your tone: if they are low energy or in recovery, suggest lighter days. If they are in high performance, suggest structured productivity.
- DO NOT use JSON, DO NOT use markdown codeblocks for data. Speak naturally like a human assistant.
`;

  return await groqChatStream({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });
}
