import { groqChat } from "./groq";

export async function detectIntent(input: string, history: string = "", model?: string) {
    const prompt = `
You are an advanced intent classifier for a behavioral intelligence system.

ONLY return JSON.

Possible intents:
- log_activity
- propose_goal
- create_goal
- delete_goal
- override_mental_score
- get_insights
- ask_advice
- casual_chat

### REASONING RULES & BOUNDARIES:

1. \`create_goal\`: ONLY trigger this if the AI has explicitly proposed setting up a new structured plan, habit, OR a tracking system in the recent context, AND the user gives a firm confirmation to proceed (e.g. "yes", "let's do it", "create it"). **EXCEPTION:** If the user EXPLICITLY says "just create it", "don't ask for permission", or commands you to create it immediately without discussion, use \`create_goal\`.
2. \`propose_goal\`: Any time the user introduces a new habit or objective (e.g. "I want to read 10 pages daily", "Let's focus on mindfulness"). This MUST be triggered first unless they used the explicit bypass command described above.
3. \`delete_goal\`: If the user explicitly asks to erase, delete, drop, or remove an objective. Use semantic matching—if they say "drop the coding stuff", they mean deleting a coding goal.
4. \`override_mental_score\`: Only if the user is explicitly correcting the AI's algorithm about their mental state (e.g. "change my focus to 8", "actually my stress is 9").
5. \`log_activity\`: ONLY if the user explicitly mentions performing an action physically (e.g., "I just stretched", "I went to the gym", "Slept at 1am"). NEVER trigger this for just saying "yes".

### CONVERSATION CONTEXT:
${history}

User Current Message: "${input}"

Return:
{
  "intents": ["..."]
}
`;

    const res = await groqChat({
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        model
    });

    try {
        const cleanRes = res.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanRes);
        return { intents: Array.isArray(parsed.intents) ? parsed.intents : [parsed.intent || "casual_chat"] };
    } catch {
        return { intents: ["casual_chat"] };
    }
}