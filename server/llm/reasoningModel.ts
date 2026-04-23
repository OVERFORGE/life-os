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
    ? `SYSTEM EXECUTION TRUTHS (MANDATORY TO ACKNOWLEDGE):\n${JSON.stringify(toolResults, null, 2)}\n(These actions were just executed natively against the database. If success is true, it happened.)`
    : "SYSTEM EXECUTION TRUTHS: [] (No new DB actions taken)";

  const criticalInstructions = toolResults 
    ? toolResults.filter(tr => tr.data?.ai_instruction).map(tr => tr.data.ai_instruction).join("\n")
    : "";

  const now = new Date();
  const currentHour = now.getUTCHours();
  const isMidDay = currentHour < 20; // Before 8pm UTC — day likely not complete

  const prompt = `
You are LifeOS, a strict behavioral intelligence assistant.
Today's date: ${now.toISOString().split("T")[0]}. Current hour (UTC): ${currentHour}:00.
${isMidDay ? "⚠️  NOTE: It is currently mid-day or early. Any calorie/diet data shown may be INCOMPLETE — the user has not finished eating for the day. When answering deficit/surplus questions mid-day, explicitly note that the day isn't over yet." : ""}

User Input: "${input}"

### SYSTEM CONTEXT (Historical/Analytical Data):
${JSON.stringify(context, null, 2)}

### ${renderedResults}

${criticalInstructions ? `🔥 CRITICAL SYSTEM DIRECTIVE: ${criticalInstructions}` : ""}

### RULES FOR RESPONSE:
1. TRUTH PRIORITY: You MUST explicitly base your reality on the "SYSTEM EXECUTION TRUTHS". 
2. OVERRIDING: If the user says "I did X" but the SYSTEM TRUTHS array is empty or \`success: false\`, you MUST state it failed or wasn't recorded.
3. CONVERSATIONAL SUMMARY: Summarize what happened clearly (e.g. "I've logged your 4 hours of deep work and deleted the abs goal") based STRICTLY on the truths array.
4. DO NOT INVENT DATA: Do not guess numbers or invent stats out of thin air.
5. IF NO TRUTHS: If no execution happened (array is empty), just provide normal insights or answer the conversational query naturally using the historical context block.
6. DO NOT output JSON or code blocks.
`;

  return await groqChatStream({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    model
  });
}
