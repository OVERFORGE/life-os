import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { ConversationService } from "../services/ConversationService";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { SemanticIntentInterpreter } from "../orchestration/semantic/SemanticIntentInterpreter";
import { setMockGroqChat, setMockGroqTextStream } from "../shared/groq";

describe("Stage 3 Increment 3.4: Causal Persistence Barrier, Idempotency & Stream Cancellation (DB)", () => {
  const userId = new mongoose.Types.ObjectId().toString();

  before(async () => {
    await connectIsolatedTestDB({
      dbName: "life-os-stage3-db-test",
      useMemoryReplSet: true,
    });
    registerDefaultActionAdapters(ActionAdapterRegistry.getInstance());
  });

  after(async () => {
    setMockGroqChat(undefined);
    setMockGroqTextStream(undefined);
    SemanticIntentInterpreter.getInstance().setMockChat(undefined);
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  it("persists ConversationMessage BEFORE emitting assistant_final and terminal status:completed, and enforces requestId idempotency", async () => {
    const { Conversation } = await import("../../../../apps/web/server/db/models/Conversation");
    const { ConversationMessage } = await import("../../../../apps/web/server/db/models/ConversationMessage");
    await Conversation.deleteMany({});
    await ConversationMessage.deleteMany({});

    const convId = "conv_s3_causal";
    await Conversation.create({ conversationId: convId, userId, title: "Stage 3 Test" });

    const prevKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "test_key_for_mock_stream";
    setMockGroqChat(async () =>
      JSON.stringify({
        turnId: "t_s3_db_1",
        rawMessage: "Hi Aven",
        primaryClassification: "CONVERSATIONAL_SOCIAL",
        confidence: 0.99,
        operations: [],
        relevanceDomains: [],
      })
    );
    setMockGroqTextStream(async ({ onDelta }) => {
      await onDelta?.("Hello ");
      await onDelta?.("from Stage 3!");
      return "Hello from Stage 3!";
    });

    try {
      const sup = Supervisor.createDefault(KernelCapabilityService.getInstance());
      const service = new ConversationService(sup);
      const reqId = "req_idemp_001";

      const response = await service.executeUserRequest({
        userId,
        userName: "Daksh",
        conversationId: convId,
        requestId: reqId,
        message: "Hi Aven",
        streamFormat: "events",
      });

      assert.ok(response.body);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let rawSse = "";
      let persistedSeenBeforeTerminalClose = false;
      const parsedEvents: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        rawSse += chunk;
        for (const block of rawSse.split("\n\n")) {
          const line = block.split("\n").find((l) => l.startsWith("data: "));
          if (line) {
            try {
              const ev = JSON.parse(line.slice(6));
              if (!parsedEvents.some((p) => p.seq === ev.seq)) {
                parsedEvents.push(ev);
                if (ev.type === "status" && ev.status === "completed") {
                  // Immediately check MongoDB at the exact instant terminal status arrives
                  const docs = await ConversationMessage.find({ userId, conversationId: convId, requestId: reqId }).lean();
                  persistedSeenBeforeTerminalClose = docs.length === 2;
                }
              }
            } catch (_) {}
          }
        }
      }

      assert.equal(persistedSeenBeforeTerminalClose, true, "Both user and assistant messages must exist in MongoDB before terminal completed status arrives");

      const assistantFinal = parsedEvents.find((e) => e.type === "assistant_final");
      assert.ok(assistantFinal, "Must emit assistant_final");
      assert.equal(assistantFinal.text, "Hello from Stage 3!");
      assert.equal(assistantFinal.persisted, true);

      // Verify monotonic seq
      const seqs = parsedEvents.map((e) => e.seq);
      for (let i = 1; i < seqs.length; i++) {
        assert.ok(seqs[i] > seqs[i - 1], "SSE seq must be strictly monotonic");
      }

      // Replay with identical requestId must NOT create duplicate rows or re-run Supervisor
      let supervisorCalls = 0;
      const origStream = setMockGroqTextStream;
      origStream(async () => {
        supervisorCalls++;
        return "SHOULD NOT RUN";
      });

      const replayRes = await service.executeUserRequest({
        userId,
        userName: "Daksh",
        conversationId: convId,
        requestId: reqId,
        message: "Hi Aven",
        streamFormat: "events",
      });
      assert.equal(replayRes.headers.get("x-lifeos-replayed"), "true");
      assert.equal(supervisorCalls, 0, "Replayed requestId must not re-run LLM");

      const finalCount = await ConversationMessage.countDocuments({ userId, conversationId: convId, requestId: reqId });
      assert.equal(finalCount, 2, "Idempotent requestId must store exactly 1 user + 1 assistant message");
    } finally {
      setMockGroqChat(undefined);
      setMockGroqTextStream(undefined);
      process.env.GROQ_API_KEY = prevKey;
    }
  });

  it("cancelling stream mid-generation aborts execution and persists partial cancelled turn without creating empty records on pre-output cancel", async () => {
    const { ConversationMessage } = await import("../../../../apps/web/server/db/models/ConversationMessage");
    const convId = "conv_s3_cancel_db";
    await ConversationMessage.deleteMany({ userId, conversationId: convId });

    const prevKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "test_key_for_mock_stream";
    setMockGroqChat(async () =>
      JSON.stringify({
        turnId: "t_s3_cancel_1",
        rawMessage: "Write a long note",
        primaryClassification: "CONVERSATIONAL_SOCIAL",
        confidence: 0.99,
        operations: [],
        relevanceDomains: [],
      })
    );
    setMockGroqTextStream(async ({ signal, onDelta }) => {
      await onDelta?.("Partial output before cancel");
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 2000);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          },
          { once: true }
        );
      });
      return "Partial output before cancel";
    });

    try {
      const sup = Supervisor.createDefault(KernelCapabilityService.getInstance());
      const service = new ConversationService(sup);
      const ac = new AbortController();

      const res = await service.executeUserRequest({
        userId,
        userName: "Daksh",
        conversationId: convId,
        requestId: "req_cancel_partial_1",
        message: "Write a long note",
        streamFormat: "events",
        abortSignal: ac.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let sawPartialDelta = false;
      let sawCancelledEvent = false;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes("Partial output before cancel") && !sawPartialDelta) {
          sawPartialDelta = true;
          ac.abort("user_aborted");
        }
        if (buffer.includes('"type":"cancelled"')) {
          sawCancelledEvent = true;
        }
      }

      assert.equal(sawPartialDelta, true);
      assert.equal(sawCancelledEvent, true);

      const savedAssistant = await ConversationMessage.findOne({
        userId,
        conversationId: convId,
        requestId: "req_cancel_partial_1",
        role: "assistant",
      }).lean();
      assert.ok(savedAssistant, "Partial cancelled turn must be persisted");
      assert.equal(savedAssistant?.status, "cancelled");
      assert.equal(savedAssistant?.content, "Partial output before cancel");

      // Now test pre-output abort: must NOT create empty assistant message
      const preAc = new AbortController();
      preAc.abort("user_aborted");
      const preRes = await service.executeUserRequest({
        userId,
        userName: "Daksh",
        conversationId: convId,
        requestId: "req_cancel_empty_1",
        message: "Should not persist",
        streamFormat: "events",
        abortSignal: preAc.signal,
      });
      await preRes.text();
      const emptyCount = await ConversationMessage.countDocuments({
        userId,
        conversationId: convId,
        requestId: "req_cancel_empty_1",
      });
      assert.equal(emptyCount, 0, "Pre-output cancellation must not persist empty assistant/user messages");
    } finally {
      setMockGroqChat(undefined);
      setMockGroqTextStream(undefined);
      process.env.GROQ_API_KEY = prevKey;
    }
  });
});
