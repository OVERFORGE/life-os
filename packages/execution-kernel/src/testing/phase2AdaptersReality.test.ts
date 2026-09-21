import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  CreateTaskAdapter,
  CompleteTaskAdapter,
  UpdateTaskAdapter,
  DeleteTaskAdapter,
  LogMealAdapter,
  LogWorkoutAdapter,
  LogActivityAdapter,
  CreateGoalAdapter,
  RecordMentalStateAdapter,
  RecoveryConstraintAdapter,
} from "../orchestration/kernel/DefaultActionAdapters";
import { ActionProposal } from "../orchestration/contracts/ActionProposalContracts";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://overforge:overforgedatabase@cluster0.s8cvx.mongodb.net/life-os";

test("Phase 2: Offline Zero Fake Success Enforcement", async () => {
  // Ensure DB is disconnected
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  delete process.env.LIFEOS_ALLOW_TEST_MOCKS;

  const mockProposal = (actionType: string, payload: any): ActionProposal => ({
    id: "prop_offline_001",
    planId: "plan_offline_001",
    actionType,
    domain: "productivity",
    riskClass: "LOW_REVERSIBLE",
    state: "PROPOSED",
    title: "Offline Test Action",
    rationale: "Testing offline disconnection guard",
    payload,
    requiresConfirmation: false,
    estimatedImpact: "Testing offline throw",
  });

  const taskAdapter = new CreateTaskAdapter();
  const mealAdapter = new LogMealAdapter();
  const mentalAdapter = new RecordMentalStateAdapter();
  const workoutAdapter = new LogWorkoutAdapter();
  const goalAdapter = new CreateGoalAdapter();

  // Test 1: Task creation must throw [KERNEL_DATABASE_DISCONNECTED]
  await assert.rejects(
    async () => {
      await taskAdapter.execute(mockProposal("create_task", { title: "Offline Task" }), "test_user_offline");
    },
    /\[KERNEL_DATABASE_DISCONNECTED\]/
  );

  // Test 2: Meal logging must throw [KERNEL_DATABASE_DISCONNECTED]
  await assert.rejects(
    async () => {
      await mealAdapter.execute(mockProposal("log_meal", { description: "Offline Salad" }), "test_user_offline");
    },
    /\[KERNEL_DATABASE_DISCONNECTED\]/
  );

  // Test 3: Mental state recording must throw [KERNEL_DATABASE_DISCONNECTED]
  await assert.rejects(
    async () => {
      await mentalAdapter.execute(mockProposal("record_mental_estimate", { mood: 3, energy: 2 }), "test_user_offline");
    },
    /\[KERNEL_DATABASE_DISCONNECTED\]/
  );

  // Test 4: Workout logging must throw [KERNEL_DATABASE_DISCONNECTED]
  await assert.rejects(
    async () => {
      await workoutAdapter.execute(mockProposal("log_workout", { workoutType: "Running" }), "test_user_offline");
    },
    /\[KERNEL_DATABASE_DISCONNECTED\]/
  );

  // Test 5: Goal creation must throw [KERNEL_DATABASE_DISCONNECTED]
  await assert.rejects(
    async () => {
      await goalAdapter.execute(mockProposal("create_goal", { title: "Offline Goal" }), "test_user_offline");
    },
    /\[KERNEL_DATABASE_DISCONNECTED\]/
  );
});

test("Phase 2: Live MongoDB Atlas State Persistence & Verification", async () => {
  // Connect to live MongoDB
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  assert.equal(mongoose.connection.readyState, 1, "MongoDB must be actively connected");

  const { User } = await import("@/server/db/models/User");
  const { Task } = await import("@/server/db/models/Task");
  const { FoodItem } = await import("@/server/db/models/FoodItem");
  const { DailyLog } = await import("@/server/db/models/DailyLog");

  // Create or resolve test user
  const testEmail = "test_phase2_reality@lifeos.local";
  let user = await User.findOne({ email: testEmail });
  if (!user) {
    user = await User.create({
      email: testEmail,
      name: "Phase2 Test User",
      settings: { timezone: "America/New_York" },
    });
  }
  const userId = user._id.toString();

  const taskAdapter = new CreateTaskAdapter();
  const completeAdapter = new CompleteTaskAdapter();
  const mealAdapter = new LogMealAdapter();
  const mentalAdapter = new RecordMentalStateAdapter();

  // Test 1: Real Task Creation in MongoDB
  const taskTitle = `Phase2 Reality Task ${Date.now()}`;
  const taskProposal: ActionProposal = {
    id: "prop_p2_task",
    planId: "plan_p2",
    actionType: "create_task",
    domain: "productivity",
    riskClass: "LOW_REVERSIBLE",
    state: "PROPOSED",
    title: "Create Real Task",
    rationale: "Phase 2 state verification",
    payload: {
      title: taskTitle,
      dueDate: "today",
      priority: "high",
    },
    requiresConfirmation: false,
    estimatedImpact: "Creates real task in MongoDB",
  };

  const createResult = await taskAdapter.execute(taskProposal, userId);
  assert.equal(createResult.success, true, "Task creation must succeed");
  assert.ok(createResult.taskId, "Real taskId must be returned");
  assert.ok(!createResult.taskId.startsWith("task_mock_"), "Must not return fake mock task ID");

  // Query database directly to verify persistence
  const persistedTask = await Task.findById(createResult.taskId);
  assert.ok(persistedTask, "Task document must exist in MongoDB");
  assert.equal(persistedTask.title, taskTitle);
  assert.equal(persistedTask.userId.toString(), userId);
  assert.equal(persistedTask.status, "pending");

  // Test 2: Real Task Completion in MongoDB
  const completeProposal: ActionProposal = {
    id: "prop_p2_complete",
    planId: "plan_p2",
    actionType: "complete_task",
    domain: "productivity",
    riskClass: "LOW_REVERSIBLE",
    state: "PROPOSED",
    title: "Complete Real Task",
    rationale: "Phase 2 completion verification",
    payload: {
      taskId: createResult.taskId,
    },
    requiresConfirmation: false,
    estimatedImpact: "Completes task in MongoDB",
  };

  const completeResult = await completeAdapter.execute(completeProposal, userId);
  assert.equal(completeResult.success, true, "Task completion must succeed");

  // Query database directly to verify status changed
  const completedTask = await Task.findById(createResult.taskId);
  assert.ok(completedTask, "Task document must still exist");
  assert.equal(completedTask.status, "completed", "Status in MongoDB must be completed");

  // Test 3: Real Meal Logging with On-Demand FoodItem Upsert
  const uniqueFoodName = `Phase2 Sourdough Toast ${Date.now()}`;
  const mealProposal: ActionProposal = {
    id: "prop_p2_meal",
    planId: "plan_p2",
    actionType: "log_meal",
    domain: "health",
    riskClass: "LOW_REVERSIBLE",
    state: "PROPOSED",
    title: "Log Real Meal",
    rationale: "Phase 2 meal persistence verification",
    payload: {
      description: "Breakfast toast",
      mealType: "breakfast",
      items: [
        {
          name: uniqueFoodName,
          quantity: 2,
          calories: 220,
          protein: 8,
          carbs: 40,
          fats: 3,
        },
      ],
      totalCalories: 220,
      enrichmentSource: "ai_nutrition_estimator",
    },
    requiresConfirmation: false,
    estimatedImpact: "Persists meal and cataloged food item in MongoDB",
  };

  const mealResult = await mealAdapter.execute(mealProposal, userId);
  assert.equal(mealResult.success, true, "Meal logging must succeed");
  assert.ok(!mealResult.mealId?.startsWith("meal_mock_"), "Must not return fake mock meal ID");

  // Direct DB check for on-demand FoodItem
  const createdFoodItem = await FoodItem.findOne({ name: uniqueFoodName });
  assert.ok(createdFoodItem, "FoodItem must be automatically cataloged in MongoDB");
  assert.equal(createdFoodItem.macros?.calories, 220, "Calories correctly recorded in macros");
  assert.equal(createdFoodItem.macros?.protein, 8, "Protein correctly recorded in macros");

  // Test 4: Real Mental State Persistence in DailyLog
  const mentalProposal: ActionProposal = {
    id: "prop_p2_mental",
    planId: "plan_p2",
    actionType: "record_mental_estimate",
    domain: "wellness",
    riskClass: "LOW_REVERSIBLE",
    state: "PROPOSED",
    title: "Record Mental State",
    rationale: "Phase 2 mental state verification",
    payload: {
      date: new Date().toISOString().split("T")[0],
      mood: 4,
      energy: 2,
      stress: 8,
      focus: 3,
      notes: "Phase 2 state-level verification test note",
    },
    requiresConfirmation: false,
    estimatedImpact: "Persists mental metrics in DailyLog",
  };

  const mentalResult = await mentalAdapter.execute(mentalProposal, userId);
  assert.equal(mentalResult.success, true, "Mental state recording must succeed");
  assert.equal(mentalResult.data.appliedFields.includes("mental.energy"), true);

  // Direct DB check on DailyLog.mental
  const today = new Date().toISOString().split("T")[0];
  const dailyLog = await DailyLog.findOne({ userId, date: today });
  assert.ok(dailyLog, "DailyLog document must exist in MongoDB");
  assert.equal(dailyLog.mental?.energy, 2, "DailyLog.mental.energy must be 2");
  assert.equal(dailyLog.mental?.stress, 8, "DailyLog.mental.stress must be 8");
  assert.equal(dailyLog.mental?.mood, 4, "DailyLog.mental.mood must be 4");
  assert.equal(dailyLog.mental?.focus, 3, "DailyLog.mental.focus must be 3");
  assert.equal(dailyLog.mental?.notes, "Phase 2 state-level verification test note");

  // Test 5: Compensation / Rollback
  const compensateResult = await taskAdapter.compensate(taskProposal, { taskId: createResult.taskId }, userId);
  assert.equal(compensateResult.compensated, true, "Compensation must succeed");
  const rolledBackTask = await Task.findById(createResult.taskId);
  assert.equal(rolledBackTask, null, "Task document must be deleted from MongoDB after compensation");

  // Cleanup created test records
  await FoodItem.deleteOne({ name: uniqueFoodName });
  await DailyLog.deleteOne({ userId, date: today });

  await mongoose.disconnect();
});
