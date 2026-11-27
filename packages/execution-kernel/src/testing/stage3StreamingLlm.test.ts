import test from "node:test";
import assert from "node:assert/strict";
import {
  groqChat,
  groqChatTextStream,
  setMockGroqChat,
  setMockGroqTextStream,
  StreamInterruptedError,
  isAbortError,
} from "../shared/groq";
import { GroundedResponseGenerator, buildExecutionEvidencePackage } from "../orchestration/grounding/GroundedResponseGenerator";

test("Stage 3 Increment 3.2: Streaming LLM Adapter, Think Stripping, Abort & Grounded Synthesis", async (t) => {
  await t.test("3.2a: groqChatTextStream streams clean chunks and strips <think> blocks using setMockGroqChat", async () => {
    setMockGroqChat(async () => "<think>hidden thought</think>Hello Daksh, you have 2 tasks scheduled today.");
    try {
      const deltas: string[] = [];
      const final = await groqChatTextStream({
        messages: [{ role: "user", content: "Hi" }],
        onDelta: (d) => {
          deltas.push(d);
        },
      });
      assert.ok(deltas.length >= 2, "Expected multiple streamed chunks");
      assert.equal(deltas.join("").trim(), "Hello Daksh, you have 2 tasks scheduled today.");
      assert.equal(final, "Hello Daksh, you have 2 tasks scheduled today.");
      assert.ok(!final.includes("hidden thought"));
    } finally {
      setMockGroqChat(undefined);
    }
  });

  await t.test("3.2b: groqChatTextStream propagates AbortSignal and stops mid-stream", async () => {
    const ac = new AbortController();
    setMockGroqTextStream(async ({ signal, onDelta }) => {
      await onDelta?.("Part 1 ");
      ac.abort();
      if (signal?.aborted) {
        const err = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      }
      await onDelta?.("Part 2");
      return "Part 1 Part 2";
    });

    try {
      const deltas: string[] = [];
      await assert.rejects(
        () =>
          groqChatTextStream({
            messages: [{ role: "user", content: "Stream" }],
            signal: ac.signal,
            onDelta: (d) => {
              deltas.push(d);
            },
          }),
        (err) => isAbortError(err)
      );
      assert.deepEqual(deltas, ["Part 1 "]);
    } finally {
      setMockGroqTextStream(undefined);
    }
  });

  await t.test("3.2c: groqChat rejects immediately when signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(
      () => groqChat({ messages: [{ role: "user", content: "hi" }], signal: ac.signal }),
      (err) => isAbortError(err)
    );
  });

  await t.test("3.2d: GroundedResponseGenerator.synthesizeFromEvidence streams chunks and preserves StreamInterruptedError", async () => {
    const evidence = buildExecutionEvidencePackage({
      objective: "What tasks do I have?",
      steps: [
        {
          stepId: "s1",
          capabilityURN: "lifeos.tasks.query",
          actionType: "lifeos.tasks.query",
          status: "SUCCESS",
          success: true,
          data: { items: [{ title: "Review Stage 3", status: "pending" }], totalCount: 1 },
        },
      ],
    });

    const deltas: string[] = [];
    const text = await GroundedResponseGenerator.getInstance().synthesizeFromEvidence(evidence, {
      llmStream: async (_prompt, onDelta) => {
        await onDelta("You have one ");
        await onDelta("pending task: Review Stage 3.");
        return "You have one pending task: Review Stage 3.";
      },
      onDelta: (d) => {
        deltas.push(d);
      },
    });
    assert.deepEqual(deltas, ["You have one ", "pending task: Review Stage 3."]);
    assert.equal(text, "You have one pending task: Review Stage 3.");

    // Mid-stream interruption after partial emission must surface StreamInterruptedError (never silently fake fallback)
    await assert.rejects(
      () =>
        GroundedResponseGenerator.getInstance().synthesizeFromEvidence(evidence, {
          llmStream: async (_prompt, onDelta) => {
            await onDelta("Partial ");
            throw new Error("Socket reset");
          },
          onDelta: () => {},
        }),
      (err) => err instanceof StreamInterruptedError
    );
  });
});
