export async function detectIntent(message: string, context: any) {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    body: JSON.stringify({
      model: "llama3.1:8b",
      prompt: `
You are an intent classifier for an AI agent system.

Your ONLY job is to classify the user's intent correctly.

MESSAGE:
"${message}"

AVAILABLE INTENTS:
- create_goal → user wants to start or commit to something regularly
- log_activity → user is describing something they already did
- analyze_system → user asking about progress, performance, phase
- planning → user wants help planning tasks/day
- ask_question → general knowledge question
- casual_chat → greetings, random talk

STRICT RULES:

1. If user DID something → log_activity
2. Past tense → log_activity
3. Mentions time/duration → log_activity
4. Mentions actions like gym, study, coding → log_activity
5. If user WANTS to do something regularly → create_goal
6. If user asks about progress/phase → analyze_system
7. DO NOT default to casual_chat unless clearly casual

EXAMPLES:

"I will go gym daily" → create_goal
"create goal to code daily" → create_goal
"I went to gym" → log_activity
"I worked out today" → log_activity
"I studied for 3 hours" → log_activity
"I coded for 2 hours" → log_activity
"I slept 6 hours" → log_activity
"I just finished a workout" → log_activity
"I went to gym" → log_activity
"worked on executioners today" → log_activity
"how is my progress" → analyze_system
"what phase am I in" → analyze_system
"plan my tomorrow" → planning
"what is dopamine" → ask_question
"hey what's up" → casual_chat

EDGE CASES:

"I think I should start gym" → create_goal
"I coded today for 2 hours" → log_activity
"I just went for a run" → log_activity
"I completed my workout" → log_activity

Return ONLY JSON:
{ "intent": "intent_name" }
      `,
      stream: false,
    }),
  });

  const data = await res.json();

  try {
    const parsed = JSON.parse(data.response);

    if (!parsed.intent) return "casual_chat";

    return parsed.intent;
  } catch {
    return "casual_chat";
  }
}