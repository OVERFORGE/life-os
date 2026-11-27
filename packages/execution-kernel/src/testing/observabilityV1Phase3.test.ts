import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { User } from "../../../../apps/web/server/db/models/User";
import { ConversationService } from "../services/ConversationService";
import { setMockGroqChat } from "../shared/groq";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { STATUS_PHASE_LABELS } from "../../../../apps/web/features/chat/sseStreamParser";

describe("Observability V1 Phase 3: Admin Auth, Observability API & Frontend UX", () => {
  const prevAdminEmails = process.env.ADMIN_EMAILS;

  before(async () => {
    await connectIsolatedTestDB({ dbName: "life-os-obs-v1-phase3-test" });
    registerDefaultActionAdapters(ActionAdapterRegistry.getInstance());
  });

  after(async () => {
    setMockGroqChat(undefined);
    if (prevAdminEmails === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = prevAdminEmails;
    }
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  it("Admin API routes fail closed (401) when unauthenticated", async () => {
    const { GET: getTraces } = await import(
      "../../../../apps/web/app/api/admin/observability/traces/route"
    );
    const { GET: getSimulation } = await import(
      "../../../../apps/web/app/api/admin/simulation/route"
    );

    const tracesRes = await getTraces(
      new NextRequest("http://localhost:3000/api/admin/observability/traces")
    );
    assert.equal(tracesRes.status, 401);

    const simRes = await getSimulation();
    assert.equal(simRes.status, 401);
  });

  it("isAdminEmailAllowed enforces ADMIN_EMAILS allowlist and fails closed when unset", async () => {
    const { isAdminEmailAllowed } = await import("../../../../apps/web/lib/adminAuth");

    delete process.env.ADMIN_EMAILS;
    assert.equal(isAdminEmailAllowed("admin@lifeos.local"), false);

    process.env.ADMIN_EMAILS = "owner@lifeos.local, ops@lifeos.local";
    assert.equal(isAdminEmailAllowed("owner@lifeos.local"), true);
    assert.equal(isAdminEmailAllowed("intruder@lifeos.local"), false);
  });

  it("Frontend STATUS_PHASE_LABELS use natural human-readable copy without internal jargon", () => {
    const values = Object.values(STATUS_PHASE_LABELS).join(" ");
    assert.doesNotMatch(values, /execution context|capability step|workflow steps|Synthesizing/i);
  });

  it("Persisted trace records include full step & payload data for admin inspection", async () => {
    const user = await User.create({ name: "Phase 3 User", email: "obs_phase3@test.local" });
    const userId = String(user._id);

    setMockGroqChat(async () => "Here is your friendly summary.");

    const res = await ConversationService.getInstance().executeUserRequest({
      userId,
      conversationId: "conv_obs_phase3",
      message: "How is my day looking?",
      streamFormat: "events",
    });
    const executionId = res.headers.get("x-lifeos-execution-id");
    assert.ok(executionId);
    await res.text();
    await new Promise((r) => setTimeout(r, 100));

    const { ExecutionTraceRecordModel } = await import(
      "../../../../apps/web/server/db/models/ExecutionTraceRecordModel"
    );
    const trace = (await ExecutionTraceRecordModel.findOne({ executionId }).lean()) as any;
    assert.ok(trace);
    assert.ok(Array.isArray(trace.steps) && trace.steps.length >= 3);
    assert.ok(trace.finalFrontendPayload);
    setMockGroqChat(undefined);
  });
});
