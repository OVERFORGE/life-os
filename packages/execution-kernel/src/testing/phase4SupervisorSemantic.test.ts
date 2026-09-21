import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Supervisor } from "../orchestration/supervisor/Supervisor";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://overforge:overforgedatabase@cluster0.s8cvx.mongodb.net/life-os";

test("Phase 4: Supervisor Semantic Orchestration & End-to-End Persistence", async () => {
  // Connect to live MongoDB Atlas
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  assert.equal(mongoose.connection.readyState, 1, "MongoDB must be actively connected");

  const { User } = await import("@/server/db/models/User");
  const { Task } = await import("@/server/db/models/Task");
  const { FoodItem } = await import("@/server/db/models/FoodItem");
  const { DailyLog } = await import("@/server/db/models/DailyLog");
  const { NutritionLog } = await import("@/server/db/models/NutritionLog");

  const testEmail = "test_phase4_supervisor@lifeos.local";
  let user = await User.findOne({ email: testEmail });
  if (!user) {
    user = await User.create({
      email: testEmail,
      name: "Phase4 Test User",
      settings: { timezone: "America/New_York" },
    });
  }
  const userId = user._id.toString();

  const supervisor = Supervisor.createDefault();

  // ─── Test 1: Colloquial Task Creation ───────────────────────────────────────
  const taskTurn = await supervisor.processRequest({
    userId,
    userName: "Phase4 Test User",
    message: "Hey Aven, can you add a task to call Mom tomorrow afternoon?",
  });

  assert.equal(taskTurn.actionsExecuted, 1, "Must execute 1 action for colloquial task creation");
  assert.ok(taskTurn.response.toLowerCase().includes("mom"), "Response must mention Mom");
  assert.ok(!taskTurn.response.toLowerCase().includes("mock"), "Response must never leak mock IDs");

  // State-level verification in MongoDB
  const createdTask = await Task.findOne({ userId, title: /mom/i }).sort({ createdAt: -1 });
  assert.ok(createdTask, "Task document must exist in MongoDB");
  assert.equal(createdTask.status, "pending");

  // ─── Test 2: Colloquial Meal Logging with Macro Enrichment ──────────────────
  const mealTurn = await supervisor.processRequest({
    userId,
    userName: "Phase4 Test User",
    message: "I had two eggs and toast for breakfast.",
  });

  assert.equal(mealTurn.actionsExecuted, 1, "Must execute 1 action for colloquial meal logging");
  assert.ok(mealTurn.response.toLowerCase().includes("logged"), "Response must confirm meal logged");

  // State-level verification in MongoDB NutritionLog
  const today = new Date().toISOString().split("T")[0];
  const nutritionLog = await NutritionLog.findOne({ userId, date: today });
  assert.ok(nutritionLog, "NutritionLog document must exist in MongoDB");
  assert.ok(nutritionLog.meals.length > 0, "Meals must be populated");
  assert.ok(nutritionLog.dailyTotals.calories > 0, "Calories must be tracked");

  // ─── Test 3: Colloquial Mental State / Fatigue ──────────────────────────────
  const mentalTurn = await supervisor.processRequest({
    userId,
    userName: "Phase4 Test User",
    message: "I'm feeling completely exhausted today, energy is at zero.",
  });

  assert.equal(mentalTurn.actionsExecuted, 1, "Must execute 1 action for mental state log");
  assert.ok(mentalTurn.response.toLowerCase().includes("mental state"), "Response must confirm mental state check-in");

  // State-level verification in MongoDB DailyLog
  const dailyLog = await DailyLog.findOne({ userId, date: today });
  assert.ok(dailyLog, "DailyLog document must exist in MongoDB");
  assert.ok(dailyLog.mental?.energy !== undefined, "DailyLog.mental.energy must be recorded");

  // ─── Test 4: Compound Turn (Meal + Mental + Task) ───────────────────────────
  const compoundTurn = await supervisor.processRequest({
    userId,
    userName: "Phase4 Test User",
    message: "I had a protein shake after the gym, I'm exhausted, and remind me to finish the deck tomorrow.",
  });

  assert.ok(compoundTurn.actionsExecuted >= 2, "Must execute multiple actions for compound turn");
  assert.ok(compoundTurn.response.toLowerCase().includes("logged") || compoundTurn.response.toLowerCase().includes("deck"));

  // ─── Test 5: Negation & Cancellation ────────────────────────────────────────
  const preTaskCount = await Task.countDocuments({ userId });
  const cancelTurn = await supervisor.processRequest({
    userId,
    userName: "Phase4 Test User",
    message: "Actually, don't add that task.",
  });

  assert.equal(cancelTurn.actionsExecuted, 0, "Must execute 0 actions on negation/cancellation");
  assert.ok(cancelTurn.response.toLowerCase().includes("cancel"), "Response must acknowledge cancellation");
  const postTaskCount = await Task.countDocuments({ userId });
  assert.equal(postTaskCount, preTaskCount, "No new tasks must be created on cancellation");

  // ─── Test 6: Pure Casual Dialogue ───────────────────────────────────────────
  const chatTurn = await supervisor.processRequest({
    userId,
    userName: "Phase4 Test User",
    message: "Hello Aven, how's it going today?",
  });

  assert.equal(chatTurn.actionsExecuted, 0, "Must execute 0 actions on pure casual dialogue");
  assert.ok(chatTurn.response.length > 0, "Must return conversational response");

  // Cleanup test documents
  await Task.deleteMany({ userId });
  await NutritionLog.deleteMany({ userId });
  await DailyLog.deleteMany({ userId });

  await mongoose.disconnect();
});
