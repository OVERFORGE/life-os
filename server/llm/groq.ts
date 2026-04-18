import Groq from "groq-sdk";

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY!,
});

export async function groqChat({
    messages,
    temperature = 0.2,
}: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
}) {
    const response = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature,
    });

    return response.choices[0]?.message?.content || "";
}

export async function groqChatStream({
    messages,
    temperature = 0.7,
}: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
}) {
    return await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature,
        stream: true,
    });
}