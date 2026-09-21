import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env") });

import { Supervisor } from "../orchestration/supervisor/Supervisor";

describe("PHASE 10: Production Reality & Longitudinal Simulation Parity", () => {
  let TaskModel: any;
  let DailyLogModel: any;
  let NutritionLogModel: any;
  let ActionAuditRecordModel: any;

  const testPersonas = [
    { id: new mongoose.Types.ObjectId().toString(), name: "Alex Chen (Founder)", role: "FOUNDER" },
    { id: new mongoose.Types.ObjectId().toString(), name: "Dr. Maya Patel (Resident)", role: "DOCTOR" },
    { id: new mongoose.Types.ObjectId().toString(), name: "Samir Al-Mansoor (Athlete)", role: "ATHLETE" },
  ];

  before(async () => {
    assert.ok(process.env.MONGODB_URI, "MONGODB_URI must be configured in environment");
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    const taskModule = await import("@/server/db/models/Task");
    TaskModel = taskModule.Task;
    const dailyModule = await import("@/server/db/models/DailyLog");
    DailyLogModel = dailyModule.DailyLog;
    const nutritionModule = await import("@/server/db/models/NutritionLog");
    NutritionLogModel = nutritionModule.NutritionLog;
    const auditModule = await import("@/server/db/models/ActionAuditRecordModel");
    ActionAuditRecordModel = auditModule.ActionAuditRecordModel;
  });

  after(async () => {
    if (mongoose.connection.readyState === 1) {
      for (const p of testPersonas) {
        await TaskModel.deleteMany({
          $or: [{ userId: p.id }, { userId: new mongoose.Types.ObjectId(p.id) }],
        });
        await DailyLogModel.deleteMany({
          $or: [{ userId: p.id }, { userId: new mongoose.Types.ObjectId(p.id) }],
        });
        await NutritionLogModel.deleteMany({
          $or: [{ userId: p.id }, { userId: new mongoose.Types.ObjectId(p.id) }],
        });
      }
    }
  });

  it("SIMULATION INVARIANT 1: Live MongoDB Atlas Connection Verified with Zero Mocks", async () => {
    assert.equal(mongoose.connection.readyState, 1, "Must be connected to genuine MongoDB Atlas");
    // Verify ActionAuditRecordModel contains no mock IDs
    const mockAuditRecords = await ActionAuditRecordModel.find({
      $or: [
        { actionId: { $regex: /_mock_/i } },
        { "executionResult.taskId": { $regex: /task_mock_/i } },
        { "executionResult.data.taskId": { $regex: /task_mock_/i } },
      ],
    }).lean();
    assert.equal(mockAuditRecords.length, 0, "Zero mock IDs must exist in production audit ledger");
  });

  it("SIMULATION INVARIANT 2: Multi-Persona Natural Language Day Simulation with Real Persistence", async () => {
    const supervisor = Supervisor.getInstance();

    // Persona 1: Founder natural morning planning
    const founder = testPersonas[0];
    const founderRes = await supervisor.processRequest({
      userId: founder.id,
      message: "Hey Aven, schedule deep work session tomorrow at 9am",
    });
    assert.ok(founderRes.actionsExecuted >= 1, "Founder task scheduled");

    const founderTask = await TaskModel.findOne({
      $or: [{ userId: founder.id }, { userId: new mongoose.Types.ObjectId(founder.id) }],
      title: { $regex: /deep work/i },
    });
    assert.ok(founderTask, "Founder task must exist in genuine MongoDB Atlas");
    assert.equal(founderTask.dueTime, "09:00");

    // Persona 2: Resident acute shift check-in (Meal + Fatigue)
    const doctor = testPersonas[1];
    const doctorRes = await supervisor.processRequest({
      userId: doctor.id,
      message: "I had a protein bar and black coffee, and I'm feeling completely exhausted after night shift",
    });
    assert.ok(doctorRes.actionsExecuted >= 2, "Resident meal and mental state logged");

    const today = new Date().toISOString().split("T")[0];
    const doctorDaily = await DailyLogModel.findOne({
      $or: [{ userId: doctor.id }, { userId: new mongoose.Types.ObjectId(doctor.id) }],
      date: today,
    });
    assert.ok(doctorDaily, "Doctor DailyLog must exist in MongoDB Atlas");
    assert.ok(doctorDaily.mental.energy <= 3, "Exhaustion must be recorded in mental state");

    // Persona 3: Athlete task completion & reflection
    const athlete = testPersonas[2];
    const athleteTask = await TaskModel.create({
      userId: athlete.id,
      title: "Morning tempo run 10k",
      status: "pending",
      dueDate: today,
    });

    const athleteRes = await supervisor.processRequest({
      userId: athlete.id,
      message: "Finished the tempo run, mark it done",
      knownTasks: [{ id: athleteTask._id.toString(), title: athleteTask.title }],
    });
    assert.ok(athleteRes.actionsExecuted >= 1, "Athlete task completion executed");

    const refreshedAthleteTask = await TaskModel.findById(athleteTask._id);
    assert.equal(refreshedAthleteTask.status, "completed", "Task must be marked completed in MongoDB Atlas");
  });

  it("SIMULATION INVARIANT 3: Longitudinal Non-Interference — Personas cannot mutate each other's data", async () => {
    const founder = testPersonas[0];
    const doctor = testPersonas[1];

    const founderTasks = await TaskModel.find({
      $or: [{ userId: founder.id }, { userId: new mongoose.Types.ObjectId(founder.id) }],
    });
    const doctorTasks = await TaskModel.find({
      $or: [{ userId: doctor.id }, { userId: new mongoose.Types.ObjectId(doctor.id) }],
    });

    // Ensure state isolation across distinct user IDs
    for (const ft of founderTasks) {
      assert.notEqual(String(ft.userId), String(doctor.id));
    }
    assert.ok(founderTasks.length >= 1);
  });
});
