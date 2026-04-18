import { groqChat } from "./groq";

export async function detectIntent(input: string) {
    const prompt = `
You are an intent classifier.

ONLY return JSON.

Possible intents:
- log_activity
- create_goal
- get_insights
- ask_advice
- casual_chat

Rules:
- If user is describing what they did → log_activity
- If user wants guidance → ask_advice
- If user asks about data → get_insights
- If unclear → casual_chat

User: "${input}"

Return:
{
  "intent": "...",
  "confidence": 0-1
}
`;

    const res = await groqChat({
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
    });

    try {
        const cleanRes = res.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleanRes);
    } catch {
        return { intent: "casual_chat", confidence: 0.5 };
    }
}