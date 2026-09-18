import Groq from "groq-sdk";

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY || "mock_key_for_dev",
});

export async function groqChat({
    messages,
    temperature = 0.2,
    model = process.env.GROQ_MODEL || "qwen/qwen3.8-27b"
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
    model = process.env.GROQ_MODEL || "qwen/qwen3.8-27b"
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