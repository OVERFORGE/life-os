import { groqChatStream } from "./groq";

export async function generateResponse({
  input,
  context,
  toolResults,
  model,
  intentConfidence,
}: {
  input: string;
  context: any;
  toolResults?: any[];
  model?: string;
  intentConfidence?: number;
}) {
  const renderedResults = toolResults && toolResults.length > 0 
    ? `SYSTEM EXECUTION TRUTHS (MANDATORY TO ACKNOWLEDGE):\n${JSON.stringify(toolResults, null, 2)}\n(These actions were just executed natively against the database. If success is true, it happened.)`
    : "SYSTEM EXECUTION TRUTHS: [] (No new DB actions taken)";

  const criticalInstructions = toolResults 
    ? toolResults.filter(tr => tr.data?.ai_instruction).map(tr => tr.data.ai_instruction).join("\n")
    : "";

  // FIX 2: Safe fallback when confidence is low — the intent classifier wasn't sure
  const now = new Date();
  const isLowConfidence = intentConfidence !== undefined && intentConfidence < 0.75;
  const lowConfidenceNote = isLowConfidence
    ? `\n⚠️  CONFIDENCE WARNING: The system was only ${(intentConfidence! * 100).toFixed(0)}% confident in classifying this input. No DB actions were taken. If the user seems to want to record or update something specific, ask them to clarify (e.g., "Were you trying to mark a task as done, or just telling me about it?"). DO NOT assume any action happened.`
    : "";

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
2. STRICT FAILURE REFLECTION: If any execution result has \\`success: false\\`, you MUST reflect that failure honestly. NEVER say something was completed, deleted, or saved if success is false. Use the \\`error\\` field to explain what went wrong. If there's an \\`ai_instruction\\` field in a result, follow it exactly.
3. AMBIGUITY HANDLING: If a result has \\`ambiguous: true\\` and lists \\`candidates\\`, ask the user which specific item they meant. Do not guess.
4. CONVERSATIONAL SUMMARY: Summarize what happened clearly (e.g. "I've logged your 4 hours of deep work and deleted the abs goal") based STRICTLY on the truths array.
5. DO NOT INVENT DATA: Do not guess numbers, invent stats, or assume success out of thin air.
6. IF NO TRUTHS: If no execution happened (array is empty), just provide normal insights or answer the conversational query naturally using the historical context block.
7. DAILY PLAN REQUESTS: If the user asks for a plan for today, you MUST:
   a) Start by acknowledging their current mental state (energy, mood, stress) from context.mentalState.today — if energy is low (≤3), explicitly recommend a lighter load.
   b) Explicitly list their Tasks (Today, Overdue, and Upcoming) from the context block.
   c) Combine task priorities with their mental state to build a tailored, realistic plan for their actual energy level.
   d) Be empathetic — if they're exhausted, DO NOT tell them to push through; recommend rest as a priority.
8. MENTAL STATE AWARENESS: Always check context.mentalState.today first. If energy < 4 or stress > 7, proactively acknowledge this in your response and adjust all recommendations accordingly.
9. DO NOT output JSON or code blocks.
${lowConfidenceNote}
`;
  return await groqChatStream({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    model
  });
}
