import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import {
  KernelCapabilityService,
  ActionAdapterRegistry,
  registerDefaultActionAdapters,
  AutonomousActionReverser,
  CANONICAL_DELIVERY_REGISTRY,
} from "../index";
import { OutboxEventModel } from "../../../../apps/web/server/db/models/OutboxEventModel";
import { User } from "../../../../apps/web/server/db/models/User";
import { WeightLog } from "../../../../apps/web/server/db/models/WeightLog";
import { FoodItem } from "../../../../apps/web/server/db/models/FoodItem";
import { LifeSystemSettings } from "../../../../apps/web/features/settings/models/LifeSystemSettings";
import { Task } from "../../../../apps/web/server/db/models/Task";
import { TemporalOccurrence } from "../../../../apps/web/server/db/models/TemporalOccurrence";
import { handleUpdateWeight } from "../dispatch/executionHandlers/handleUpdateWeight";
import { upsertCatalogDocWithOutbox, createCatalogDocWithOutbox } from "../../../../apps/web/features/catalog/services/catalogMutationEngine";
import { updateUserProfileWithOutbox } from "../../../../apps/web/features/user/services/userProfileEngine";

describe("Stage 6.2: Outbox Parity, Domain Write Unification & Fail-Closed Security DB Suite", () => {
  let userAId = "";
  let userBId = "";

  before(async () => {
    await connectIsolatedTestDB({ dbName: "life-os-stage6-2-test" });

    const userA = await User.create({ name: "Tenant Alpha", email: "alpha_62@test.local" });
    const userB = await User.create({ name: "Tenant Beta", email: "beta_62@test.local" });
    userAId = String(userA._id);
    userBId = String(userB._id);
    registerDefaultActionAdapters(ActionAdapterRegistry.getInstance());
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  it("6.2a: Delivery registry covers all new Stage 6 domain events with invalidation tags", () => {
    const newEvents = [
      "domain.catalog.updated",
      "domain.settings.updated",
      "domain.user.profile_updated",
      "domain.goal_proposal.updated",
    ] as const;
    for (const ev of newEvents) {
      const def = CANONICAL_DELIVERY_REGISTRY[ev];
      assert.ok(def, `Missing delivery definition for ${ev}`);
      assert.ok(def.invalidationTags.length > 0, `Expected invalidationTags for ${ev}`);
    }
  });

  it("6.2b: handleUpdateWeight routes through weightLogEngine & userProfileEngine with Outbox events", async () => {
    const res = await handleUpdateWeight({ weight: 74.5, date: "2026-11-26" }, userAId);
    assert.equal(res.success, true);

    const log = await WeightLog.findOne({ userId: userAId, date: "2026-11-26" }).lean();
    assert.ok(log, "WeightLog must be persisted");
    assert.equal((log as any).weight, 74.5);

    const user = await User.findById(userAId).lean();
    assert.equal((user as any).weight, 74.5);

    const weightEvents = await OutboxEventModel.find({
      userId: userAId,
      type: "domain.weight.logged",
    }).lean();
    const profileEvents = await OutboxEventModel.find({
      userId: userAId,
      type: "domain.user.profile_updated",
    }).lean();
    assert.ok(weightEvents.length >= 1, "domain.weight.logged outbox event required");
    assert.ok(profileEvents.length >= 1, "domain.user.profile_updated outbox event required");
  });

  it("6.2c: updateUserProfileWithOutbox enforces idempotent replay on duplicate clientMutationId", async () => {
    const first = await updateUserProfileWithOutbox(
      userAId,
      { dietMode: "cut", targetCalories: 1950 },
      { clientMutationId: "mut_test_user_profile_replay_1", source: "test" }
    );
    const second = await updateUserProfileWithOutbox(
      userAId,
      { dietMode: "cut", targetCalories: 1950 },
      { clientMutationId: "mut_test_user_profile_replay_1", source: "test" }
    );
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(second.deduplicated, true);
  });

  it("6.2d: Catalog & settings mutations emit domain.catalog.updated and domain.settings.updated", async () => {
    const food = await createCatalogDocWithOutbox({
      userId: userAId,
      model: FoodItem,
      aggregateType: "food_item",
      eventType: "domain.catalog.updated",
      domain: "nutrition",
      docFields: {
        userId: userAId,
        name: "Greek Yogurt Bowl",
        baseWeight: 200,
        macros: { calories: 180, protein: 20, carbs: 14, fats: 4 },
      },
    });
    assert.equal(food.success, true);

    const settings = await upsertCatalogDocWithOutbox({
      userId: userAId,
      model: LifeSystemSettings,
      filter: { userId: userAId },
      aggregateType: "system_settings",
      eventType: "domain.settings.updated",
      domain: "settings",
      updateFields: { overrides: { focusMode: true } },
      createFields: { userId: userAId, learned: {} },
      createIfMissing: true,
    });
    assert.equal(settings.success, true);

    const catEvents = await OutboxEventModel.find({
      userId: userAId,
      type: "domain.catalog.updated",
    }).lean();
    const setEvents = await OutboxEventModel.find({
      userId: userAId,
      type: "domain.settings.updated",
    }).lean();
    assert.ok(catEvents.length >= 1);
    assert.ok(setEvents.length >= 1);
  });

  it("6.2e: Protected API routes fail closed (401) without session even in non-production", async () => {
    const routesToCheck = [
      { path: "../../../../apps/web/app/api/kernel/dispatch/route", method: "POST", body: { actionType: "create_task", idempotencyKey: "k1", userId: userAId } },
      { path: "../../../../apps/web/app/api/surface/reversal/route", method: "POST", body: { executionId: "exec_1" } },
      { path: "../../../../apps/web/app/api/surface/state/route", method: "GET" },
      { path: "../../../../apps/web/app/api/calendar/mutate/route", method: "POST", body: { actionType: "cancel_occurrence", payload: { occurrenceId: "occ_1" } } },
      { path: "../../../../apps/web/app/api/user/route", method: "GET" },
    ];

    for (const r of routesToCheck) {
      const mod = await import(r.path);
      const handler = mod[r.method];
      const req = new NextRequest("http://localhost:3456/api/test", {
        method: r.method,
        ...(r.body ? { body: JSON.stringify(r.body), headers: { "Content-Type": "application/json" } } : {}),
      });
      const res: Response = await handler(req);
      assert.equal(res.status, 401, `Expected 401 Unauthorized for unauthenticated ${r.path}`);
    }
  });

  it("6.2f: Cross-tenant calendar cancellation cannot touch User A occurrence when invoked as User B", async () => {
    const startMs = Date.now() + 3600000;
    const endMs = startMs + 3600000;
    const occ = await TemporalOccurrence.create({
      occurrenceId: "occ_tenant_a_only",
      userId: userAId,
      title: "Alpha Deep Work",
      kind: "WORK_SESSION",
      dateOnly: "2026-11-26",
      plannedInterval: {
        startAtMs: startMs,
        endAtMs: endMs,
        startMinute: 600,
        endMinute: 660,
        durationMinutes: 60,
        dateOnly: "2026-11-26",
        startIsoUtc: new Date(startMs).toISOString(),
        endIsoUtc: new Date(endMs).toISOString(),
        timezone: "UTC",
      },
      status: "SCHEDULED",
    });

    const kernel = KernelCapabilityService.getInstance();
    const res = await kernel.executeAction(userBId, {
      id: "prop_cross_tenant",
      domain: "productivity",
      actionType: "cancel_occurrence",
      payload: { occurrenceId: occ.occurrenceId },
      rationale: "cross-tenant test",
      reversibility: "atomic_single_doc",
      idempotencyKey: "idem_cross_tenant_cal_1",
    });
    assert.equal(res.success, false, "User B must not cancel User A occurrence");

    const unchanged = await TemporalOccurrence.findById(occ._id).lean();
    assert.equal((unchanged as any).status, "SCHEDULED");
  });

  it("6.2g: Real AutonomousActionReverser compensation executes KernelCapabilityService and deletes DB task", async () => {
    const kernel = KernelCapabilityService.getInstance();
    const created = await kernel.executeAction(userAId, {
      id: "prop_create_for_rev",
      domain: "productivity",
      actionType: "create_task",
      payload: { title: "Autonomous Temp Task", priority: "medium" },
      rationale: "Reversal integration test",
      reversibility: "reversible_with_compensation",
      idempotencyKey: "idem_create_for_rev_1",
    });
    assert.equal(created.success, true);
    const taskId = String(created.data?.task?._id || created.data?.taskId);
    assert.ok(taskId);

    const reverser = AutonomousActionReverser.getInstance();
    const record = await reverser.recordAutonomousExecution(
      userAId,
      "lifeos.tasks.create",
      { title: "Autonomous Temp Task" },
      "Reversal integration test",
      {
        capabilityURN: "lifeos.tasks.delete",
        parameters: { taskId },
        reversibility: "REVERSIBLE_EXACT",
        externalSideEffectClass: "NONE",
      } as any,
      "rule_test_rev"
    );

    const revResult = await reverser.executeCompensation(userAId, record.executionId, kernel);
    assert.equal(revResult.success, true, `Compensation should succeed: ${revResult.error}`);

    const taskAfter = await Task.findById(taskId).lean();
    assert.ok(!taskAfter || (taskAfter as any).status === "deleted" || (taskAfter as any).deletedAt, "Task must be deleted/soft-deleted by real kernel compensation");
  });
});
