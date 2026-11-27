import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { LocalSentenceTransformerEmbeddingProvider } from "../memory/EmbeddingProvider";
import { MemoryFormationPipeline } from "../memory/MemoryFormationPipeline";
import { MemoryRepository } from "../memory/MemoryRepository";
import { DEFAULT_MEMORY_POLICY } from "../memory/PersonalMemoryContracts";

const SHOULD_RUN_LIVE =
  process.env.RUN_STAGE4_LIVE_SMOKE === "true" &&
  Boolean(process.env.GROQ_API_KEY) &&
  process.env.GROQ_API_KEY !== "mock_key_for_dev";

describe("Stage 4 Opt-In Live Memory Smoke Suite", () => {
  it("runs real WASM 384-dim embeddings and live Groq semantic extraction when explicitly opted in", { skip: !SHOULD_RUN_LIVE }, async () => {
    const provider = new LocalSentenceTransformerEmbeddingProvider();
    const repo = new MemoryRepository(DEFAULT_MEMORY_POLICY, provider);
    const pipeline = new MemoryFormationPipeline(repo, provider);
    const userId = new mongoose.Types.ObjectId().toString();

    const res = await pipeline.processConversationTurn({
      userId,
      conversationId: "conv_live_smoke",
      userMessage: "I work best on deep architecture tasks between 7am and 10am and avoid caffeine after 2pm.",
      assistantResponse: "Understood, I will keep morning deep-work blocks protected.",
    });

    assert.ok(res.storedCount >= 1, "Live Groq extraction must extract at least 1 memory");
    const found = await repo.search({ userId, queryText: "morning deep work caffeine", limit: 5 });
    assert.ok(found.length >= 1);
  });
});
