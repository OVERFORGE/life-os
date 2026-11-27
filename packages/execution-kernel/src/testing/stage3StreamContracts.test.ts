import test from "node:test";
import assert from "node:assert/strict";
import {
  AvenExecutionStatusPhase,
  AvenStreamEvent,
  StreamingThinkSanitizer,
  createStreamTerminalGuard,
} from "../orchestration/contracts/AvenStreamContracts";

test("Stage 3 Increment 3.1: Canonical Stream Contracts, Think Sanitizer & Terminal Guard", async (t) => {
  await t.test("3.1a: StreamingThinkSanitizer strips split <think> and <planning> blocks across chunk boundaries", () => {
    const sanitizer = new StreamingThinkSanitizer();
    const chunks = [
      "  <thi",
      "nk>internal secret reasoning",
      " that must never leak</thi",
      "nk>\n\nHello ",
      "Daksh! <plan",
      "ning>step1</plan",
      "ning>Your tasks are ready.",
    ];

    let visible = "";
    for (const c of chunks) {
      visible += sanitizer.push(c);
    }
    visible += sanitizer.flush();

    assert.equal(visible, "Hello Daksh! Your tasks are ready.");
    assert.ok(!visible.includes("internal secret"));
    assert.ok(!visible.includes("step1"));
  });

  await t.test("3.1b: StreamingThinkSanitizer preserves legitimate '<' characters and discards unclosed <think> on EOF", () => {
    const sanitizer1 = new StreamingThinkSanitizer();
    const out1 = sanitizer1.push("2 < 5 and x <") + sanitizer1.push(" 10") + sanitizer1.flush();
    assert.equal(out1, "2 < 5 and x < 10");

    const sanitizer2 = new StreamingThinkSanitizer();
    const out2 = sanitizer2.push("Answer prefix. <think>unclosed reasoning") + sanitizer2.flush();
    assert.equal(out2, "Answer prefix. ");
  });

  await t.test("3.1c: createStreamTerminalGuard enforces strictly one terminal outcome", () => {
    const guard = createStreamTerminalGuard();
    assert.equal(guard.terminated, false);
    assert.equal(guard.tryFinalize("completed"), true);
    assert.equal(guard.terminated, true);
    assert.equal(guard.outcome, "completed");

    // Subsequent terminal transitions must be rejected
    assert.equal(guard.tryFinalize("failed"), false);
    assert.equal(guard.tryFinalize("cancelled"), false);
    assert.equal(guard.outcome, "completed");
  });

  await t.test("3.1d: Extended AvenStreamEvent and AvenExecutionStatusPhase types accept Stage 3 lifecycle payloads", () => {
    const phases: AvenExecutionStatusPhase[] = [
      "understanding",
      "planning",
      "executing_step",
      "adapting",
      "synthesizing",
      "completed",
      "cancelled",
      "failed",
    ];
    assert.equal(phases.length, 8);

    const events: AvenStreamEvent[] = [
      {
        type: "step_progress",
        stepId: "step_1",
        capabilityURN: "lifeos.tasks.query",
        phase: "started",
        humanMessage: "Checking your tasks",
        requestId: "req_1",
        executionId: "exec_1",
        seq: 1,
        timestamp: 1000,
      },
      {
        type: "assistant_final",
        text: "You have 2 tasks today.",
        persisted: true,
        requestId: "req_1",
        seq: 2,
        timestamp: 1001,
      },
      {
        type: "cancelled",
        reason: "user_aborted",
        partialText: "You have",
        persisted: true,
        requestId: "req_1",
        seq: 3,
        timestamp: 1002,
      },
    ];
    assert.equal(events[0].type, "step_progress");
    assert.equal(events[1].type, "assistant_final");
    assert.equal(events[2].type, "cancelled");
  });
});
