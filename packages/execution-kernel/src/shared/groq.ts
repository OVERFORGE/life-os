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
            maxRetries: 0,
        });
        lastApiKey = currentKey;
    }
    return cachedClient;
}

const DEFAULT_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
const RESILIENT_FALLBACK_MODELS = [
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
];
const RESILIENT_FALLBACK_MODEL = "qwen/qwen3.8-27b";

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

    // Helper to extract text from chat completion choices
    const extractContent = (choice: any): string => {
        const msg = choice?.message;
        if (!msg) return "";
        let text = msg.content || "";
        if (!text.trim() && msg.reasoning) {
            text = msg.reasoning;
        }
        return text.trim();
    };

    // Tier 1 & Tier 2: Resilient Groq Models
    if (client) {
        const modelsToTry = [
            model,
            ...RESILIENT_FALLBACK_MODELS.filter((m) => m !== model),
        ];

        let authFailed = false;

        for (const targetModel of modelsToTry) {
            if (authFailed) break;
            try {
                const requestPayload: any = {
                    model: targetModel,
                    messages,
                    temperature,
                    max_tokens,
                };
                // Hide reasoning tokens to prevent quota exhaustion and JSON truncation
                if (targetModel.includes("gpt-oss")) {
                    requestPayload.reasoning_format = "hidden";
                }
                const callPromise = client.chat.completions.create(requestPayload);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Groq call to ${targetModel} timed out`)), 4500)
                );
                const response: any = await Promise.race([callPromise, timeoutPromise]);
                const content = extractContent(response.choices[0]);
                if (content) return content;
            } catch (err: any) {
                const status = err?.status;
                if (status === 401 || status === 403) {
                    authFailed = true;
                    console.warn(`[GROQ] Authentication failure (${status}) on ${targetModel}, skipping Groq tier`);
                    break;
                }
                console.warn(`[GROQ] Model ${targetModel} failed (${status || err?.message}), attempting next resilient model`);
            }
        }
    }

    // Tier 3: Tertiary Gemini 2.5 Flash Fallback
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "mock_key_for_dev") {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
            const geminiPromise = ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
            });
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Gemini fallback timed out")), 5000)
            );
            const geminiRes: any = await Promise.race([geminiPromise, timeoutPromise]);
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