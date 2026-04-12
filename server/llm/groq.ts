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
        model: "llama3-70b-8192",
        messages,
        temperature,
    });

    return response.choices[0]?.message?.content || "";
}