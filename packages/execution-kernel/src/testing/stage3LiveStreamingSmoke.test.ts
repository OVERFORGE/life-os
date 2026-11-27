import test from "node:test";
import assert from "node:assert/strict";
import { groqChatTextStream, isAbortError } from "../shared/groq";

test("Stage 3 Live Provider Streaming Smoke (Groq/Gemini + Abort)", async (t) => {
  const hasGroq = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "mock_key_for_dev");
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "mock_key_for_dev");

  if (!hasGroq && !hasGemini) {
    console.log("[STAGE3_LIVE_SMOKE] STATUS=BLOCKED reason=No live GROQ_API_KEY or GEMINI_API_KEY configured");
    t.skip("BLOCKED: No live GROQ_API_KEY or GEMINI_API_KEY configured");
    return;
  }

  try {
    const deltas: string[] = [];
    const reply = await groqChatTextStream({
      messages: [
        { role: "system", content: "Reply in one short sentence." },
        { role: "user", content: "Say hello to Daksh." },
      ],
      max_tokens: 80,
      onDelta: (d) => {
        deltas.push(d);
      },
    });
    assert.ok(reply.length > 0, "Expected non-empty live streamed response");
    assert.ok(deltas.length >= 1, "Expected at least one streamed delta");

    // Live mid-stream abort check
    const ac = new AbortController();
    let abortedCorrectly = false;
    try {
      await groqChatTextStream({
        messages: [{ role: "user", content: "Write a 200-word essay on focus." }],
        max_tokens: 300,
        signal: ac.signal,
        onDelta: () => {
          ac.abort();
        },
      });
    } catch (err) {
      if (isAbortError(err)) abortedCorrectly = true;
      else throw err;
    }
    assert.equal(abortedCorrectly, true, "Live stream must abort cleanly on AbortSignal");
    console.log(`[STAGE3_LIVE_SMOKE] STATUS=PASSED deltas=${deltas.length}`);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
      console.log(`[STAGE3_LIVE_SMOKE] STATUS=RATE_LIMITED detail=${msg}`);
      t.skip(`RATE_LIMITED: ${msg}`);
      return;
    }
    console.error(`[STAGE3_LIVE_SMOKE] STATUS=FAILED detail=${msg}`);
    throw err;
  }
});
