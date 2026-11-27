/**
 * Canonical Model & Provider Configuration Registry (Stage 0)
 *
 * Single source of truth for Groq, Gemini, and Whisper model IDs across
 * the execution kernel and runtime surfaces. Prevents deprecated HTTP 404
 * model cascades and isolates per-process unsupported models via a circuit breaker.
 */

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_GROQ_FAST_MODEL = "qwen/qwen3.8-27b";
export const DEFAULT_GROQ_FALLBACK_MODELS: readonly string[] = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
];

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_WHISPER_MODEL = "whisper-large-v3-turbo";

/**
 * Models verified deprecated / returning HTTP 404 on active provider endpoints.
 */
export const DEPRECATED_MODEL_IDS: ReadonlySet<string> = new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gemini-2.0-flash",
]);

export interface ModelOption {
  id: string;
  name: string;
}

export const CANONICAL_CHAT_MODELS: readonly ModelOption[] = [
  { id: "openai/gpt-oss-120b", name: "GPT OSS 120B (Aven Flagship)" },
  { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B (Fast & Intelligent)" },
  { id: "openai/gpt-oss-20b", name: "GPT OSS 20B (Instant)" },
];

export interface ProviderExecutionTelemetry {
  requestedModel: string;
  resolvedModel: string;
  attemptedModels: string[];
  providerFallbackCount: number;
  quotaDegraded: boolean;
  timestamp: number;
}

const circuitBrokenModels = new Set<string>();
const deprecationWarnedModels = new Set<string>();
let lastProviderTelemetry: ProviderExecutionTelemetry | null = null;

export function isModelDeprecated(modelId: string | undefined | null): boolean {
  if (!modelId) return false;
  return DEPRECATED_MODEL_IDS.has(modelId.trim());
}

export function isModelCircuitBroken(modelId: string | undefined | null): boolean {
  if (!modelId) return false;
  return circuitBrokenModels.has(modelId.trim());
}

export function markModelUnsupported(modelId: string): void {
  const trimmed = (modelId || "").trim();
  if (!trimmed) return;
  if (!circuitBrokenModels.has(trimmed)) {
    circuitBrokenModels.add(trimmed);
    console.warn(`[MODEL_REGISTRY] Circuit-breaking unsupported/404 model for this process: "${trimmed}"`);
  }
}

export function resetModelCircuitBreakerForTests(): void {
  circuitBrokenModels.clear();
  deprecationWarnedModels.clear();
  lastProviderTelemetry = null;
}

export function recordProviderTelemetry(telemetry: ProviderExecutionTelemetry): void {
  lastProviderTelemetry = telemetry;
}

export function getLastProviderTelemetry(): ProviderExecutionTelemetry | null {
  return lastProviderTelemetry;
}

function warnDeprecatedOnce(modelId: string, replacement: string): void {
  if (!deprecationWarnedModels.has(modelId)) {
    deprecationWarnedModels.add(modelId);
    console.warn(
      `[MODEL_REGISTRY] Deprecated model "${modelId}" requested; remapping to "${replacement}".`
    );
  }
}

/**
 * Resolves the canonical primary Groq model, honoring process.env.GROQ_MODEL
 * unless it is deprecated or circuit-broken.
 */
export function resolveGroqModel(requestedModel?: string | null): string {
  const envModel = (process.env.GROQ_MODEL || "").trim();
  const safeEnvModel =
    envModel && !isModelDeprecated(envModel) && !isModelCircuitBroken(envModel)
      ? envModel
      : DEFAULT_GROQ_MODEL;

  const trimmedReq = (requestedModel || "").trim();
  if (trimmedReq) {
    if (isModelDeprecated(trimmedReq) || isModelCircuitBroken(trimmedReq)) {
      warnDeprecatedOnce(trimmedReq, safeEnvModel);
      return safeEnvModel;
    }
    return trimmedReq;
  }

  if (envModel && (isModelDeprecated(envModel) || isModelCircuitBroken(envModel))) {
    warnDeprecatedOnce(envModel, DEFAULT_GROQ_MODEL);
    return DEFAULT_GROQ_MODEL;
  }

  return safeEnvModel;
}

/**
 * Resolves the fast/utility Groq model for background summarization and optional fillers.
 */
export function resolveFastModel(): string {
  const envFast = (process.env.GROQ_FAST_MODEL || "").trim();
  if (envFast && !isModelDeprecated(envFast) && !isModelCircuitBroken(envFast)) {
    return envFast;
  }
  if (!isModelCircuitBroken(DEFAULT_GROQ_FAST_MODEL)) {
    return DEFAULT_GROQ_FAST_MODEL;
  }
  return resolveGroqModel();
}

/**
 * Builds an ordered, deduplicated Groq fallback chain with deprecated and
 * circuit-broken models excluded.
 */
export function resolveFallbackChain(requestedModel?: string | null): string[] {
  const primary = resolveGroqModel(requestedModel);
  const envList = (process.env.GROQ_FALLBACK_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const rawChain = [
    primary,
    ...(envList.length > 0 ? envList : DEFAULT_GROQ_FALLBACK_MODELS),
  ];

  const deduped: string[] = [];
  for (const candidate of rawChain) {
    if (isModelDeprecated(candidate) || isModelCircuitBroken(candidate)) {
      continue;
    }
    if (!deduped.includes(candidate)) {
      deduped.push(candidate);
    }
  }

  if (deduped.length === 0) {
    // All configured candidates were circuit-broken; return non-deprecated defaults as last resort
    return [...DEFAULT_GROQ_FALLBACK_MODELS];
  }
  return deduped;
}

export function resolveGeminiModel(): string {
  const envGemini = (process.env.GEMINI_MODEL || "").trim();
  if (envGemini && !isModelDeprecated(envGemini) && !isModelCircuitBroken(envGemini)) {
    return envGemini;
  }
  return DEFAULT_GEMINI_MODEL;
}

export function resolveWhisperModel(): string {
  const envWhisper = (process.env.WHISPER_MODEL || "").trim();
  return envWhisper || DEFAULT_WHISPER_MODEL;
}

/**
 * FastSemanticFiller is disabled by default during Stage 0-2 stability work
 * so speculative filler calls cannot starve primary reasoning RPM/TPM quota.
 */
export function isFastSemanticFillerEnabled(): boolean {
  return process.env.ENABLE_FAST_SEMANTIC_FILLER === "true";
}
