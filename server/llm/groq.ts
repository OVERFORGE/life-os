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