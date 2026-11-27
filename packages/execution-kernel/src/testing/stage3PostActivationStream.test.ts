import test from "node:test";
import assert from "node:assert/strict";
import { SseStreamParser } from "../../../../apps/web/features/chat/sseStreamParser";

test("Stage 3 Increment 3.6: Post-Activation Voice SSE Consumer & Sentence Stream Hygiene", async (t) => {
  await t.test("3.6a: SseStreamParser extracts assistant_delta prose for TTS without leaking status or JSON frames", () => {
    const parser = new SseStreamParser();
    const ssePayload =
      'id: 1\ndata: {"type":"status","status":"planning","message":"Planning..."}\n\n' +
      'id: 2\ndata: {"type":"assistant_delta","text":"First sentence. "}\n\n' +
      'id: 3\ndata: {"type":"assistant_delta","text":"Second sentence."}\n\n' +
      'id: 4\ndata: {"type":"assistant_final","text":"First sentence. Second sentence.","persisted":true}\n\n';

    const events = [...parser.push(ssePayload), ...parser.flush()];
    const spoken = events
      .filter((e) => e.type === "assistant_delta")
      .map((e) => e.text)
      .join("");

    assert.equal(spoken, "First sentence. Second sentence.");
    assert.ok(!spoken.includes("Planning..."));
    assert.ok(!spoken.includes("{"));
  });

  await t.test("3.6b: Post-activation voice error event surfaces cleanly without queuing error text to TTS", () => {
    const parser = new SseStreamParser();
    const events = [
      ...parser.push('id: 1\ndata: {"type":"error","message":"Upstream timeout","code":"EXECUTION_ERROR"}\n\n'),
      ...parser.flush(),
    ];
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "error");
    assert.equal(events[0].message, "Upstream timeout");
  });
});
