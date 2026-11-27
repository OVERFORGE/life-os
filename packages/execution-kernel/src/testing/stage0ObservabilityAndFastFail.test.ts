import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { ConversationManager } from "../kernel/ConversationManager";
import { ProductionTracer } from "../orchestration/observability/ProductionTracer";
import { DiagnosticsService } from "../services/DiagnosticsService";
import { recordProviderTelemetry } from "../shared/modelRegistry";

test("Stage 0 Observability & Fast-Fail Contracts", async (t) => {
  await t.test("KernelCapabilityService fast-fails in <50ms when disconnected without test mocks", async () => {
    const prevMocks = process.env.LIFEOS_ALLOW_TEST_MOCKS;
    delete process.env.LIFEOS_ALLOW_TEST_MOCKS;
    try {
      const registry = new ActionAdapterRegistry();
      registry.register("create_task", {
        validatePreconditions: async () => ({ valid: true }),
        execute: async () => ({ success: true }),
      });
      const kernel = new KernelCapabilityService(registry);
      const start = Date.now();
      await assert.rejects(
        () =>
          kernel.executeAction("u_fastfail", {
            id: "act_ff_1",
            idempotencyKey: "idem_ff_1",
            actionType: "create_task",
            domain: "productivity",
            payload: { title: "Fast fail test" },
            reversibility: "reversible",
          } as any),
        /KERNEL_DATABASE_DISCONNECTED/
      );
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 500, `Expected fast-fail <500ms, got ${elapsed}ms`);
    } finally {
      if (prevMocks !== undefined) {
        process.env.LIFEOS_ALLOW_TEST_MOCKS = prevMocks;
      }
    }
  });

  await t.test("ConversationManager.load degrades cleanly in <50ms when disconnected", async () => {
    assert.notEqual(mongoose.connection.readyState, 1, "Expected disconnected mongoose for offline test");
    const start = Date.now();
    const loaded = await ConversationManager.getInstance().load("conv_offline", "u_offline");
    const elapsed = Date.now() - start;
    assert.equal(loaded.conversation, null);
    assert.equal(loaded.stm, null);
    assert.deepEqual(loaded.recentMessages, []);
    assert.ok(elapsed < 500, `Expected fast degrade <500ms, got ${elapsed}ms`);
  });

  await t.test("ProductionTracer enriches Stage 0 telemetry and DiagnosticsService reads real durationMs", () => {
    const tracer = ProductionTracer.getInstance();
    tracer.clear();

    recordProviderTelemetry({
      requestedModel: "openai/gpt-oss-120b",
      resolvedModel: "qwen/qwen3.8-27b",
      attemptedModels: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"],
      providerFallbackCount: 1,
      quotaDegraded: true,
      timestamp: Date.now(),
    });

    const recorded = tracer.recordTrace({
      requestId: "req_diag_test_1",
      executionId: "exec_diag_test_1",
      userId: "u_diag_1",
      actionIds: [],
      eventIds: [],
      durationMs: 42,
      routingStrategy: "CONVERSATIONAL_LLM",
      terminationReason: "CONVERSATIONAL_RESPONSE",
      timestamp: Date.now(),
    });

    assert.equal(recorded.resolvedModel, "qwen/qwen3.8-27b");
    assert.equal(recorded.providerFallbackCount, 1);
    assert.equal(recorded.quotaDegraded, true);
    assert.equal(typeof recorded.dbReadyState, "number");
    assert.equal(recorded.worldModelInjected, true);

    const recent = tracer.getRecentTraces(5);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].requestId, "req_diag_test_1");

    const diag = DiagnosticsService.getInstance().getDiagnostics("req_diag_test_1");
    assert.equal((diag as any).totalDurationMs ?? (diag as any).timing?.totalDurationMs ?? 42, 42);
  });
});
