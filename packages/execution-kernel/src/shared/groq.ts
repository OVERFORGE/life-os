import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";

let cachedClient: Groq | null = null;
let lastApiKey: string | undefined = undefined;

function getGroqClient(): Groq | null {
    const currentKey = process.env.GROQ_API_KEY;
    if (!currentKey || currentKey === "mock_key_for_dev") {
        return null;
    }
    if (!cachedClient || lastApiKey !== currentKey) {
        cachedClient = new Groq({
            apiKey: currentKey,
            maxRetries: 1,
        });
        lastApiKey = currentKey;
    }
    return cachedClient;
}

const DEFAULT_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const RESILIENT_FALLBACK_MODELS = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
];
const RESILIENT_FALLBACK_MODEL = "openai/gpt-oss-120b";

export async function groqChat({
    messages,
    temperature = 0.2,
    max_tokens = 400,
    model = DEFAULT_MODEL,
}: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    max_tokens?: number;
    model?: string;
}) {
    const client = getGroqClient();

    // Tier 1: Primary Model
    if (client) {
        try {
            const response = await client.chat.completions.create({
                model,
                messages,
                temperature,
                max_tokens,
            });
            const content = response.choices[0]?.message?.content || "";
            if (content.trim()) return content;
        } catch (primaryErr: any) {
            console.warn(`[GROQ] Primary model ${model} failed (${primaryErr?.status || primaryErr?.message}), trying resilient fallbacks`);
        }

        // Tier 2: Resilient Groq Fallback Models
        for (const fallbackModel of RESILIENT_FALLBACK_MODELS) {
            if (fallbackModel === model) continue;
            try {
                const fallbackResponse = await client.chat.completions.create({
                    model: fallbackModel,
                    messages,
                    temperature,
                    max_tokens,
                });
                const content = fallbackResponse.choices[0]?.message?.content || "";
                if (content.trim()) return content;
            } catch (fallbackErr: any) {
                console.warn(`[GROQ] Resilient model ${fallbackModel} failed (${fallbackErr?.status || fallbackErr?.message})`);
            }
        }
    }

    // Tier 3: Tertiary Gemini 3.6 Flash Fallback
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "mock_key_for_dev") {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
            const geminiRes = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
            });
            const text = geminiRes.text?.trim() || "";
            if (text) {
                console.log("[GROQ] Recovered successfully using tertiary Gemini 2.5 Flash fallback");
                return text;
            }
        } catch (geminiErr: any) {
            console.error("[GROQ] Tertiary Gemini fallback failed:", geminiErr?.message);
        }
    }

    // If mock environment or all failed, return a sensible default for test runs
    if (!client && (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "mock_key_for_dev")) {
        return "Acknowledged. Operating in local test environment.";
    }

    throw new Error(`All LLM models failed across Groq and Gemini tiers for prompt`);
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
    max_tokens = 400,
    model = DEFAULT_MODEL,
}: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    max_tokens?: number;
    model?: string;
}) {
    const client = getGroqClient();
    if (!client) {
        throw new Error("Groq API key not configured for streaming");
    }

    try {
        return await client.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens,
            stream: true,
        });
    } catch (err: any) {
        console.warn(`[GROQ_STREAM] Model ${model} failed, falling back to ${RESILIENT_FALLBACK_MODEL}`);
        return await client.chat.completions.create({
            model: RESILIENT_FALLBACK_MODEL,
            messages,
            temperature,
            max_tokens,
            stream: true,
        });
    }
}