import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GROQ_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_WHISPER_MODEL,
  DEPRECATED_MODEL_IDS,
  resolveGroqModel,
  resolveFastModel,
  resolveFallbackChain,
  resolveGeminiModel,
  resolveWhisperModel,
  isFastSemanticFillerEnabled,
  markModelUnsupported,
  isModelCircuitBroken,
  resetModelCircuitBreakerForTests,
} from "../shared/modelRegistry";
import { FastSemanticFiller } from "../orchestration/semantic/FastSemanticFiller";

describe("Stage 0: Canonical Model & Provider Configuration Registry", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetModelCircuitBreakerForTests();
    delete process.env.GROQ_MODEL;
    delete process.env.GROQ_FAST_MODEL;
    delete process.env.GROQ_FALLBACK_MODELS;
    delete process.env.GEMINI_MODEL;
    delete process.env.WHISPER_MODEL;
    delete process.env.ENABLE_FAST_SEMANTIC_FILLER;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetModelCircuitBreakerForTests();
  });

  it("returns active canonical defaults with zero deprecated 404 models", () => {
    assert.equal(resolveGroqModel(), DEFAULT_GROQ_MODEL);
    assert.equal(resolveGeminiModel(), DEFAULT_GEMINI_MODEL);
    assert.equal(resolveWhisperModel(), DEFAULT_WHISPER_MODEL);

    const chain = resolveFallbackChain();
    assert.ok(chain.length >= 2);
    for (const model of chain) {
      assert.equal(
        DEPRECATED_MODEL_IDS.has(model),
        false,
        `Fallback chain must not include deprecated model "${model}"`
      );
    }
  });

  it("remaps deprecated model overrides from stale clients or .env", () => {
    process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
    assert.equal(resolveGroqModel(), DEFAULT_GROQ_MODEL);
    assert.equal(resolveGroqModel("llama-3.1-8b-instant"), DEFAULT_GROQ_MODEL);

    process.env.GEMINI_MODEL = "gemini-2.0-flash";
    assert.equal(resolveGeminiModel(), DEFAULT_GEMINI_MODEL);
  });

  it("circuit-breaks unsupported 404 models for the remainder of the process", () => {
    markModelUnsupported("openai/gpt-oss-120b");
    assert.equal(isModelCircuitBroken("openai/gpt-oss-120b"), true);

    const chain = resolveFallbackChain("openai/gpt-oss-120b");
    assert.equal(chain.includes("openai/gpt-oss-120b"), false);
    assert.equal(chain[0], "qwen/qwen3.8-27b");
    assert.equal(resolveFastModel(), "qwen/qwen3.8-27b");
  });

  it("disables FastSemanticFiller by default to prevent quota starvation", async () => {
    assert.equal(isFastSemanticFillerEnabled(), false);
    const filler = await FastSemanticFiller.getInstance().generateFiller("Schedule deep work tomorrow morning");
    assert.equal(filler, null);
  });
});
