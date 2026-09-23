import test from "node:test";
import assert from "node:assert/strict";
import { Supervisor } from "../orchestration/supervisor/Supervisor";

test("V2 Concurrent Instant Semantic Filler Timing & Concurrency Gate", async () => {
  const supervisor = Supervisor.createDefault();
  const chunks: Array<{ text: string; timeMs: number }> = [];
  const t0 = Date.now();

  const result = await supervisor.processRequest({
    userId: "u_verify_stream",
    userName: "Daksh",
    message: "Can you create a task to boil the milk in 2 mins",
    onChunk: (chunk: string) => {
      const elapsed = Date.now() - t0;
      chunks.push({ text: chunk, timeMs: elapsed });
      console.log(`[STREAM CHUNK @ ${elapsed}ms]: "${chunk.replace(/\n/g, "\\n")}"`);
    },
  });

  console.log(`Total duration: ${Date.now() - t0}ms, Total chunks: ${chunks.length}`);
  assert.ok(chunks.length >= 2, `Must emit at least 2 distinct chunks (filler + result), got ${chunks.length}`);

  const chunk0 = chunks[0];
  const chunk1 = chunks[1];

  console.log(`Chunk 0 Latency: ${chunk0.timeMs}ms`);
  console.log(`Chunk 1 Latency: ${chunk1.timeMs}ms`);
  console.log(`Concurrency Separation Gap: ${chunk1.timeMs - chunk0.timeMs}ms`);

  // Verify Chunk 0 is an instant filler delivered rapidly (< 800ms)
  assert.ok(chunk0.timeMs < 1000, `Chunk 0 must arrive within 1000ms, got ${chunk0.timeMs}ms`);
  // Verify Chunk 0 has trailing sentence boundary
  assert.ok(chunk0.text.endsWith(".\n\n"), `Chunk 0 must end with sentence boundary .\\n\\n, got "${chunk0.text}"`);

  // Verify concurrency gap between filler and final result
  const gap = chunk1.timeMs - chunk0.timeMs;
  assert.ok(gap > 200, `Chunk 1 must arrive after a positive concurrency gap (> 200ms), got gap: ${gap}ms`);
});
