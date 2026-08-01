import Groq from "groq-sdk";

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
});

export async function groqChat({
    messages,
    temperature = 0.2,
    model = "llama-3.3-70b-versatile"
}: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    model?: string;
}) {
    const response = await client.chat.completions.create({
        model,
        messages,
        temperature,
    });

    return response.choices[0]?.message?.content || "";
}

/**
 * Strips thinking-model tokens (<think>...</think>) and markdown fences
 * before JSON parsing. Works for Qwen 3, DeepSeek-R1, and any other
 * model that emits chain-of-thought before the actual JSON output.
 */
export function cleanLLMResponse(raw: string): string {
    return raw
        .replace(/<think>[\s\S]*?<\/think>/gi, "") // strip <think> blocks
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
}


export async function groqChatStream({
    messages,
    temperature = 0.7,
    model = "llama-3.3-70b-versatile"
}: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    model?: string;
}) {
    return await client.chat.completions.create({
        model,
        messages,
        temperature,
        stream: true,
    });
}