import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { User } from "../../../../apps/web/server/db/models/User";
import { Task } from "../../../../apps/web/server/db/models/Task";
import { OutboxEventModel } from "../../../../apps/web/server/db/models/OutboxEventModel";
import { ExecutionTraceRecordModel } from "../../../../apps/web/server/db/models/ExecutionTraceRecordModel";
import { ConversationService } from "../services/ConversationService";
import { setMockGroqChat } from "../shared/groq";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { sanitizeTracePayload, stripReasoningTags } from "../orchestration/observability/TracePrivacy";
import {
  createTraceContext,
  runWithTraceContext,
  recordTraceStep,
} from "../orchestration/observability/TraceContext";
import { TracePersistenceService } from "../orchestration/observability/TracePersistenceService";

describe("Observability V1 Phase 2: End-to-End Trace Correlation & Privacy", () => {
  before(async () => {
    await connectIsolatedTestDB({ dbName: "life-os-obs-v1-phase2-test" });
    registerDefaultActionAdapters(ActionAdapterRegistry.getInstance());
  });

  after(async () => {
    setMockGroqChat(undefined);
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  it("TracePrivacy strips <think> tags, redacts secrets, and bounds oversized payloads", () => {
    const cleaned = stripReasoningTags("<think>secret chain of thought</think>Hello user");
    assert.equal(cleaned, "[redacted-reasoning]Hello user");

    const sanitized = sanitizeTracePayload({
      authorization: "Bearer secret_jwt_token",
      approvalSignature: "hmac_123",
      nested: { text: "Bearer abc.def.ghi and gsk_1234567890abcdef" },
      huge: "x".repeat(20000),
    });

    assert.equal(sanitized.authorization, "[REDACTED]");
    assert.equal(sanitized.approvalSignature, "[REDACTED]");
    assert.doesNotMatch(sanitized.nested.text, /abc\.def\.ghi/);
    assert.doesNotMatch(sanitized.nested.text, /1234567890abcdef/);
    assert.match(sanitized.huge, /_truncated:20000chars/);
  });

  it("ConversationService persists correlated ExecutionTraceRecord across LangGraph, LLM, Kernel, Outbox, and Frontend Payload", async () => {
    const user = await User.create({ name: "Trace User", email: "obs_phase2_user@test.local" });
    const userId = String(user._id);

    setMockGroqChat(async () =>
      JSON.stringify({
        primaryClassification: "ACTION_REQUEST",
        ambiguityStatus: "UNAMBIGUOUS",
        conversationalSummary: "Create task Verify End-to-End Trace",
        operations: [
          {
            actionType: "create_task",
            capabilityURN: "productivity.tasks.create_task",
            domain: "productivity",
            payload: { title: "Verify End-to-End Trace" },
            riskClass: "LOW_REVERSIBLE",
          },
        ],
      })
    );

    const res = await ConversationService.getInstance().executeUserRequest({
      userId,
      conversationId: "conv_obs_phase2",
      message: "Create task Verify End-to-End Trace",
      streamFormat: "events",
    });

    assert.equal(res.status, 200);
    const executionId = res.headers.get("x-lifeos-execution-id");
    assert.ok(executionId);

    // Drain SSE stream completely so async IIFE + finally trace persistence finishes
    const sseText = await res.text();
    assert.ok(sseText.includes("assistant_final"));

    // Allow microtask flush for fire-and-forget DB upsert if needed
    await new Promise((r) => setTimeout(r, 150));

    const savedTask = await Task.findOne({ userId, title: "Verify End-to-End Trace" }).lean();
    assert.ok(savedTask, "Task must be persisted");

    const traceDoc = await ExecutionTraceRecordModel.findOne({ executionId }).lean();
    assert.ok(traceDoc, "ExecutionTraceRecord must be persisted in MongoDB");
    assert.equal(traceDoc.userId, userId);
    assert.equal(traceDoc.status, "COMPLETED");
    assert.equal(traceDoc.routingStrategy, "FAST_PATH");
    assert.ok(traceDoc.steps.some((s: any) => s.layer === "ingress"));
    assert.ok(traceDoc.steps.some((s: any) => s.layer === "context"));
    assert.ok(traceDoc.steps.some((s: any) => s.layer === "langgraph"));
    assert.ok(traceDoc.steps.some((s: any) => s.layer === "routing"));
    assert.ok(traceDoc.llmCalls.length >= 1, "LLM calls must be captured via LifeOSTraceCallbackHandler");
    assert.ok(traceDoc.finalFrontendPayload, "Final frontend payload must be recorded");
    assert.ok(traceDoc.retentionExpiresAt, "TTL retention date must be set");

    const outboxEvent = await OutboxEventModel.findOne({ userId }).lean();
    assert.ok(outboxEvent, "Outbox event must be persisted");
    assert.equal(outboxEvent.metadata?.executionId, executionId);
    assert.equal(outboxEvent.metadata?.traceId, traceDoc.traceId);

    // Verify linked cross-process background trace correlation
    const linkedCtx = createTraceContext({
      parentTraceId: traceDoc.traceId,
      requestId: traceDoc.requestId,
      executionId,
      userId,
      surface: "inngest_worker",
    });
    await runWithTraceContext(linkedCtx, async () => {
      recordTraceStep({
        layer: "outbox",
        component: "outboxDispatcherFunction",
        operation: "dispatch-and-sequence-outbox",
        status: "COMPLETED",
        startedAtMs: Date.now(),
        durationMs: 5,
        outputs: { eventId: outboxEvent.eventId },
      });
      await TracePersistenceService.getInstance().persistTrace({
        ctx: linkedCtx,
        status: "COMPLETED",
        terminationReason: "OUTBOX_BATCH_DISPATCHED",
      });
    });

    const linkedDoc = await ExecutionTraceRecordModel.findOne({
      parentTraceId: traceDoc.traceId,
      surface: "inngest_worker",
    }).lean();
    assert.ok(linkedDoc, "Linked cross-process worker trace must correlate via parentTraceId");
    setMockGroqChat(undefined);
  });
});
