import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import {
    DEFAULT_GROQ_MODEL,
    resolveGroqModel,
    resolveFallbackChain,
    resolveGeminiModel,
    markModelUnsupported,
    recordProviderTelemetry,
} from "./modelRegistry";
import { StreamingThinkSanitizer } from "../orchestration/contracts/StreamLifecycleUtils";

export class StreamInterruptedError extends Error {
    public readonly partialText: string;
    public readonly causeError?: unknown;

    constructor(partialText: string, causeError?: unknown) {
        const msg =
            causeError instanceof Error
                ? causeError.message
                : typeof causeError === "string"
                  ? causeError
                  : "Stream interrupted mid-response";
        super(`Stream interrupted after partial output: ${msg}`);
        this.name = "StreamInterruptedError";
        this.partialText = partialText;
        this.causeError = causeError;
    }
}

export function createAbortError(message = "Operation aborted"): Error {
    const err = new Error(message);
    err.name = "AbortError";
    return err;
}

export function isAbortError(err: unknown): boolean {
    return Boolean(err && typeof err === "object" && (err as any).name === "AbortError");
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw createAbortError();
    }
}

function raceWithTimeoutAndAbort<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
    signal?: AbortSignal
): Promise<T> {
    throwIfAborted(signal);
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const onAbort = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(createAbortError());
        };
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            reject(new Error(timeoutMessage));
        }, timeoutMs);

        signal?.addEventListener("abort", onAbort, { once: true });

        promise.then(
            (val) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                resolve(val);
            },
            (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
                reject(err);
            }
        );
    });
}

let cachedClient: Groq | null = null;
let lastApiKey: string | undefined = undefined;
let mockGroqChatFn: ((params: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    max_tokens?: number;
    model?: string;
}) => Promise<string>) | undefined = undefined;

/**
 * Test-only hook for deterministic offline unit tests.
 */
export function setMockGroqChat(
    fn?: (params: {
        messages: { role: "system" | "user" | "assistant"; content: string }[];
        temperature?: number;
        max_tokens?: number;
        model?: string;
    }) => Promise<string>
): void {
    mockGroqChatFn = fn;
}

let mockGroqTextStreamFn: ((params: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    max_tokens?: number;
    model?: string;
    signal?: AbortSignal;
    onDelta?: (delta: string) => void | Promise<void>;
}) => Promise<string>) | undefined = undefined;

/**
 * Test-only hook for deterministic streaming tests (multi-chunk, mid-stream failure, abort).
 */
export function setMockGroqTextStream(
    fn?: (params: {
        messages: { role: "system" | "user" | "assistant"; content: string }[];
        temperature?: number;
        max_tokens?: number;
        model?: string;
        signal?: AbortSignal;
        onDelta?: (delta: string) => void | Promise<void>;
    }) => Promise<string>
): void {
    mockGroqTextStreamFn = fn;
}

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

function isUnsupportedModelError(err: any): boolean {
    const status = err?.status ?? err?.statusCode ?? err?.response?.status;
    const code = String(err?.error?.code ?? err?.code ?? "").toLowerCase();
    const msg = String(err?.message ?? "").toLowerCase();
    return (
        status === 404 ||
        code.includes("model_not_found") ||
        code.includes("model_decommissioned") ||
        msg.includes("does not exist") ||
        msg.includes("decommissioned") ||
        msg.includes("model_not_found")
    );
}

function isRateLimitError(err: any): boolean {
    const status = err?.status ?? err?.statusCode ?? err?.response?.status;
    const code = String(err?.error?.code ?? err?.code ?? "").toLowerCase();
    const msg = String(err?.message ?? "").toLowerCase();
    return status === 429 || code.includes("rate_limit") || msg.includes("rate limit");
}

function sleepMs(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function groqChat({
    messages,
    temperature = 0.2,
    max_tokens = 400,
    model,
    signal,
}: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    max_tokens?: number;
    model?: string;
    signal?: AbortSignal;
}) {
    throwIfAborted(signal);
    if (mockGroqChatFn) {
        return mockGroqChatFn({ messages, temperature, max_tokens, model });
    }
    const client = getGroqClient();
    const requestedModel = (model || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim();
    const attemptedModels: string[] = [];
    let quotaDegraded = false;

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
        const modelsToTry = resolveFallbackChain(model);
        let authFailed = false;

        for (let i = 0; i < modelsToTry.length; i++) {
            if (authFailed) break;
            throwIfAborted(signal);
            const targetModel = modelsToTry[i];
            attemptedModels.push(targetModel);
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
                const callPromise = client.chat.completions.create(requestPayload, signal ? { signal } : undefined);
                const response: any = await raceWithTimeoutAndAbort(
                    callPromise,
                    4500,
                    `Groq call to ${targetModel} timed out`,
                    signal
                );
                const content = extractContent(response.choices[0]);
                if (content) {
                    recordProviderTelemetry({
                        requestedModel,
                        resolvedModel: targetModel,
                        attemptedModels,
                        providerFallbackCount: Math.max(0, attemptedModels.length - 1),
                        quotaDegraded,
                        timestamp: Date.now(),
                    });
                    return content;
                }
            } catch (err: any) {
                if (isAbortError(err) || signal?.aborted) {
                    throw createAbortError();
                }
                const status = err?.status;
                if (status === 401 || status === 403) {
                    authFailed = true;
                    console.warn(`[GROQ] Authentication failure (${status}) on ${targetModel}, skipping Groq tier`);
                    break;
                }
                if (isUnsupportedModelError(err)) {
                    markModelUnsupported(targetModel);
                } else if (isRateLimitError(err)) {
                    quotaDegraded = true;
                    if (process.env.NODE_ENV !== "test" && i + 1 < modelsToTry.length) {
                        await sleepMs(300);
                    }
                }
                console.warn(`[GROQ] Model ${targetModel} failed (${status || err?.message}), attempting next resilient model`);
            }
        }
    }

    // Tier 3: Tertiary Gemini Fallback
    throwIfAborted(signal);
    const geminiModel = resolveGeminiModel();
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "mock_key_for_dev") {
        attemptedModels.push(geminiModel);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
            const geminiPromise = ai.models.generateContent({
                model: geminiModel,
                contents: prompt,
            });
            const geminiRes: any = await raceWithTimeoutAndAbort(
                geminiPromise,
                5000,
                "Gemini fallback timed out",
                signal
            );
            const text = geminiRes.text?.trim() || "";
            if (text) {
                console.log(`[GROQ] Recovered successfully using tertiary Gemini (${geminiModel}) fallback`);
                recordProviderTelemetry({
                    requestedModel,
                    resolvedModel: geminiModel,
                    attemptedModels,
                    providerFallbackCount: Math.max(0, attemptedModels.length - 1),
                    quotaDegraded,
                    timestamp: Date.now(),
                });
                return text;
            }
        } catch (geminiErr: any) {
            if (isAbortError(geminiErr) || signal?.aborted) {
                throw createAbortError();
            }
            if (isUnsupportedModelError(geminiErr)) {
                markModelUnsupported(geminiModel);
            } else if (isRateLimitError(geminiErr)) {
                quotaDegraded = true;
            }
            console.error("[GROQ] Tertiary Gemini fallback failed:", geminiErr?.message);
        }
    }

    // If mock environment or all failed, return a sensible default for test runs
    if (!client && (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "mock_key_for_dev")) {
        recordProviderTelemetry({
            requestedModel,
            resolvedModel: "MOCK_LOCAL_TEST",
            attemptedModels,
            providerFallbackCount: 0,
            quotaDegraded,
            timestamp: Date.now(),
        });
        return "Acknowledged. Operating in local test environment.";
    }

    recordProviderTelemetry({
        requestedModel,
        resolvedModel: "NONE",
        attemptedModels,
        providerFallbackCount: Math.max(0, attemptedModels.length - 1),
        quotaDegraded,
        timestamp: Date.now(),
    });
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
    model,
}: {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    max_tokens?: number;
    model?: string;
}) {
    if (mockGroqChatFn) {
        return mockGroqChatFn({ messages, temperature, max_tokens, model });
    }
    const client = getGroqClient();
    if (!client) {
        throw new Error("Groq API key not configured for streaming");
    }

    const resolvedModel = resolveGroqModel(model);
    try {
        return await client.chat.completions.create({
            model: resolvedModel,
            messages,
            temperature,
            max_tokens,
            stream: true,
        });
    } catch (err: any) {
        if (isUnsupportedModelError(err)) {
            markModelUnsupported(resolvedModel);
        }
        const fallbackModel =
            resolveFallbackChain(model).find((m) => m !== resolvedModel) || resolveGroqModel();
        console.warn(`[GROQ_STREAM] Model ${resolvedModel} failed, falling back to ${fallbackModel}`);
        return await client.chat.completions.create({
            model: fallbackModel,
            messages,
            temperature,
            max_tokens,
            stream: true,
        });
    }
}

export interface GroqTextStreamOptions {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    max_tokens?: number;
    model?: string;
    signal?: AbortSignal;
    onDelta?: (delta: string) => void | Promise<void>;
}

/**
 * Normalized Stage 3 token-streaming LLM call:
 * - Strips <think>/<planning> blocks incrementally via StreamingThinkSanitizer
 * - Propagates AbortSignal
 * - Falls back across Groq chain + Gemini streaming ONLY before any delta is emitted
 * - Throws StreamInterruptedError if a stream fails after partial output was emitted
 */
export async function groqChatTextStream({
    messages,
    temperature = 0.7,
    max_tokens = 700,
    model,
    signal,
    onDelta,
}: GroqTextStreamOptions): Promise<string> {
    throwIfAborted(signal);

    if (mockGroqTextStreamFn) {
        return await mockGroqTextStreamFn({
            messages,
            temperature,
            max_tokens,
            model,
            signal,
            onDelta,
        });
    }

    if (mockGroqChatFn) {
        const raw = await mockGroqChatFn({ messages, temperature, max_tokens, model });
        throwIfAborted(signal);
        const sanitizer = new StreamingThinkSanitizer();
        const chunkSize = 24;
        let fullText = "";
        for (let i = 0; i < raw.length; i += chunkSize) {
            throwIfAborted(signal);
            const clean = sanitizer.push(raw.slice(i, i + chunkSize));
            if (clean) {
                fullText += clean;
                await onDelta?.(clean);
            }
        }
        const tail = sanitizer.flush();
        if (tail) {
            fullText += tail;
            await onDelta?.(tail);
        }
        return fullText.trim();
    }

    const client = getGroqClient();
    const requestedModel = (model || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim();
    const attemptedModels: string[] = [];
    let quotaDegraded = false;

    if (client) {
        const modelsToTry = resolveFallbackChain(model);
        let authFailed = false;

        for (let i = 0; i < modelsToTry.length; i++) {
            if (authFailed) break;
            throwIfAborted(signal);
            const targetModel = modelsToTry[i];
            attemptedModels.push(targetModel);
            let emittedAny = false;
            let fullText = "";

            try {
                const requestPayload: any = {
                    model: targetModel,
                    messages,
                    temperature,
                    max_tokens,
                    stream: true,
                };
                if (targetModel.includes("gpt-oss")) {
                    requestPayload.reasoning_format = "hidden";
                }

                const stream: any = await raceWithTimeoutAndAbort(
                    client.chat.completions.create(requestPayload, signal ? { signal } : undefined),
                    6000,
                    `Groq stream init to ${targetModel} timed out`,
                    signal
                );

                const sanitizer = new StreamingThinkSanitizer();
                for await (const chunk of stream) {
                    throwIfAborted(signal);
                    const rawDelta = chunk?.choices?.[0]?.delta?.content;
                    if (typeof rawDelta === "string" && rawDelta.length > 0) {
                        const clean = sanitizer.push(rawDelta);
                        if (clean) {
                            emittedAny = true;
                            fullText += clean;
                            await onDelta?.(clean);
                        }
                    }
                }
                const tail = sanitizer.flush();
                if (tail) {
                    emittedAny = true;
                    fullText += tail;
                    await onDelta?.(tail);
                }

                const finalTrimmed = fullText.trim();
                if (finalTrimmed) {
                    recordProviderTelemetry({
                        requestedModel,
                        resolvedModel: targetModel,
                        attemptedModels,
                        providerFallbackCount: Math.max(0, attemptedModels.length - 1),
                        quotaDegraded,
                        timestamp: Date.now(),
                    });
                    return finalTrimmed;
                }
            } catch (err: any) {
                if (isAbortError(err) || signal?.aborted) {
                    throw createAbortError();
                }
                if (emittedAny) {
                    throw new StreamInterruptedError(fullText, err);
                }
                const status = err?.status;
                if (status === 401 || status === 403) {
                    authFailed = true;
                    console.warn(`[GROQ_STREAM] Auth failure (${status}) on ${targetModel}`);
                    break;
                }
                if (isUnsupportedModelError(err)) {
                    markModelUnsupported(targetModel);
                } else if (isRateLimitError(err)) {
                    quotaDegraded = true;
                    if (process.env.NODE_ENV !== "test" && i + 1 < modelsToTry.length) {
                        await sleepMs(300);
                    }
                }
                console.warn(`[GROQ_STREAM] Model ${targetModel} failed (${status || err?.message}), falling back`);
            }
        }
    }

    // Tier 3: Tertiary Gemini Streaming Fallback
    throwIfAborted(signal);
    const geminiModel = resolveGeminiModel();
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "mock_key_for_dev") {
        attemptedModels.push(geminiModel);
        let emittedAny = false;
        let fullText = "";
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
            const geminiStream: any = await raceWithTimeoutAndAbort(
                ai.models.generateContentStream({
                    model: geminiModel,
                    contents: prompt,
                }),
                6000,
                "Gemini stream init timed out",
                signal
            );
            const sanitizer = new StreamingThinkSanitizer();
            for await (const chunk of geminiStream) {
                throwIfAborted(signal);
                const rawDelta = typeof chunk?.text === "string" ? chunk.text : "";
                if (rawDelta) {
                    const clean = sanitizer.push(rawDelta);
                    if (clean) {
                        emittedAny = true;
                        fullText += clean;
                        await onDelta?.(clean);
                    }
                }
            }
            const tail = sanitizer.flush();
            if (tail) {
                emittedAny = true;
                fullText += tail;
                await onDelta?.(tail);
            }
            const finalTrimmed = fullText.trim();
            if (finalTrimmed) {
                recordProviderTelemetry({
                    requestedModel,
                    resolvedModel: geminiModel,
                    attemptedModels,
                    providerFallbackCount: Math.max(0, attemptedModels.length - 1),
                    quotaDegraded,
                    timestamp: Date.now(),
                });
                return finalTrimmed;
            }
        } catch (geminiErr: any) {
            if (isAbortError(geminiErr) || signal?.aborted) {
                throw createAbortError();
            }
            if (emittedAny) {
                throw new StreamInterruptedError(fullText, geminiErr);
            }
            if (isUnsupportedModelError(geminiErr)) {
                markModelUnsupported(geminiModel);
            } else if (isRateLimitError(geminiErr)) {
                quotaDegraded = true;
            }
            console.error("[GROQ_STREAM] Tertiary Gemini streaming fallback failed:", geminiErr?.message);
        }
    }

    if (!client && (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "mock_key_for_dev")) {
        const offlineMsg = "Acknowledged. Operating in local test environment.";
        await onDelta?.(offlineMsg);
        return offlineMsg;
    }

    throw new Error("All LLM streaming models failed across Groq and Gemini tiers");
}
