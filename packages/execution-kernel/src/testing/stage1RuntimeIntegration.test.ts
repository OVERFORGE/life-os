import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { IterativeActionDispatcher } from "../orchestration/kernel/IterativeActionDispatcher";
import { CapabilityRegistry } from "../orchestration/capabilities/CapabilityRegistry";

describe("Stage 1: Kernel Runtime Integration & Internal Dispatch", () => {
  const userId = new mongoose.Types.ObjectId().toString();

  before(async () => {
    await connectIsolatedTestDB({
      dbName: "life-os-stage1-runtime-test",
      useMemoryReplSet: true,
    });
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  it("executes all 5 Stage 1 read capabilities through KernelCapabilityService and stores sanitized audit summaries", async () => {
    const { Task } = await import("../../../../apps/web/server/db/models/Task");
    const { Goal } = await import("../../../../apps/web/features/goals/models/Goal");
    const { DailyLog } = await import("../../../../apps/web/server/db/models/DailyLog");
    const { ActionAuditRecordModel } = await import(
      "../../../../apps/web/server/db/models/ActionAuditRecordModel"
    );
    const { OutboxEventModel } = await import("../../../../apps/web/server/db/models/OutboxEventModel");

    await Task.deleteMany({});
    await Goal.deleteMany({});
    await DailyLog.deleteMany({});
    await ActionAuditRecordModel.deleteMany({});
    await OutboxEventModel.deleteMany({});

    await Task.create({
      userId,
      title: "Kernel Dispatch Task",
      dueDate: "2026-05-12",
      priority: "high",
      status: "pending",
    });
    await Goal.create({
      userId,
      title: "Kernel Dispatch Goal",
      status: "active",
      nature: "habitual_cadence",
      cadence: "daily",
    });
    await DailyLog.create({
      userId: new mongoose.Types.ObjectId(userId),
      date: "2026-05-12",
      mental: { mood: 8, energy: 8 },
      reflection: { win: "TOP_SECRET_REFLECTION_TEXT" },
    });

    const adapterRegistry = new ActionAdapterRegistry();
    registerDefaultActionAdapters(adapterRegistry);
    const kernel = new KernelCapabilityService(adapterRegistry, {
      auditModel: ActionAuditRecordModel,
    });

    const calls: Array<{ urn: any; payload: any }> = [
      { urn: "lifeos.tasks.query", payload: { status: "pending" } },
      { urn: "lifeos.goals.query", payload: { status: "active" } },
      {
        urn: "lifeos.schedule.query_occurrences",
        payload: { startDate: "2026-05-01", endDate: "2026-05-15" },
      },
      {
        urn: "lifeos.daily_logs.query_range",
        payload: { startDate: "2026-05-01", endDate: "2026-05-15", includeReflection: true },
      },
      {
        urn: "lifeos.telemetry.query_state_history",
        payload: { startDate: "2026-05-01", endDate: "2026-05-15" },
      },
    ];

    for (const c of calls) {
      const res = await kernel.executeAction(userId, {
        id: `prop_${c.urn}_${Date.now()}`,
        domain: "productivity",
        actionType: c.urn,
        payload: c.payload,
        rationale: `Stage 1 runtime read ${c.urn}`,
        reversibility: "irreversible_local",
        idempotencyKey: `idemp_${c.urn}_${Date.now()}`,
      });

      assert.equal(res.success, true, `Expected ${c.urn} to succeed, got error: ${res.error}`);
      assert.equal(res.status, "SUCCEEDED");
      assert.ok(res.data);

      const auditDoc = await ActionAuditRecordModel.findOne({
        userId,
        idempotencyKey: res.idempotencyKey,
      }).lean();
      assert.ok(auditDoc, `Missing audit record for ${c.urn}`);
      assert.equal((auditDoc as any).result?._auditSummary, true);
      assert.equal(typeof (auditDoc as any).result?.resultHash, "string");
      assert.equal(
        JSON.stringify((auditDoc as any).result).includes("TOP_SECRET_REFLECTION_TEXT"),
        false,
        "Sensitive reflection text must never be stored in ActionAuditRecordModel"
      );
    }

    assert.equal(await OutboxEventModel.countDocuments({}), 0);
  });

  it("routes INTERNAL_ADAPTER read URNs directly in IterativeActionDispatcher without external_capability_action", async () => {
    const { ActionAuditRecordModel } = await import(
      "../../../../apps/web/server/db/models/ActionAuditRecordModel"
    );
    const adapterRegistry = ActionAdapterRegistry.getInstance();
    registerDefaultActionAdapters(adapterRegistry);
    const realKernel = new KernelCapabilityService(adapterRegistry, {
      auditModel: ActionAuditRecordModel,
    });

    const dispatchedActionTypes: string[] = [];
    const origExecuteAction = realKernel.executeAction.bind(realKernel);
    (realKernel as any).executeAction = async (uId: string, proposal: any) => {
      dispatchedActionTypes.push(proposal.actionType);
      return await origExecuteAction(uId, proposal);
    };

    const dispatcher = new IterativeActionDispatcher(realKernel);

    const desc = CapabilityRegistry.getCapability("lifeos.tasks.query");
    assert.equal(desc?.source, "INTERNAL_ADAPTER");

    const graphResult = await dispatcher.executeGraphWorkflow({
      userId,
      userRequest: "Check my pending tasks",
      goal: "Check my pending tasks",
      plan: {
        goal: "Check my pending tasks",
        userRequest: "Check my pending tasks",
        steps: [
          {
            stepId: "s1",
            actionType: "lifeos.tasks.query",
            capabilityURN: "lifeos.tasks.query",
            rationale: "Read pending tasks",
            parameters: { status: "pending" },
          },
        ],
      },
    });

    assert.equal(
      graphResult.status,
      "COMPLETED",
      `Unexpected graphResult: ${JSON.stringify({ status: graphResult.status, response: graphResult.response, steps: graphResult.completedSteps })}`
    );
    assert.deepEqual(dispatchedActionTypes, ["lifeos.tasks.query"]);
  });
});
