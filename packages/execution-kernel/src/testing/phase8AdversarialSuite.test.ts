import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env") });

import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { SemanticIntentInterpreter } from "../orchestration/semantic/SemanticIntentInterpreter";

describe("PHASE 8: Natural-Language End-to-End & Adversarial Suite", () => {
  const userId = new mongoose.Types.ObjectId().toString();
  let TaskModel: any;
  let DailyLogModel: any;
  let NutritionLogModel: any;

  before(async () => {
    if (process.env.MONGODB_URI && mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    const taskModule = await import("@/server/db/models/Task");
    TaskModel = taskModule.Task;
    const dailyModule = await import("@/server/db/models/DailyLog");
    DailyLogModel = dailyModule.DailyLog;
    const nutritionModule = await import("@/server/db/models/NutritionLog");
    NutritionLogModel = nutritionModule.NutritionLog;
  });

  after(async () => {
    if (mongoose.connection.readyState === 1) {
      await TaskModel.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      const today = new Date().toISOString().split("T")[0];
      await DailyLogModel.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
      await NutritionLogModel.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
    }
  });

  it("ADVERSARIAL 1: Negation — 'Don't add that task' produces 0 mutations", async () => {
    const supervisor = Supervisor.getInstance();
    const tasksBefore = await TaskModel.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });

    const res = await supervisor.processRequest({
      userId,
      message: "Actually, don't add that task.",
    });

    const tasksAfter = await TaskModel.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });
    assert.equal(tasksAfter, tasksBefore);
    assert.equal(res.actionsExecuted, 0);
    assert.ok(res.response.includes("cancelled") || res.response.includes("Understood"));
  });

  it("ADVERSARIAL 2: Negated Past — 'I haven't finished the presentation yet' mutates 0 tasks", async () => {
    // Seed a pending task
    const task = await TaskModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      title: "Quarterly Presentation",
      status: "pending",
      dueDate: new Date().toISOString().split("T")[0],
    });

    const supervisor = Supervisor.getInstance();
    const res = await supervisor.processRequest({
      userId,
      message: "I haven't finished the presentation yet.",
      knownTasks: [{ id: task._id.toString(), title: task.title }],
    });

    const refreshed = await TaskModel.findById(task._id);
    assert.equal(refreshed.status, "pending");
    assert.equal(res.actionsExecuted, 0);
  });

  it("ADVERSARIAL 3: Correction / Retraction — 'Actually forget it, never mind' discards mutations", async () => {
    const supervisor = Supervisor.getInstance();
    const tasksBefore = await TaskModel.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });

    const res = await supervisor.processRequest({
      userId,
      message: "Actually forget it, never mind.",
    });

    const tasksAfter = await TaskModel.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });
    assert.equal(tasksAfter, tasksBefore);
    assert.equal(res.actionsExecuted, 0);
  });

  it("ADVERSARIAL 4: Multi-Candidate Task Ambiguity triggers clarification with 0 mutations", async () => {
    const taskA = await TaskModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      title: "Board presentation for investors",
      status: "pending",
      dueDate: new Date().toISOString().split("T")[0],
    });
    const taskB = await TaskModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      title: "Internal presentation for team",
      status: "pending",
      dueDate: new Date().toISOString().split("T")[0],
    });

    const supervisor = Supervisor.getInstance();
    const res = await supervisor.processRequest({
      userId,
      message: "Mark the presentation done",
      knownTasks: [
        { id: taskA._id.toString(), title: taskA.title },
        { id: taskB._id.toString(), title: taskB.title },
      ],
    });

    assert.equal(res.actionsExecuted, 0);
    assert.equal(res.terminationReason, "AWAITING_CLARIFICATION");

    // Invariant: Both tasks remain pending in MongoDB
    const a = await TaskModel.findById(taskA._id);
    const b = await TaskModel.findById(taskB._id);
    assert.equal(a.status, "pending");
    assert.equal(b.status, "pending");
  });

  it("COLLOQUIAL 5: Natural Task Creation with relative date — 'Could you add a task to call Mom tomorrow at 3pm?'", async () => {
    const supervisor = Supervisor.getInstance();
    const res = await supervisor.processRequest({
      userId,
      message: "Could you add a task to call Mom tomorrow at 3pm?",
    });

    assert.ok(res.actionsExecuted >= 1);
    const createdTask = await TaskModel.findOne({
      $or: [{ userId }, { userId: new mongoose.Types.ObjectId(userId) }],
      title: { $regex: /call Mom/i },
    });
    if (!createdTask) {
      const allTasks = await TaskModel.find({
        $or: [{ userId }, { userId: new mongoose.Types.ObjectId(userId) }],
      }).lean();
      console.log("All tasks for user:", allTasks);
    }
    assert.ok(createdTask, "Task must exist in MongoDB");
    assert.equal(createdTask.dueTime, "15:00");
    assert.ok(res.response.includes("scheduled") || res.response.includes("call Mom"));
  });

  it("COLLOQUIAL 6: Compound Meal & Somatic Check-in — 'I had two eggs and toast for breakfast and I'm feeling completely exhausted'", async () => {
    const supervisor = Supervisor.getInstance();
    const res = await supervisor.processRequest({
      userId,
      message: "Hey Aven, I had two eggs and toast for breakfast and I'm feeling completely exhausted",
    });

    assert.ok(res.actionsExecuted >= 2, "Expected both meal and mental state logged");

    const today = new Date().toISOString().split("T")[0];
    const dailyLog = await DailyLogModel.findOne({
      $or: [{ userId }, { userId: new mongoose.Types.ObjectId(userId) }],
      date: today,
    });
    assert.ok(dailyLog, "DailyLog must exist");
    assert.ok(dailyLog.mental.energy <= 3, "Energy must be low (< 3) due to exhaustion");

    const nutritionLog = await NutritionLogModel.findOne({
      $or: [{ userId }, { userId: new mongoose.Types.ObjectId(userId) }],
      date: today,
    });
    assert.ok(nutritionLog, "NutritionLog must exist");
    assert.ok(nutritionLog.meals.length >= 1, "Meal must be recorded in NutritionLog");
    assert.ok(nutritionLog.dailyTotals.calories > 0, "Macros must be non-zero");

    assert.ok(res.response.includes("Logged") || res.response.includes("eggs"));
    assert.ok(res.response.includes("Recorded") || res.response.includes("mental"));
  });
});
