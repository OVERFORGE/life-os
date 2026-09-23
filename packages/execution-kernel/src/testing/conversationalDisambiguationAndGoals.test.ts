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

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://overforge:overforgedatabase@cluster0.s8cvx.mongodb.net/life-os";

async function ensureUser(uId: string) {
  const { User } = await import("@/server/db/models/User");
  await User.findOneAndUpdate(
    { _id: uId },
    {
      _id: uId,
      email: `test_goals_${uId}@lifeos.local`,
      name: "Goal Governance Test User",
      settings: { timezone: "America/New_York" },
    },
    { upsert: true }
  );
}

describe("Semantic Entity Resolution & Goal Governance Suite (TC-G01 through TC-G12)", () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const conversationId = `conv_goals_test_${Date.now()}`;

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

  // ─── TC-G01: Descriptive Task Reference Without Verbatim Title ──────────────
  it("TC-G01: Resolves descriptive task reference to full title and completes without token-overlap heuristics", async () => {
    const supervisor = Supervisor.getInstance();
    const { Task } = await import("@/server/db/models/Task");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc_g01_${Date.now()}`;

    // Create target task with full verbatim title
    const task = await Task.create({
      userId: isolatedUserId,
      title: "Send updated project budget to Michael",
      dueDate: "2026-09-22",
      status: "pending",
      priority: "high",
    });

    // User gives descriptive reference: "done with the that project budget task"
    const res = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "done with the that project budget task",
    });

    assert.equal(res.actionsExecuted, 1, "Must execute exactly one complete_task action");
    assert.ok(
      res.response.includes("Send updated project budget to Michael"),
      `Response should mention full task title: "${res.response}"`
    );
    assert.ok(
      res.response.toLowerCase().includes("complete") || res.response.toLowerCase().includes("marked"),
      `Response should indicate completion: "${res.response}"`
    );

    // Verify database state
    const updated = await Task.findById(task._id);
    assert.equal(updated?.status, "completed", "Database task must transition to completed");
  });

  // ─── TC-G02: Contextual Anaphoric Task Reference ───────────────────────────
  it("TC-G02: Resolves contextual anaphoric reference ('done with that task') via STM activeFocus", async () => {
    const supervisor = Supervisor.getInstance();
    const { Task } = await import("@/server/db/models/Task");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc_g02_${Date.now()}`;

    // Turn 1: Create a task
    const t1 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Remind me to submit the quarterly tax report tomorrow",
    });
    assert.equal(t1.actionsExecuted, 1);

    // Turn 2: Refer anaphorically to that task
    const t2 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "done with that task",
    });

    assert.equal(t2.actionsExecuted, 1);
    assert.ok(t2.response.includes("quarterly tax report") || t2.response.includes("tax"));

    const tasks = await Task.find({ userId: isolatedUserId });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, "completed");
  });

  // ─── TC-G03: Material Ambiguity On Multiple Matching Tasks ─────────────────
  it("TC-G03: Halts with clarification and executes 0 actions when multiple tasks match descriptively", async () => {
    const supervisor = Supervisor.getInstance();
    const { Task } = await import("@/server/db/models/Task");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc_g03_${Date.now()}`;

    // Create two conflicting tasks
    await Task.create({
      userId: isolatedUserId,
      title: "Review marketing budget",
      status: "pending",
      dueDate: "2026-09-22",
    });
    await Task.create({
      userId: isolatedUserId,
      title: "Review engineering budget",
      status: "pending",
      dueDate: "2026-09-22",
    });

    // User references ambiguously: "done with the budget task"
    const res = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "done with the budget task",
    });

    assert.equal(res.actionsExecuted, 0, "Must NEVER execute actions when ambiguous");
    assert.equal(res.terminationReason, "AWAITING_CLARIFICATION");
    assert.ok(
      res.response.includes("marketing") || res.response.includes("engineering") || res.response.includes("Which"),
      `Response should ask clarification for candidates: "${res.response}"`
    );

    // Verify neither task was mutated
    const pendingTasks = await Task.find({ userId: isolatedUserId, status: "pending" });
    assert.equal(pendingTasks.length, 2, "Both tasks must remain pending in database");
  });

  // ─── TC-G04: Unresolvable Descriptive Reference ────────────────────────────
  it("TC-G04: Returns clarification and executes 0 actions when descriptive reference does not exist", async () => {
    const supervisor = Supervisor.getInstance();
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc_g04_${Date.now()}`;

    const res = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "done with the spaceship launch preparation task",
    });

    assert.equal(res.actionsExecuted, 0);
    assert.ok(
      res.response.toLowerCase().includes("couldn't find") ||
      res.response.toLowerCase().includes("clarify") ||
      res.response.toLowerCase().includes("specify"),
      `Response should indicate not found: "${res.response}"`
    );
  });

  // ─── TC-G05: Habit Proposal Grounding (No 'goal' leakage) ──────────────────
  it("TC-G05: Proposes daily habit as Goal with cadence daily, without 'goal' prompt leakage", async () => {
    const supervisor = Supervisor.getInstance();
    const { Goal } = await import("@/features/goals/models/Goal");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc_g05_${Date.now()}`;

    const res = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "I want to start reading 15 pages of non-fiction every morning. Can we set that up as a daily habit?",
    });

    assert.equal(res.actionsExecuted, 1, "Must execute exactly one propose_goal action");

    // Must NOT say 'I've proposed that goal: "goal"'
    assert.ok(
      !res.response.includes('that goal: "goal"') && !res.response.includes("goal: 'goal'"),
      `Must NOT leak generic 'goal' placeholder: "${res.response}"`
    );
    assert.ok(
      res.response.toLowerCase().includes("reading") || res.response.toLowerCase().includes("non-fiction"),
      `Response should ground the actual habit title: "${res.response}"`
    );

    // Verify database document
    const goals = await Goal.find({ userId: isolatedUserId });
    assert.equal(goals.length, 1, "Must create exactly one Goal document");
    const goal = goals[0];
    assert.equal(goal.status, "proposed", "Initial status must be proposed");
    assert.equal(goal.cadence, "daily", "Cadence must be daily");
    assert.ok(
      goal.title.toLowerCase().includes("reading") || goal.title.toLowerCase().includes("non-fiction"),
      `Goal title must reflect habit: "${goal.title}"`
    );
  });

  // ─── TC-G06: State-Driven Confirmation of Proposed Goal ────────────────────
  it("TC-G06: Continues pending proposal and activates goal on user confirmation ('yes sure do that')", async () => {
    const supervisor = Supervisor.getInstance();
    const { Goal } = await import("@/features/goals/models/Goal");
    const { Task } = await import("@/server/db/models/Task");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc_g06_${Date.now()}`;

    // Turn 1: Propose habit
    const t1 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "I want to start reading 15 pages of non-fiction every morning. Can we set that up as a daily habit?",
    });
    assert.equal(t1.actionsExecuted, 1);

    // Turn 2: User confirms: "yes sure do that"
    const t2 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "yes sure do that",
    });

    assert.equal(t2.actionsExecuted, 1, "Must execute confirm_goal action");
    assert.ok(
      t2.response.toLowerCase().includes("activated") ||
      t2.response.toLowerCase().includes("confirmed") ||
      t2.response.toLowerCase().includes("reading"),
      `Response should confirm goal activation: "${t2.response}"`
    );

    // Invariant: ZERO tasks created during goal confirmation
    const tasks = await Task.find({ userId: isolatedUserId });
    assert.equal(tasks.length, 0, "Must NEVER create an ad-hoc task during goal confirmation");

    // Invariant: Exactly 1 goal in database, status transitioned to 'active'
    const goals = await Goal.find({ userId: isolatedUserId });
    assert.equal(goals.length, 1, "Must NOT create a duplicate goal document");
    assert.equal(goals[0].status, "active", "Goal status must transition to active");
    assert.ok(goals[0].confirmedAt, "Goal confirmedAt timestamp must be set");
  });

  // ─── TC-G07: Conversational Context Projection ('what goal ?') ─────────────
  it("TC-G07: Conversational question ('what goal ?') projects bounded context without generic greeting amnesia", async () => {
    const supervisor = Supervisor.getInstance();
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc_g07_${Date.now()}`;

    // Turn 1: Propose habit
    await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "I want to start reading 15 pages of non-fiction every morning. Can we set that up as a daily habit?",
    });

    // Turn 2: User inquires conversationally: "what goal ?"
    const t2 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "what goal ?",
    });

    assert.equal(t2.actionsExecuted, 0, "Conversational query must execute 0 mutations");
    assert.ok(
      !t2.response.includes("I'm Aven, your personal AI assistant") && !t2.response.includes("What's on your mind?"),
      `Must NOT drop context or give generic introduction: "${t2.response}"`
    );
    assert.ok(
      t2.response.toLowerCase().includes("reading") ||
      t2.response.toLowerCase().includes("non-fiction") ||
      t2.response.toLowerCase().includes("habit") ||
      t2.response.toLowerCase().includes("proposed") ||
      t2.response.toLowerCase().includes("pages"),
      `Response must reference the proposed habit: "${t2.response}"`
    );
  });

  // ─── TC-G08: Duplicate Goal Governance (Partial Unique Index & E11000) ──────
  it("TC-G08: Enforces MongoDB partial unique compound index and prevents duplicate active goals", async () => {
    const kernel = KernelCapabilityService.getInstance();
    const { Goal } = await import("@/features/goals/models/Goal");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);

    // Initial goal creation
    const p1: ActionProposal = {
      proposalId: "prop_g08_1",
      domain: "productivity",
      actionType: "create_goal",
      riskClass: "MEDIUM_COMPENSABLE",
      payload: {
        title: "Exercise 30 Minutes Daily",
        category: "health",
        cadence: "daily",
        targetType: "habit",
      },
      dependencies: [],
      executionEligibility: "READY",
    };

    const res1 = await kernel.executeAction(isolatedUserId, p1);
    assert.ok(res1.success);

    // Attempting to create duplicate active goal with identical title
    const p2: ActionProposal = {
      proposalId: "prop_g08_2",
      domain: "productivity",
      actionType: "create_goal",
      riskClass: "MEDIUM_COMPENSABLE",
      payload: {
        title: "Exercise 30 Minutes Daily",
        category: "health",
        cadence: "daily",
        targetType: "habit",
      },
      dependencies: [],
      executionEligibility: "READY",
    };

    const res2 = await kernel.executeAction(isolatedUserId, p2);
    assert.equal(res2.success, false, "Second goal proposal must fail duplicate detection");
    assert.ok(
      res2.error?.includes("DUPLICATE_DETECTED") || res2.error?.includes("already exists"),
      `Error should be duplicate detected: "${res2.error}"`
    );

    // Verify database document count
    const activeGoals = await Goal.find({
      userId: isolatedUserId,
      title: "Exercise 30 Minutes Daily",
      status: { $in: ["active", "proposed"] },
    });
    assert.equal(activeGoals.length, 1, "Database must strictly contain exactly 1 active goal document");
  });

  // ─── TC-G09: Archived Goal Isolation ───────────────────────────────────────
  it("TC-G09: Allows new active goal creation when previous goal with same title is archived", async () => {
    const kernel = KernelCapabilityService.getInstance();
    const { Goal } = await import("@/features/goals/models/Goal");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);

    // Create an archived goal
    await Goal.create({
      userId: isolatedUserId,
      title: "Learn Spanish",
      status: "archived",
      archivedAt: new Date(),
    });

    // Create new active goal with same title
    const p: ActionProposal = {
      proposalId: "prop_g09_1",
      domain: "productivity",
      actionType: "create_goal",
      riskClass: "MEDIUM_COMPENSABLE",
      payload: {
        title: "Learn Spanish",
        category: "personal",
        cadence: "daily",
        targetType: "habit",
      },
      dependencies: [],
      executionEligibility: "READY",
    };

    const res = await kernel.executeAction(isolatedUserId, p);
    assert.ok(res.success, `Archived goal must not block active creation: ${res.error}`);

    const activeGoals = await Goal.find({
      userId: isolatedUserId,
      title: "Learn Spanish",
      status: { $in: ["active", "proposed"] },
    });
    assert.equal(activeGoals.length, 1, "Must have exactly 1 active goal");

    const allSpanishGoals = await Goal.find({
      userId: isolatedUserId,
      title: "Learn Spanish",
    });
    assert.equal(allSpanishGoals.length, 2, "Total goals must be 2 (1 archived, 1 active)");
  });

  // ─── TC-G10: Habit vs Task Semantic Routing ────────────────────────────────
  it("TC-G10: Correctly discriminates discrete obligations (Task) from recurring routines (Goal)", async () => {
    const supervisor = Supervisor.getInstance();
    const { Goal } = await import("@/features/goals/models/Goal");
    const { Task } = await import("@/server/db/models/Task");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);
    const isolatedConvId = `conv_tc_g10_${Date.now()}`;

    // Discrete obligation -> Task
    const r1 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "Schedule a meeting with Sarah tomorrow at 2pm",
    });
    assert.equal(r1.actionsExecuted, 1);
    const tasks = await Task.find({ userId: isolatedUserId });
    assert.equal(tasks.length, 1, "Discrete obligation must create Task");

    // Recurring routine -> Goal
    const r2 = await supervisor.processRequest({
      userId: isolatedUserId,
      conversationId: isolatedConvId,
      message: "I want to do 20 pushups every morning as a daily habit",
    });
    assert.equal(r2.actionsExecuted, 1);
    const goals = await Goal.find({ userId: isolatedUserId });
    assert.equal(goals.length, 1, "Recurring routine must create Goal");
    assert.equal(goals[0].cadence, "daily");
  });

  // ─── TC-G11: Compensation of Proposed Goal ─────────────────────────────────
  it("TC-G11: Compensating/reverting a proposed goal removes it cleanly without orphaned documents", async () => {
    const kernel = KernelCapabilityService.getInstance();
    const { Goal } = await import("@/features/goals/models/Goal");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);

    const p: ActionProposal = {
      proposalId: "prop_g11_1",
      domain: "productivity",
      actionType: "propose_goal",
      riskClass: "MEDIUM_COMPENSABLE",
      payload: {
        title: "Drink 3 liters of water daily",
        category: "health",
        cadence: "daily",
      },
      dependencies: [],
      executionEligibility: "READY",
    };

    const execRes = await kernel.executeAction(isolatedUserId, p);
    assert.ok(execRes.success);
    const goalId = execRes.targetEntity?.entityId || execRes.data?.goalId;
    assert.ok(goalId);

    // Compensate
    const compRes = await kernel.compensateAction(
      {
        operationId: "op_g11_comp",
        turnId: "turn_comp",
        actionType: "propose_goal",
        domain: "productivity",
        payloadSnapshot: { goalId },
        success: true,
        executedAt: new Date(),
        reversibility: "atomic_single_doc",
      },
      isolatedUserId
    );
    assert.ok(compRes === true || (compRes as any)?.success, "Compensation must return true");

    // Verify goal is gone
    const remaining = await Goal.findById(goalId);
    assert.equal(remaining, null, "Compensated goal must be deleted from database");
  });

  // ─── TC-G12: Deterministic Replay ──────────────────────────────────────────
  it("TC-G12: Replays execution proposal deterministically without LLM dependency", async () => {
    const kernel = KernelCapabilityService.getInstance();
    const { Task } = await import("@/server/db/models/Task");
    const isolatedUserId = new mongoose.Types.ObjectId().toString();
    await ensureUser(isolatedUserId);

    const proposal: ActionProposal = {
      proposalId: "prop_g12_replay",
      domain: "productivity",
      actionType: "create_task",
      riskClass: "LOW_REVERSIBLE",
      payload: {
        title: "Review Quarterly Results Replay",
        dueDate: "2026-09-25",
        priority: "medium",
      },
      dependencies: [],
      executionEligibility: "READY",
    };

    const res = await kernel.executeAction(isolatedUserId, proposal);
    assert.ok(res.success);
    assert.ok(res.targetEntity);
    assert.equal(res.targetEntity?.displayName, "Review Quarterly Results Replay");
    assert.equal(res.targetEntity?.entityType, "task");

    const created = await Task.findOne({ userId: isolatedUserId, title: "Review Quarterly Results Replay" });
    assert.ok(created);
    assert.equal(created.dueDate, "2026-09-25");
  });
});
