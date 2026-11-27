/**
 * stage2LiveProviderSmoke.test.ts
 *
 * Dedicated Tier 3 Live-Provider Smoke Check for Stage 2.
 * Invariant: NEVER falls back to mocks. Missing credentials, network blocks,
 * or 429 rate limits are explicitly classified and reported as BLOCKED / RATE_LIMITED / FAILED.
 */

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { DynamicRouter } from "../orchestration/supervisor/DynamicRouter";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { createMockAuditModel } from "./helpers/mockAuditModel";

test("Stage 2 Tier 3 Live-Provider Smoke Verification (No Mock Fallback)", async () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey === "mock_key_for_dev" || apiKey.trim().length < 10) {
    console.error("[LIVE_PROVIDER_STATUS]: BLOCKED (GROQ_API_KEY missing or placeholder)");
    assert.fail("LIVE_PROVIDER_BLOCKED: GROQ_API_KEY is not configured.");
  }

  const userId = new mongoose.Types.ObjectId().toString();
  await connectIsolatedTestDB({
    dbName: "life-os-stage2-live-smoke",
    useMemoryReplSet: true,
  });

  try {
    const { Task } = await import("../../../../apps/web/server/db/models/Task");
    await Task.deleteMany({});
    await Task.create([{ userId, title: "Live smoke check task", status: "pending", priority: "high", dueDate: "2026-11-26" }]);

    const adapterRegistry = ActionAdapterRegistry.getInstance();
    registerDefaultActionAdapters(adapterRegistry);
    const kernel = new KernelCapabilityService(adapterRegistry, { auditModel: createMockAuditModel() });
    const supervisor = Supervisor.createDefault(kernel);

    const res = await supervisor.processRequest({
      userId,
      message: "List my pending tasks and summarize what is most urgent.",
      timezone: "UTC",
    });

    if (res.actionsExecuted === 0 && res.routingDecision.strategy === "CONVERSATIONAL_LLM") {
      throw new Error(
        `LIVE_PROVIDER_BLOCKED: Live LLM provider could not be reached (actionsExecuted=0, strategy=${res.routingDecision.strategy}).`
      );
    }

    assert.ok(res.actionsExecuted >= 1, `Live provider must execute >= 1 read capability, got ${res.actionsExecuted}`);
    assert.ok(res.response && res.response.includes("Live smoke check task"), "Live provider response must cite real seeded task");
    console.log(`[LIVE_PROVIDER_STATUS]: PASSED (strategy=${res.routingDecision.strategy}, actionsExecuted=${res.actionsExecuted})`);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes("LIVE_PROVIDER_BLOCKED")) {
      console.error(`[LIVE_PROVIDER_STATUS]: BLOCKED (${msg})`);
    } else if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
      console.error(`[LIVE_PROVIDER_STATUS]: RATE_LIMITED (${msg})`);
    } else if (
      msg.toLowerCase().includes("fetch failed") ||
      msg.toLowerCase().includes("connection") ||
      msg.toLowerCase().includes("enotfound") ||
      msg.toLowerCase().includes("econnrefused") ||
      msg.toLowerCase().includes("network")
    ) {
      console.error(`[LIVE_PROVIDER_STATUS]: BLOCKED (${msg})`);
    } else {
      console.error(`[LIVE_PROVIDER_STATUS]: FAILED (${msg})`);
    }
    throw err;
  } finally {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  }
});
