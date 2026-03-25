export async function detectIntent(message: string, context: any) {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    body: JSON.stringify({
      model: "llama3.1:8b",
      prompt: `
Classify the user intent.

Message:
"${message}"

Possible intents:
- create_goal
- log_activity
- analyze_system
- planning
- ask_question
- casual_chat

Examples:

"create a goal to learn guitar" → create_goal
"log that I worked for 2 hours" → log_activity
"I studied for 3 hours today" → log_activity
"I went to gym" → log_activity
"how am I doing?" → analyze_system
"what is my phase" → analyze_system
"plan my day" → planning

Return ONLY JSON:
{ "intent": "intent_name" }
      `,
      stream: false,
    }),
  });

  const data = await res.json();

  try {
    const parsed = JSON.parse(data.response);
    return parsed.intent;
  } catch {
    return "casual_chat";
  }
}