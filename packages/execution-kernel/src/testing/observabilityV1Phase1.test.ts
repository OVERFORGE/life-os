import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { User } from "../../../../apps/web/server/db/models/User";
import { Task } from "../../../../apps/web/server/db/models/Task";
import { ActionAuditRecordModel } from "../../../../apps/web/server/db/models/ActionAuditRecordModel";
import { OutboxEventModel } from "../../../../apps/web/server/db/models/OutboxEventModel";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { LifeOSChatModel } from "../shared/langchain/LifeOSChatModel";
import { buildKernelLangChainTools } from "../orchestration/langgraph/adapters/KernelCapabilityToolBridge";
import { setMockGroqChat, setMockGroqTextStream } from "../shared/groq";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";

describe("Observability V1 Phase 1: Production LangGraph & LangChain Integration", () => {
  before(async () => {
    await connectIsolatedTestDB({ dbName: "life-os-obs-v1-phase1-test" });
    registerDefaultActionAdapters(ActionAdapterRegistry.getInstance());
  });

  after(async () => {
    setMockGroqChat(undefined);
    setMockGroqTextStream(undefined);
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  it("LifeOSChatModel supports invoke() and stream() via groq.ts transport", async () => {
    setMockGroqChat(async () => "LangChain adapter response ok.");
    const llm = new LifeOSChatModel({ temperature: 0.1 });

    const invoked = await llm.invoke([{ role: "user", content: "Hello" }]);
    assert.equal(invoked.content, "LangChain adapter response ok.");

    const streamedChunks: string[] = [];
    const stream = await llm.stream([{ role: "user", content: "Stream test" }]);
    for await (const chunk of stream) {
      streamedChunks.push(String(chunk.content));
    }
    assert.equal(streamedChunks.join(""), "LangChain adapter response ok.");
    setMockGroqChat(undefined);
  });

  it("buildKernelLangChainTools validates and executes through KernelCapabilityService and fails closed on unregistered capabilities", async () => {
    const user = await User.create({ name: "Tool User", email: "obs_tool_user@test.local" });
    const userId = String(user._id);
    const tools = buildKernelLangChainTools({ userId });
    const execTool = tools.find((t: any) => t.name === "execute_lifeos_capability");
    assert.ok(execTool);

    const unregisteredRaw = await execTool.invoke({
      actionType: "nonexistent_capability_urn",
      domain: "productivity",
      payload: {},
      idempotencyKey: "idem_unreg_1",
    });
    const unregisteredParsed = JSON.parse(unregisteredRaw);
    assert.equal(unregisteredParsed.success, false);
    assert.match(unregisteredParsed.error, /Unregistered capability/i);

    const createRaw = await execTool.invoke({
      actionType: "create_task",
      capabilityURN: "productivity.tasks.create_task",
      domain: "productivity",
      title: "Phase 1 Kernel Tool Task",
      payload: { title: "Phase 1 Kernel Tool Task" },
      idempotencyKey: "idem_phase1_tool_task_1",
    });
    const createParsed = JSON.parse(createRaw);
    assert.equal(createParsed.success, true);

    const persistedTasks = await Task.find({ userId, title: "Phase 1 Kernel Tool Task" }).lean();
    assert.equal(persistedTasks.length, 1);

    const outboxEvents = await OutboxEventModel.find({ userId }).lean();
    assert.ok(outboxEvents.length >= 1, "Kernel tool execution must persist OutboxEvent");
  });

  it("Supervisor.processRequest routes through compiled LifeOSOrchestrationGraph and persists DB + Outbox state", async () => {
    const user = await User.create({ name: "Graph User", email: "obs_graph_user@test.local" });
    const userId = String(user._id);

    let turnCall = 0;
    setMockGroqChat(async () => {
      turnCall++;
      if (turnCall === 1) {
        return JSON.stringify({
          primaryClassification: "ACTION_REQUEST",
          ambiguityStatus: "UNAMBIGUOUS",
          conversationalSummary: "Create task Verify LangGraph Integration",
          operations: [
            {
              actionType: "create_task",
              capabilityURN: "productivity.tasks.create_task",
              domain: "productivity",
              payload: { title: "Verify LangGraph Integration" },
              riskClass: "LOW_REVERSIBLE",
            },
          ],
        });
      }
      return "Hello from Aven via LifeOSOrchestrationGraph.";
    });

    const supervisor = Supervisor.createDefault();
    const res1 = await supervisor.processRequest({
      userId,
      conversationId: "conv_obs_phase1",
      message: "Create task Verify LangGraph Integration",
    });
    assert.equal(res1.routingDecision.strategy, "FAST_PATH");
    assert.equal(res1.actionsExecuted, 1);
    assert.ok(res1.executionId);

    const savedTask = await Task.findOne({ userId, title: "Verify LangGraph Integration" }).lean();
    assert.ok(savedTask, "Task must be persisted by KernelCapabilityService");

    const outboxEvents = await OutboxEventModel.find({ userId }).lean();
    assert.ok(outboxEvents.length >= 1, "Outbox event must be persisted alongside mutation");

    const streamedDeltas: string[] = [];
    const res2 = await supervisor.processRequest({
      userId,
      conversationId: "conv_obs_phase1",
      message: "Thanks Aven!",
      streamMode: "events",
      onEvent: (ev) => {
        if (ev.type === "assistant_delta" && ev.text) {
          streamedDeltas.push(ev.text);
        }
      },
    });
    assert.equal(res2.routingDecision.strategy, "CONVERSATIONAL_LLM");
    assert.ok(res2.response.length > 0);
    setMockGroqChat(undefined);
  });
});
