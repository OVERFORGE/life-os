import test from "node:test";
import assert from "node:assert/strict";
import {
  SseStreamParser,
  createInitialChatStreamState,
  reduceChatStreamEvent,
  formatStatusPhaseLabel,
} from "../../../../apps/web/features/chat/sseStreamParser";

test("Stage 3 Increment 3.5: Web Chat SSE Parser & Transcript Reducer", async (t) => {
  await t.test("3.5a: Handles arbitrary TCP split chunks including split 'data:' prefix and CRLF boundaries", () => {
    const parser = new SseStreamParser();
    const raw =
      "id: 1\r\n" +
      'data: {"type":"status","status":"planning","message":"Planning..."}\r\n\r\n' +
      ": keepalive\r\n\r\n" +
      "id: 2\n" +
      'data: {"type":"assistant_delta","text":"Hello "}\n\n' +
      "id: 3\n" +
      'data: {"type":"assistant_delta","text":"world!"}\n\n';

    // Feed 3 characters at a time to simulate worst-case TCP fragmentation
    let state = createInitialChatStreamState();
    for (let i = 0; i < raw.length; i += 3) {
      const events = parser.push(raw.slice(i, i + 3));
      for (const ev of events) {
        state = reduceChatStreamEvent(state, ev);
      }
    }
    for (const ev of parser.flush()) {
      state = reduceChatStreamEvent(state, ev);
    }

    assert.equal(state.content, "Hello world!");
    assert.equal(state.statusPhase, "planning");
    assert.equal(state.lastSeq, 3);
  });

  await t.test("3.5b: Flushes trailing SSE block on EOF even without trailing double newline", () => {
    const parser = new SseStreamParser();
    let state = createInitialChatStreamState();
    for (const ev of parser.push('data: {"type":"assistant_delta","text":"Partial"}')) {
      state = reduceChatStreamEvent(state, ev);
    }
    assert.equal(state.content, "", "Unterminated frame must not leak into prose prematurely");

    for (const ev of parser.flush()) {
      state = reduceChatStreamEvent(state, ev);
    }
    assert.equal(state.content, "Partial");
  });

  await t.test("3.5c: Reconciles assistant_final authoritatively and isolates error/cancelled states from prose", () => {
    let state = createInitialChatStreamState();
    state = reduceChatStreamEvent(state, { type: "assistant_delta", text: "Draft ", seq: 1 });
    state = reduceChatStreamEvent(state, {
      type: "assistant_final",
      text: "Sanitized final response.",
      persisted: true,
      seq: 2,
    });
    state = reduceChatStreamEvent(state, { type: "status", status: "completed", message: "Completed", seq: 3 });

    assert.equal(state.content, "Sanitized final response.");
    assert.equal(state.turnStatus, "completed");

    // Duplicate/stale sequence numbers are ignored
    state = reduceChatStreamEvent(state, { type: "assistant_delta", text: "STALE", seq: 2 });
    assert.equal(state.content, "Sanitized final response.");

    // Mid-stream error sets turnStatus='failed' and errorMessage without appending error string into prose
    let errState = createInitialChatStreamState();
    errState = reduceChatStreamEvent(errState, { type: "assistant_delta", text: "Partial answer", seq: 1 });
    errState = reduceChatStreamEvent(errState, { type: "error", message: "Provider disconnected", seq: 2 });
    assert.equal(errState.content, "Partial answer");
    assert.equal(errState.turnStatus, "failed");
    assert.equal(errState.errorMessage, "Provider disconnected");
  });

  await t.test("3.5d: formatStatusPhaseLabel maps all Stage 3 lifecycle phases cleanly", () => {
    assert.equal(formatStatusPhaseLabel("planning"), "Planning next steps…");
    assert.equal(formatStatusPhaseLabel("adapting"), "Adjusting approach…");
    assert.equal(formatStatusPhaseLabel("synthesizing"), "Putting your answer together…");
    assert.equal(formatStatusPhaseLabel("cancelled"), "Stopped");
  });
});
