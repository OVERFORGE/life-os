import test from "node:test";
import assert from "node:assert/strict";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { IterativeActionDispatcher } from "../orchestration/kernel/IterativeActionDispatcher";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { setMockGroqChat, setMockGroqTextStream, isAbortError } from "../shared/groq";
import { AvenStreamEvent } from "../orchestration/contracts/AvenStreamContracts";
import { createMockAuditModel } from "./helpers/mockAuditModel";

test("Stage 3 Increment 3.3: Supervisor & Dispatcher Stream Parity, Filler Suppression & AbortSignal", async (t) => {
  await t.test("3.3a: CONVERSATIONAL_LLM streams incremental assistant_delta in events mode with zero filler boilerplate", async () => {
    const prevKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "test_key_for_mock_stream";
    registerDefaultActionAdapters(ActionAdapterRegistry.getInstance());

    // Mock SemanticIntentInterpreter -> CONVERSATIONAL_LLM
    setMockGroqChat(async () =>
      JSON.stringify({
        turnId: "t_conv_1",
        rawMessage: "Hello Aven",
        primaryClassification: "CONVERSATIONAL_SOCIAL",
        confidence: 0.99,
        operations: [],
        relevanceDomains: [],
      })
    );
    setMockGroqTextStream(async ({ onDelta }) => {
      await onDelta?.("Hello ");
      await onDelta?.("Daksh!");
      return "Hello Daksh!";
    });

    try {
      const sup = Supervisor.createDefault(KernelCapabilityService.getInstance());
      const events: AvenStreamEvent[] = [];
      const chunks: string[] = [];

      const res = await sup.processRequest({
        userId: "u_s3_conv",
        message: "Hello Aven",
        streamMode: "events",
        onEvent: (ev) => events.push(ev),
        onChunk: (c) => chunks.push(c),
      });

      assert.equal(res.response, "Hello Daksh!");
      const deltas = events.filter((e): e is Extract<AvenStreamEvent, { type: "assistant_delta" }> => e.type === "assistant_delta");
      assert.deepEqual(
        deltas.map((d) => d.text),
        ["Hello ", "Daksh!"]
      );
      // No FastSemanticFiller boilerplate in events mode
      assert.equal(chunks.join(""), "Hello Daksh!");
    } finally {
      setMockGroqChat(undefined);
      setMockGroqTextStream(undefined);
      process.env.GROQ_API_KEY = prevKey;
    }
  });

  await t.test("3.3b: Gate 2b unregistered capability emits assistant_delta in events mode", async () => {
    setMockGroqChat(async () =>
      JSON.stringify({
        turnId: "t_unreg_1",
        rawMessage: "Book a flight to Mars",
        primaryClassification: "ACTION_REQUEST",
        confidence: 0.95,
        operations: [
          {
            operationId: "op_1",
            domain: "productivity",
            actionType: "external_capability_action",
            capabilityURN: "space.mars.book_flight",
            executionEligibility: "READY",
            riskClass: "HIGH_IRREVERSIBLE",
            payload: {},
          },
        ],
      })
    );
    try {
      const sup = Supervisor.createDefault(KernelCapabilityService.getInstance());
      const events: AvenStreamEvent[] = [];
      const res = await sup.processRequest({
        userId: "u_s3_unreg",
        message: "Book a flight to Mars",
        streamMode: "events",
        onEvent: (ev) => events.push(ev),
      });
      const deltas = events.filter((e): e is Extract<AvenStreamEvent, { type: "assistant_delta" }> => e.type === "assistant_delta");
      assert.ok(deltas.length >= 1, "Unregistered capability must emit assistant_delta in events mode");
      assert.equal(deltas.map((d) => d.text).join(""), res.response);
    } finally {
      setMockGroqChat(undefined);
    }
  });

  await t.test("3.3c: executeGraphWorkflow emits step_progress, stops pre-dispatch on abortSignal, and does not run unstarted steps", async () => {
    const kernel = KernelCapabilityService.getInstance();
    kernel.setAuditModel(createMockAuditModel() as any);
    registerDefaultActionAdapters(ActionAdapterRegistry.getInstance());

    const dispatcher = IterativeActionDispatcher.getInstance(kernel);
    const ac = new AbortController();
    const events: AvenStreamEvent[] = [];

    // Abort immediately after first read step completes
    const wfResult = await dispatcher.executeGraphWorkflow({
      userId: "u_s3_cancel",
      userRequest: "Check tasks then goals",
      goal: "Check tasks then goals",
      abortSignal: ac.signal,
      plan: {
        goal: "Check tasks then goals",
        userRequest: "Check tasks then goals",
        steps: [
          {
            stepId: "step_tasks",
            actionType: "lifeos.tasks.query",
            capabilityURN: "lifeos.tasks.query",
            parameters: {},
            dependsOn: [],
            rationale: "Read tasks",
          },
          {
            stepId: "step_goals",
            actionType: "lifeos.goals.query",
            capabilityURN: "lifeos.goals.query",
            parameters: {},
            dependsOn: ["step_tasks"],
            rationale: "Read goals",
          },
        ],
      },
      onEvent: (ev) => {
        events.push(ev);
        if (
          ev.type === "step_progress" &&
          ev.stepId === "step_tasks" &&
          (ev.phase === "completed" || ev.phase === "failed")
        ) {
          ac.abort();
        }
      },
    });

    assert.equal(wfResult.status, "CANCELLED_BY_USER");
    assert.equal(wfResult.outcomeStatus, "EXECUTION_ABORTED");
    const stepEvents = events.filter((e: any) => e.type === "step_progress");
    assert.ok(stepEvents.some((e: any) => e.stepId === "step_tasks" && e.phase === "started"));
    assert.ok(!stepEvents.some((e: any) => e.stepId === "step_goals"), "Downstream step must not start after abortSignal");
  });

  await t.test("3.3d: Supervisor pre-aborted request rejects immediately with AbortError", async () => {
    const ac = new AbortController();
    ac.abort();
    const sup = Supervisor.createDefault(KernelCapabilityService.getInstance());
    await assert.rejects(
      () => sup.processRequest({ userId: "u_abort", message: "Hi", abortSignal: ac.signal }),
      (err) => isAbortError(err)
    );
  });
});
