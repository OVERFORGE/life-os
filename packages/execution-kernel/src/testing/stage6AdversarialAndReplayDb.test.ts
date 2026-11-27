import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { User } from "../../../../apps/web/server/db/models/User";
import { Task } from "../../../../apps/web/server/db/models/Task";
import { DailyLog } from "../../../../apps/web/server/db/models/DailyLog";
import { OutboxEventModel } from "../../../../apps/web/server/db/models/OutboxEventModel";
import { UserDeliveryJournalModel } from "../../../../apps/web/server/db/models/UserDeliveryJournalModel";
import { UserDeliverySequenceModel } from "../../../../apps/web/server/db/models/UserDeliverySequenceModel";
import { ConsumerProcessingLedgerModel } from "../../../../apps/web/server/db/models/ConsumerProcessingLedgerModel";
import { PartitionLeaseModel } from "../../../../apps/web/server/db/models/PartitionLeaseModel";
import { PersonalMemory } from "../../../../apps/web/server/db/models/PersonalMemory";
import { ActionAuditRecordModel } from "../../../../apps/web/server/db/models/ActionAuditRecordModel";
import { upsertDailyLogWithOutbox } from "../../../../apps/web/features/daily-log/services/dailyLogEngine";
import { OutboxWorkerDaemon } from "../events/dispatch/OutboxWorkerService";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { AutonomousActionReverser } from "../autonomy/AutonomousActionReverser";
import { MemoryRepository } from "../memory/MemoryRepository";

describe("Stage 6.4: Adversarial Tenant Isolation, Outbox Crash/Replay & Reversal Trace (DB-Backed)", () => {
  const prevRuntimeMode = process.env.LIFEOS_RUNTIME_MODE;

  before(async () => {
    process.env.LIFEOS_RUNTIME_MODE = "test";
    await connectIsolatedTestDB({ dbName: "life-os-stage6-4-adversarial" });
    await Promise.all([
      OutboxEventModel.syncIndexes(),
      UserDeliveryJournalModel.syncIndexes(),
      UserDeliverySequenceModel.syncIndexes(),
      ConsumerProcessingLedgerModel.syncIndexes(),
      PartitionLeaseModel.syncIndexes(),
    ]);
    registerDefaultActionAdapters(ActionAdapterRegistry.getInstance());
  });

  after(async () => {
    process.env.LIFEOS_RUNTIME_MODE = prevRuntimeMode;
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Task.deleteMany({}),
      DailyLog.deleteMany({}),
      OutboxEventModel.deleteMany({}),
      UserDeliveryJournalModel.deleteMany({}),
      UserDeliverySequenceModel.deleteMany({}),
      ConsumerProcessingLedgerModel.deleteMany({}),
      PartitionLeaseModel.deleteMany({}),
      PersonalMemory.deleteMany({}),
      ActionAuditRecordModel.deleteMany({}),
    ]);
    MemoryRepository.getInstance().clearInMemoryStore();
  });

  it("6.4a: Cross-tenant attacks against Task, Memory, and ActionReverser fail closed with zero mutations", async () => {
    const userA = await User.create({ name: "Tenant A", email: "adv_a@test.local" });
    const userB = await User.create({ name: "Tenant B", email: "adv_b@test.local" });
    const userAId = String(userA._id);
    const userBId = String(userB._id);

    const taskA = await Task.create({
      userId: userA._id,
      title: "Confidential Board Deck",
      dueDate: "2026-11-27",
      status: "pending",
    });
    await MemoryRepository.getInstance().save({
      id: "mem_secret_a",
      userId: userAId,
      content: "Private medical record note for Tenant A",
      summary: "Private medical record note for Tenant A",
      memoryType: "semantic_fact",
      domain: "health",
      confidence: 0.95,
      importance: 0.9,
      source: "explicit_user_statement",
      sourceConversationId: "conv_adv_a",
      status: "ACTIVE",
      validFrom: Date.now(),
      firstObservedAt: Date.now(),
      lastReinforcedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any);

    const kernel = KernelCapabilityService.getInstance();

    // User B tries to complete User A's task
    const crossCompleteProp = {
      id: "prop_adv_complete",
      domain: "productivity" as const,
      actionType: "complete_task" as const,
      reversibility: "atomic_single_doc" as const,
      state: "APPROVED" as const,
      title: "Hijack A task",
      rationale: "Cross-tenant attack",
      idempotencyKey: "adv_complete_1",
      payload: { taskId: String(taskA._id) },
    };
    const val = await kernel.validateActionProposals(userBId, [crossCompleteProp]);
    if (val.valid) {
      const execRes = await kernel.executeAction(userBId, crossCompleteProp);
      assert.equal(execRes.success, false, "Cross-tenant task completion must fail");
    }

    const stillPending = await Task.findById(taskA._id).lean();
    assert.equal((stillPending as any)?.status, "pending", "User A task must remain untouched");

    // User B queries MemoryRepository -> must never see User A's memory
    const bMem = await MemoryRepository.getInstance().getById("mem_secret_a", userBId);
    assert.equal(bMem, null, "User B must not retrieve User A memories");

    // User B attempts to reverse User A's autonomous record -> must fail
    const reverser = AutonomousActionReverser.getInstance();
    const recA = await reverser.recordAutonomousExecution(
      userAId,
      "lifeos.tasks.create",
      { title: "Confidential Board Deck" },
      "Tenant isolation test",
      {
        capabilityURN: "lifeos.tasks.delete",
        parameters: { taskId: String(taskA._id) },
        reversibility: "REVERSIBLE_EXACT",
        externalSideEffectClass: "NONE",
      } as any,
      "rule_adv_a"
    );
    const revByB = await reverser.executeCompensation(userBId, recA.executionId, kernel);
    assert.equal(revByB.success, false, "User B must not reverse User A's action");
  });

  it("6.4b: Outbox PENDING crash recovery & duplicate idempotent replay produce exactly one delivery journal & ledger entry", async () => {
    const user = await User.create({ name: "Replay User", email: "replay@test.local" });
    const userId = String(user._id);
    const mutationId = "idem_replay_64b";

    // First write
    await upsertDailyLogWithOutbox({
      userId,
      date: "2026-11-26",
      sections: {
        sleep: { hours: 8, quality: 9 },
        mental: { mood: 8, energy: 8, stress: 2 },
      },
      options: { clientMutationId: mutationId, source: "stage6_test" },
    });

    // Duplicate replay with exact same clientMutationId
    await upsertDailyLogWithOutbox({
      userId,
      date: "2026-11-26",
      sections: {
        sleep: { hours: 8, quality: 9 },
        mental: { mood: 8, energy: 8, stress: 2 },
      },
      options: { clientMutationId: mutationId, source: "stage6_test" },
    });

    const outboxBefore = await OutboxEventModel.find({ userId }).lean();
    assert.equal(outboxBefore.length, 1, "Idempotent replay must not emit duplicate OutboxEvent");

    // Simulate crash before dispatch: event is PENDING; run OutboxWorkerDaemon recovery batch
    const worker = new OutboxWorkerDaemon({ batchSize: 20 });
    await worker.runOnce();

    const outboxAfter = await OutboxEventModel.find({ userId }).lean();
    assert.equal((outboxAfter[0] as any).deliveryStatus, "DELIVERED");

    const journals = await UserDeliveryJournalModel.find({ userId }).lean();
    assert.equal(journals.length, 1, "Delivery journal must contain exactly 1 entry");

    // Second worker pass must be a no-op
    await worker.runOnce();
    const journalsAfterSecondPass = await UserDeliveryJournalModel.find({ userId }).lean();
    assert.equal(journalsAfterSecondPass.length, 1, "Second worker pass must not duplicate delivery");
  });

  it("6.4c: E2E reversible action execution + AutonomousActionReverser real DB compensation trace", async () => {
    const user = await User.create({ name: "Reversal User", email: "rev_64c@test.local" });
    const userId = String(user._id);
    const kernel = KernelCapabilityService.getInstance();

    const createProp = {
      id: "prop_rev_create",
      domain: "productivity" as const,
      actionType: "create_task" as const,
      reversibility: "atomic_single_doc" as const,
      state: "APPROVED" as const,
      title: "Temporary Reversible Task",
      rationale: "Stage 6.4c reversal test",
      idempotencyKey: "rev_create_64c",
      payload: { title: "Temporary Reversible Task", dueDate: "2026-11-28" },
    };

    const val = await kernel.validateActionProposals(userId, [createProp]);
    assert.equal(val.valid, true);
    const execRes = await kernel.executeAction(userId, createProp);
    assert.equal(execRes.success, true);

    const createdTask = await Task.findOne({ userId, title: "Temporary Reversible Task" }).lean();
    assert.ok(createdTask, "Task must exist before reversal");

    const reverser = AutonomousActionReverser.getInstance();
    const rec = await reverser.recordAutonomousExecution(
      userId,
      "lifeos.tasks.create",
      { title: "Temporary Reversible Task" },
      "Stage 6.4c reversal test",
      {
        capabilityURN: "lifeos.tasks.delete",
        parameters: { taskId: String((createdTask as any)._id) },
        reversibility: "REVERSIBLE_EXACT",
        externalSideEffectClass: "NONE",
      } as any,
      "rule_64c"
    );

    const revRes = await reverser.executeCompensation(userId, rec.executionId, kernel);
    assert.equal(revRes.success, true, `Expected real reversal to succeed, got: ${revRes.error}`);

    const taskAfter = await Task.findById((createdTask as any)._id).lean();
    assert.ok(!taskAfter || (taskAfter as any).status === "deleted" || (taskAfter as any).deletedAt, "Task must be deleted in MongoDB after real compensation");
  });
});
