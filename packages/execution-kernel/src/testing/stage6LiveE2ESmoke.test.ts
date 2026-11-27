import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { User } from "../../../../apps/web/server/db/models/User";
import { Task } from "../../../../apps/web/server/db/models/Task";
import { ConversationService } from "../services/ConversationService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";

const HAS_LIVE_LLM = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 10);

describe("Stage 6.6: Live E2E Smoke (Optional GROQ_API_KEY Gate)", { skip: !HAS_LIVE_LLM }, () => {
  before(async () => {
    await connectIsolatedTestDB({ dbName: "life-os-stage6-6-live" });
    registerDefaultActionAdapters(ActionAdapterRegistry.getInstance());
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  it("Live LLM + DB E2E turn executes via ConversationService with grounded headers", async () => {
    const user = await User.create({ name: "Live Smoke User", email: "live_smoke_66@test.local" });
    const userId = String(user._id);

    const res = await ConversationService.getInstance().executeUserRequest({
      userId,
      conversationId: "conv_stage6_live",
      message: "Create a task called Review Stage 6 Release Checklist for tomorrow",
    });

    assert.equal(res.status, 200);
    assert.ok(res.headers.get("x-lifeos-execution-id"));
    const text = await res.text();
    assert.ok(text.length > 0);
    assert.doesNotMatch(text, /ExecutionNode|criticalPath|DAG/i);

    const tasks = await Task.find({ userId }).lean();
    assert.ok(tasks.length >= 1, "Live E2E turn should persist task in DB");
  });
});
