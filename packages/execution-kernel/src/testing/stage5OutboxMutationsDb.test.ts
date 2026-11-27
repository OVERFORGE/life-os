import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { OutboxEventModel } from "../../../../apps/web/server/db/models/OutboxEventModel";
import { DailyLog } from "../../../../apps/web/server/db/models/DailyLog";
import { NutritionLog } from "../../../../apps/web/server/db/models/NutritionLog";
import { WeightLog } from "../../../../apps/web/server/db/models/WeightLog";
import { FoodItem } from "../../../../apps/web/server/db/models/FoodItem";
import { CognitiveStateHistoryModel } from "../server/db/models/CognitiveStateHistoryModel";
import { upsertDailyLogWithOutbox } from "../../../../apps/web/features/daily-log/services/dailyLogEngine";
import { saveNutritionLogWithOutbox } from "../../../../apps/web/features/nutrition/services/nutritionLogEngine";
import { upsertWeightLogWithOutbox, deleteWeightLogWithOutbox } from "../../../../apps/web/features/health/services/weightLogEngine";
import { handleRecordMentalState } from "../dispatch/executionHandlers/handleRecordMentalState";
import { handleLogMeal } from "../dispatch/executionHandlers/handleLogMeal";

describe("Stage 5 Increment 5.1: Outbox Schemas, DailyLog/Nutrition/Weight & Kernel Handlers", () => {
  before(async () => {
    await connectIsolatedTestDB({ dbName: "life-os-stage5-1-test" });
    await Promise.all([
      OutboxEventModel.syncIndexes(),
      DailyLog.syncIndexes(),
      NutritionLog.syncIndexes(),
      WeightLog.syncIndexes(),
      CognitiveStateHistoryModel.syncIndexes(),
    ]);
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    await Promise.all([
      OutboxEventModel.deleteMany({}),
      DailyLog.deleteMany({}),
      NutritionLog.deleteMany({}),
      WeightLog.deleteMany({}),
      FoodItem.deleteMany({}),
      CognitiveStateHistoryModel.deleteMany({}),
    ]);
  });

  it("5.1-01: OutboxEventModel persists deliverySeq null -> number and CognitiveStateHistoryModel persists lastEventId", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const created = await OutboxEventModel.create({
      eventId: "evt_seq_test_1",
      userId,
      category: "DOMAIN_EVENT",
      type: "domain.daily_log.updated",
      aggregateId: "agg_1",
      aggregateType: "dailylog",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: new Date(),
      correlationId: "corr_1",
      source: "test",
      payload: { logId: "agg_1", userId, date: "2026-11-26", updatedAt: new Date().toISOString() },
      deliveryStatus: "DELIVERED",
    });

    assert.equal((created as any).deliverySeq, null);

    await OutboxEventModel.updateOne(
      { _id: created._id },
      { $set: { deliverySeq: 42 } }
    );

    const updated = await OutboxEventModel.findById(created._id).lean();
    assert.equal((updated as any)?.deliverySeq, 42);

    const pendingSeq = await OutboxEventModel.find({
      userId,
      deliveryStatus: "DELIVERED",
      deliverySeq: null,
    }).lean();
    assert.equal(pendingSeq.length, 0);

    const cog = await CognitiveStateHistoryModel.create({
      userId,
      timestamp: Date.now(),
      stress: { estimate: 0.2, confidence: 0.8, primaryFactors: ["sleep"] },
      energy: { estimate: 0.8, confidence: 0.8, primaryFactors: ["sleep"] },
      cognitiveLoad: { estimate: 0.3, confidence: 0.8, primaryFactors: ["work"] },
      focusReadiness: { estimate: 0.85, confidence: 0.8, primaryFactors: ["sleep"] },
      provenance: "USER_MICRO_CHECKIN",
      temporalValidity: { validFrom: 1, validUntil: 2, freshnessTimestamp: 1 },
      lastEventId: "evt_seq_test_1",
    });
    assert.equal(cog.lastEventId, "evt_seq_test_1");
  });

  it("5.1-02: DailyLog outbox engine enforces CAS 409, deduplicates clientMutationId, and survives concurrent first-day creation", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const date = "2026-11-26";

    // Concurrent first-day writes (sleep + mental) must both succeed without E11000 failure
    const [r1, r2] = await Promise.all([
      upsertDailyLogWithOutbox({
        userId,
        date,
        sections: { sleep: { hours: 7.5, quality: 4 } },
        options: { source: "test.concurrent.sleep" },
      }),
      upsertDailyLogWithOutbox({
        userId,
        date,
        sections: { mental: { mood: 4, energy: 4 } },
        options: { source: "test.concurrent.mental" },
      }),
    ]);

    assert.equal(r1.success, true);
    assert.equal(r2.success, true);

    const doc = await DailyLog.findOne({ userId, date }).lean();
    assert.ok(doc);
    assert.equal((doc as any).version, 2);

    const events = await OutboxEventModel.find({ userId, type: "domain.daily_log.updated" }).lean();
    assert.equal(events.length, 2);

    // Explicit stale expectedVersion returns 409 AGGREGATE_CONFLICT
    const stale = await upsertDailyLogWithOutbox({
      userId,
      date,
      sections: { work: { deepWorkHours: 3 } },
      options: { expectedVersion: 0 },
    });
    assert.equal(stale.success, false);
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.code, "AGGREGATE_CONFLICT");

    // Matching clientMutationId deduplicates without double event emission
    const idemId = "mut_daily_idem_1";
    const first = await upsertDailyLogWithOutbox({
      userId,
      date,
      sections: { work: { deepWorkHours: 4 } },
      options: { clientMutationId: idemId, expectedVersion: 2 },
    });
    const retry = await upsertDailyLogWithOutbox({
      userId,
      date,
      sections: { work: { deepWorkHours: 4 } },
      options: { clientMutationId: idemId },
    });
    assert.equal(first.success, true);
    assert.equal(retry.success, true);
    assert.equal(retry.deduplicated, true);

    const eventsAfter = await OutboxEventModel.find({ userId, type: "domain.daily_log.updated" }).lean();
    assert.equal(eventsAfter.length, 3);
  });

  it("5.1-03: NutritionLog & WeightLog persist through Outbox and durably sync DailyLog calories", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const foodId = new mongoose.Types.ObjectId();
    const date = "2026-11-26";

    const nutRes = await saveNutritionLogWithOutbox({
      userId,
      date,
      meals: [
        {
          mealType: "lunch",
          foodItemId: foodId,
          amount: 200,
          macros: { calories: 650, protein: 45, carbs: 60, fats: 20 },
        },
      ],
      dailyTotals: { calories: 650, protein: 45, carbs: 60, fats: 20 },
    });

    assert.equal(nutRes.success, true);
    assert.equal(nutRes.newVersion, 1);

    const daily = await DailyLog.findOne({ userId, date }).lean();
    assert.equal((daily as any)?.physical?.calories, 650);

    const nutEvents = await OutboxEventModel.find({ userId, type: "domain.nutrition.logged" }).lean();
    const dailyEvents = await OutboxEventModel.find({ userId, type: "domain.daily_log.updated" }).lean();
    assert.equal(nutEvents.length, 1);
    assert.equal(dailyEvents.length, 1);

    // WeightLog upsert + soft delete via Outbox
    const wUpsert = await upsertWeightLogWithOutbox(userId, date, 74.2);
    assert.equal(wUpsert.success, true);
    const wDel = await deleteWeightLogWithOutbox(userId, date);
    assert.equal(wDel.success, true);
    assert.equal(wDel.deleted, true);

    const weightEvents = await OutboxEventModel.find({ userId, type: "domain.weight.logged" })
      .sort({ aggregateVersion: 1 })
      .lean();
    assert.equal(weightEvents.length, 2);
    assert.equal(weightEvents[0].payload.weight, 74.2);
    assert.equal(weightEvents[1].payload.deleted, true);
  });

  it("5.1-04: Kernel handlers handleRecordMentalState and handleLogMeal emit canonical outbox events", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const date = "2026-11-26";

    const mentalRes = await handleRecordMentalState(
      { date, mood: 4, energy: 3, stress: 2, notes: "Focused morning" } as any,
      userId
    );
    assert.equal(mentalRes.success, true);
    assert.equal(mentalRes.data.mental.mood, 4);

    const mealRes = await handleLogMeal(
      {
        date,
        description: "Chicken Rice Bowl",
        items: [{ name: "Chicken Rice Bowl", amount: 300, calories: 520, protein: 40, carbs: 55, fats: 12 }],
      },
      userId
    );
    assert.equal(mealRes.success, true);

    const events = await OutboxEventModel.find({ userId }).lean();
    const types = events.map((e) => e.type);
    assert.ok(types.includes("domain.daily_log.updated"));
    assert.ok(types.includes("domain.nutrition.logged"));
  });
});
