import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env") });

import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { AuthoritativeEntityResolver } from "../orchestration/context/AuthoritativeEntityResolver";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionProposal } from "../orchestration/contracts/ActionProposalContracts";
import { IPendingOperationContext } from "../orchestration/contracts/SemanticTurnContracts";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://overforge:overforgedatabase@cluster0.s8cvx.mongodb.net/life-os";

async function ensureUser(uId: string) {
  const { User } = await import("@/server/db/models/User");
  await User.findOneAndUpdate(
    { _id: uId },
    {
      _id: uId,
      email: `test_${uId}@lifeos.local`,
      name: "Continuity Test User",
      settings: { timezone: "America/New_York" },
    },
    { upsert: true }
  );
}

describe("Conversational Continuity & Operation Lifecycle Suite (TC-01 through TC-14)", () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const conversationId = `conv_test_${Date.now()}`;

  before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI, { bufferCommands: false });
    }
    await ensureUser(userId);
  });

  after(async () => {
    if (mongoose.connection.readyState === 1) {
      const { Task } = await import("@/server/db/models/Task");
      const { Goal } = await import("@/features/goals/models/Goal");
      const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
      await Task.deleteMany({ userId });
      await Goal.deleteMany({ userId });
      await ConversationShortTermMemory.deleteMany({ userId });
    }
  });

  // ─── TC-01: Exact Gas Task Continuity Sequence ─────────────────────────────
  it("TC-01: Full Gas Task Dialogue: Zero Duplicates, Exact Priority Update, Clean Completion", async () => {
    const supervisor = Supervisor.getInstance();
    const { Task } = await import("@/server/db/models/Task");

    // Turn 1: "can you remind me in 2 mins to turn off the gas"
    const t1 = await supervisor.processRequest({
      userId,
      conversationId,
      message: "can you remind me in 2 mins to turn off the gas",
    });
    assert.equal(t1.actionsExecuted, 1);
    assert.ok(t1.response.toLowerCase().includes("gas"));

    // Verify exactly 1 task in DB
    const tasksAfterT1 = await Task.find({ userId });
    assert.equal(tasksAfterT1.length, 1);
    const gasTask = tasksAfterT1[0];
    assert.ok(gasTask.title.toLowerCase().includes("turn off the gas") || gasTask.title.toLowerCase().includes("gas"));

    // Turn 2: "umm can you set the priority of that task to high ?"
    const t2 = await supervisor.processRequest({
      userId,
      conversationId,
      message: "umm can you set the priority of that task to high ?",
    });

    // It either resolves immediately via activeFocus or asks clarification
    if (t2.terminationReason === "AWAITING_CLARIFICATION") {
      // Turn 3: "the task to turn off the gas"
      const t3 = await supervisor.processRequest({
        userId,
        conversationId,
        message: "the task to turn off the gas",
      });
      assert.equal(t3.actionsExecuted, 1);
      assert.ok(t3.response.toLowerCase().includes("high") || t3.response.toLowerCase().includes("priority"));
    } else {
      assert.equal(t2.actionsExecuted, 1);
      assert.ok(t2.response.toLowerCase().includes("high") || t2.response.toLowerCase().includes("priority"));
    }

    // Verify task count is STILL exactly 1 and priority is high
    const tasksAfterPrio = await Task.find({ userId });
    assert.equal(tasksAfterPrio.length, 1, "Must NEVER create a duplicate task during priority update");
    assert.equal(tasksAfterPrio[0].priority, "high");

    // Turn 4: User repeats instruction "yes but i am asking you to change the priority of the task to turn off the gas in high"
    const t4 = await supervisor.processRequest({
      userId,
      conversationId,
      message: "yes but i am asking you to change the priority of the task to turn off the gas in high",
    });
    assert.ok(!t4.response.includes("taskId is required"), "Zero developer error leakage");
    assert.ok(!t4.response.startsWith("User wants"), "Zero third-person leakage");

    const tasksAfterRepeat = await Task.find({ userId });
    assert.equal(tasksAfterRepeat.length, 1, "Must STILL be exactly 1 task");
    assert.equal(tasksAfterRepeat[0].priority, "high");

    // Turn 5: "mark it done"
    const t5 = await supervisor.processRequest({
      userId,
      conversationId,
      message: "mark it done",
    });
    assert.equal(t5.actionsExecuted, 1);
    const completedTask = await Task.findById(gasTask._id);
    assert.equal(completedTask?.status, "completed");
  });

  // ─── TC-02: First-Class Clarification Continuation ─────────────────────────
  it("TC-02: Clarification continuation binds entity and parameter without new creation", async () => {
    const supervisor = Supervisor.getInstance();
    const { Task } = await import("@/server/db/models/Task");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);

    // Create a target task in DB
    const existing = await Task.create({
      userId: isolatedUserId,
      title: "Write Monthly Investor Letter",
      dueDate: "2026-09-22",
      status: "pending",
      priority: "medium",
    });

    const isolatedConvId = `conv_tc02_${Date.now()}`;

    // User asks without target entity: "Set priority to high"
    const t1 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Set priority to high",
    });

    assert.equal(t1.actionsExecuted, 0);
    assert.equal(t1.terminationReason, "AWAITING_CLARIFICATION");
    assert.ok(t1.response.includes("task"));

    // User responds with entity: "the investor letter"
    const t2 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "the investor letter",
    });

    assert.equal(t2.actionsExecuted, 1);
    const updated = await Task.findById(existing._id);
    assert.equal(updated?.priority, "high");

    const allTasks = await Task.find({ userId: isolatedUserId });
    assert.equal(allTasks.length, 1, "No new task created during clarification continuation");
  });

  // ─── TC-03: Explicit Retraction ────────────────────────────────────────────
  it("TC-03: Explicit retraction cancels/compensates recently executed task", async () => {
    const supervisor = Supervisor.getInstance();
    const { Task } = await import("@/server/db/models/Task");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc03_${Date.now()}`;

    // 1. User schedules a task
    const t1 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Remind me to call John at 4pm",
    });
    assert.equal(t1.actionsExecuted, 1);

    const tasks = await Task.find({ userId: isolatedUserId });
    assert.equal(tasks.length, 1);

    // 2. User explicitly retracts
    const t2 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Actually, don't create that task",
    });

    assert.ok(t2.response.toLowerCase().includes("cancelled") || t2.response.toLowerCase().includes("canceled"));
    const remainingTasks = await Task.find({ userId: isolatedUserId });
    assert.equal(remainingTasks.length, 0, "Task should be compensated/deleted upon explicit retraction");
  });

  // ─── TC-04: Explicit Correction ────────────────────────────────────────────
  it("TC-04: Explicit correction compensates previous task and executes intended task", async () => {
    const supervisor = Supervisor.getInstance();
    const { Task } = await import("@/server/db/models/Task");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc04_${Date.now()}`;

    const taskA = await Task.create({
      userId: isolatedUserId,
      title: "Deploy Service Alpha",
      dueDate: "2026-09-22",
      status: "pending",
    });
    const taskB = await Task.create({
      userId: isolatedUserId,
      title: "Deploy Service Beta",
      dueDate: "2026-09-22",
      status: "pending",
    });

    // Complete task A
    const t1 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Mark Deploy Service Alpha as complete",
    });
    assert.equal(t1.actionsExecuted, 1);

    let docA = await Task.findById(taskA._id);
    assert.equal(docA?.status, "completed");

    // User corrects: "No, I meant Deploy Service Beta"
    const t2 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "No, I meant Deploy Service Beta",
    });

    assert.equal(t2.actionsExecuted, 1);
    const docB = await Task.findById(taskB._id);
    assert.equal(docB?.status, "completed", "Task B should be marked completed");
  });

  // ─── TC-05: Ambiguous Retraction ───────────────────────────────────────────
  it("TC-05: Ambiguous retraction with multiple executed tasks clarifies rather than blind rollback", async () => {
    const supervisor = Supervisor.getInstance();
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc05_${Date.now()}`;

    // Execute two distinct tasks
    await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Add task Drink Water",
    });
    await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Add task Stretch for 10 minutes",
    });

    // Ambiguous undo when multiple exist
    const tUndo = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Wait, undo that action",
    });

    assert.equal(tUndo.actionsExecuted, 0);
    assert.equal(tUndo.terminationReason, "AWAITING_CLARIFICATION");
    assert.ok(tUndo.response.includes("Drink Water") || tUndo.response.includes("Stretch") || tUndo.response.includes("Which"));
  });

  // ─── TC-06: Duplicate Task Conflict ────────────────────────────────────────
  it("TC-06: Identical task on same slot triggers CONFLICT_REQUIRES_CLARIFICATION and creates 0 duplicates", async () => {
    const supervisor = Supervisor.getInstance();
    const { Task } = await import("@/server/db/models/Task");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc06_${Date.now()}`;

    // 1. Create first task
    const t1 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Remind me to turn off the oven today",
    });
    assert.equal(t1.actionsExecuted, 1);

    // 2. Request identical task for today
    const t2 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Remind me to turn off the oven today",
    });

    assert.equal(t2.actionsExecuted, 0, "Must not execute duplicate creation without confirmation");
    assert.equal(t2.terminationReason, "AWAITING_CLARIFICATION");
    assert.ok(
      t2.response.includes("already exists") ||
      t2.response.includes("already have") ||
      t2.response.includes("update the existing")
    );

    const tasks = await Task.find({ userId: isolatedUserId });
    assert.equal(tasks.length, 1, "Exactly 1 task in database");
  });

  // ─── TC-07: Distinct Temporal Tasks ────────────────────────────────────────
  it("TC-07: Identical task titles on distinct temporal dates are allowed without false duplicate conflict", async () => {
    const supervisor = Supervisor.getInstance();
    const { Task } = await import("@/server/db/models/Task");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc07_${Date.now()}`;

    const t1 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Schedule Gas check for today",
    });
    assert.equal(t1.actionsExecuted, 1);

    const t2 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Schedule Gas check for 2026-11-20",
    });
    assert.equal(t2.actionsExecuted, 1);

    const tasks = await Task.find({ userId: isolatedUserId });
    assert.equal(tasks.length, 2, "Both temporal instances must be created");
  });

  // ─── TC-08: Material Ambiguity Safety ──────────────────────────────────────
  it("TC-08: Material ambiguity between same-title tasks at different times halts with clarification", async () => {
    const resolver = AuthoritativeEntityResolver.getInstance();
    const knownTasks = [
      { id: "task_9pm", title: "Turn off the gas", dueTime: "21:00" },
      { id: "task_10pm", title: "Turn off the gas", dueTime: "22:00" },
    ];

    const outcome = await resolver.resolveTask("u_test", "turn off the gas", "pending", knownTasks);
    assert.equal(outcome.status, "AMBIGUOUS");
    assert.ok(outcome.clarificationQuestion.includes("21:00") || outcome.clarificationQuestion.includes("22:00"));
  });

  // ─── TC-09: Cross-Domain Disambiguation ────────────────────────────────────
  it("TC-09: Cross-domain disambiguation when entity exists in both Tasks and Goals", async () => {
    const resolver = AuthoritativeEntityResolver.getInstance();
    const knownEntities = [
      { id: "task_gym", title: "Gym Workout", entityType: "task" },
      { id: "goal_gym", title: "Gym Workout", entityType: "goal" },
    ];

    const outcome = await resolver.resolveEntity({
      userId: "u_test",
      entityType: "task",
      rawExpression: "Gym Workout",
      knownTasks: knownEntities,
    });
    // When queried explicitly for task, resolves to task
    assert.equal(outcome.status, "RESOLVED");
    if (outcome.status === "RESOLVED") {
      assert.equal(outcome.entityId, "task_gym");
    }
  });

  // ─── TC-10: Cross-Turn Domain Switching ────────────────────────────────────
  it("TC-10: Cross-turn domain switching resolves to qualified domain instead of active focus", async () => {
    const supervisor = Supervisor.getInstance();
    const { Task } = await import("@/server/db/models/Task");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc10_${Date.now()}`;

    // 1. Create task
    const t1 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Add task Read chapter four",
    });
    assert.equal(t1.actionsExecuted, 1);

    // 2. Log meal (shifts active focus to meal)
    const t2 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Log meal avocado toast with 300 calories",
    });
    assert.equal(t2.actionsExecuted, 1);

    // 3. User says "mark that task done"
    const t3 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "mark that task done",
    });
    assert.equal(t3.actionsExecuted, 1);

    const task = await Task.findOne({ userId: isolatedUserId });
    assert.equal(task?.status, "completed", "Must resolve to the task, not the meal");
  });

  // ─── TC-11: TTL Expiration ─────────────────────────────────────────────────
  it("TC-11: Expired pending operations are safely rejected without blind execution", async () => {
    const supervisor = Supervisor.getInstance();
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc11_${Date.now()}`;

    const expiredPending: IPendingOperationContext = {
      operationId: "pop_expired_1",
      turnId: "turn_exp",
      actionType: "complete_task",
      domain: "productivity",
      partialPayload: {},
      missingRequirement: { kind: "TARGET_ENTITY_RESOLUTION", targetEntityType: "task" },
      clarificationQuestion: "Which task?",
      state: "AWAITING_CLARIFICATION",
      createdAt: new Date(Date.now() - 20 * 60 * 1000),
      expiresAt: new Date(Date.now() - 5 * 60 * 1000), // Expired 5 mins ago
    };

    const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");
    await ConversationShortTermMemory.updateOne(
      { conversationId: isolatedConvId, userId: isolatedUserId },
      { $set: { pendingOperation: expiredPending } },
      { upsert: true }
    );

    // Message arrives after expiration
    const res = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "The gas one",
    });

    // Expired pending op must not blindly execute
    assert.equal(res.terminationReason, "EXPIRED");
  });

  // ─── TC-12: Server Restart / Persistence Reload of pendingOperation ────────
  it("TC-12: pendingOperation survives server restart simulation via MongoDB STM reload", async () => {
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc12_${Date.now()}`;
    const { Task } = await import("@/server/db/models/Task");
    const { ConversationShortTermMemory } = await import("@/server/db/models/ConversationShortTermMemory");

    const targetTask = await Task.create({
      userId: isolatedUserId,
      title: "Inspect Solar Inverter",
      dueDate: "2026-09-22",
      status: "pending",
      priority: "low",
    });

    // Persist pending operation in MongoDB
    const pendingOp: IPendingOperationContext = {
      operationId: "pop_persist_1",
      turnId: "turn_p1",
      actionType: "adjust_task_priority",
      domain: "productivity",
      partialPayload: { priority: "high" },
      missingRequirement: { kind: "TARGET_ENTITY_RESOLUTION", targetEntityType: "task" },
      clarificationQuestion: "Which task would you like to set to high priority?",
      state: "AWAITING_CLARIFICATION",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };

    await ConversationShortTermMemory.updateOne(
      { conversationId: isolatedConvId, userId: isolatedUserId },
      { $set: { pendingOperation: pendingOp } },
      { upsert: true }
    );

    // Simulate fresh Supervisor instance
    const freshSupervisor = Supervisor.createDefault();
    const res = await freshSupervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "the solar inverter",
    });

    assert.equal(res.actionsExecuted, 1);
    const updated = await Task.findById(targetTask._id);
    assert.equal(updated?.priority, "high");
  });

  // ─── TC-13: Replay Determinism without LLM ─────────────────────────────────
  it("TC-13: Deterministic Kernel Replay of historical proposals with ZERO LLM calls", async () => {
    const kernel = KernelCapabilityService.getInstance();
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const { Task } = await import("@/server/db/models/Task");

    const proposal: ActionProposal = {
      id: "prop_replay_1",
      planId: "plan_replay",
      actionType: "create_task",
      domain: "productivity",
      riskClass: "LOW_REVERSIBLE",
      reversibility: "atomic_single_doc",
      state: "PROPOSED",
      title: "Clean Replay Task",
      rationale: "Replay verification",
      payload: { title: "Clean Replay Task", priority: "medium", dueDate: "2026-09-22" },
      requiresConfirmation: false,
      estimatedImpact: "create_task",
      idempotencyKey: `replay_${Date.now()}`,
      dependencies: [],
    };

    const validation = await kernel.validateActionProposals(isolatedUserId, [proposal]);
    assert.equal(validation.valid, true);

    // First execution
    const results1 = await kernel.executeActionBatch(isolatedUserId, validation.validDecisions);
    assert.equal(results1[0].success, true);

    const taskInDb = await Task.findOne({ userId: isolatedUserId });
    assert.ok(taskInDb);
    assert.equal(taskInDb.title, "Clean Replay Task");

    // Second execution with identical idempotency key returns idempotent success
    const results2 = await kernel.executeActionBatch(isolatedUserId, validation.validDecisions);
    assert.equal(results2[0].success, true);
    assert.equal(results2[0].idempotent, true);

    const count = await Task.countDocuments({ userId: isolatedUserId });
    assert.equal(count, 1, "Replay must be 100% idempotent with zero duplicate documents");
  });

  // ─── TC-14: Web & Voice Streaming Parity ───────────────────────────────────
  it("TC-14: Streaming chunk dispatch produces identical state and grounded response", async () => {
    const supervisor = Supervisor.getInstance();
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc14_${Date.now()}`;
    const chunks: string[] = [];

    const res = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Schedule daily review for today",
      onChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    assert.equal(res.actionsExecuted, 1);
    assert.ok(chunks.length > 0, "Streaming chunks must be dispatched to onChunk handler");
    const streamedText = chunks.join("");
    assert.equal(streamedText, res.response, "Streamed content must match final grounded response exactly");
  });
});
