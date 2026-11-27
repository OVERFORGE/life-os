import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { OutboxEventModel } from "../../../../apps/web/server/db/models/OutboxEventModel";
import { UserDeliveryJournalModel } from "../../../../apps/web/server/db/models/UserDeliveryJournalModel";
import { UserDeliverySequenceModel } from "../../../../apps/web/server/db/models/UserDeliverySequenceModel";
import { ConsumerProcessingLedgerModel } from "../../../../apps/web/server/db/models/ConsumerProcessingLedgerModel";
import { PartitionLeaseModel } from "../../../../apps/web/server/db/models/PartitionLeaseModel";
import { DailyLog } from "../../../../apps/web/server/db/models/DailyLog";
import { NutritionLog } from "../../../../apps/web/server/db/models/NutritionLog";
import { WorkoutSession } from "../../../../apps/web/server/db/models/WorkoutSession";
import { CognitiveStateHistoryModel } from "../server/db/models/CognitiveStateHistoryModel";
import { ObservationModel } from "../server/db/models/ObservationModel";
import { BehavioralProfile } from "../../../../apps/web/server/db/models/BehavioralProfile";
import { upsertDailyLogWithOutbox } from "../../../../apps/web/features/daily-log/services/dailyLogEngine";
import { saveNutritionLogWithOutbox } from "../../../../apps/web/features/nutrition/services/nutritionLogEngine";
import { OutboxWorkerDaemon } from "../events/dispatch/OutboxWorkerService";
import { SSEConnectionManager } from "../../../../apps/web/server/services/SSEConnectionManager";
import { createInvalidationCoalescer } from "../../../../apps/web/features/runtime/hooks/useReactiveInvalidation";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ContextProjectionEngine } from "../orchestration/context/ContextProjectionEngine";

describe("Stage 5 Increment 5.6: End-to-End Closed-Loop Reactivity & Cross-Tenant Isolation", () => {
  before(async () => {
    await connectIsolatedTestDB({ dbName: "life-os-stage5-6-e2e-test" });
    await Promise.all([
      OutboxEventModel.syncIndexes(),
      UserDeliveryJournalModel.syncIndexes(),
      UserDeliverySequenceModel.syncIndexes(),
      ConsumerProcessingLedgerModel.syncIndexes(),
      PartitionLeaseModel.syncIndexes(),
      DailyLog.syncIndexes(),
      NutritionLog.syncIndexes(),
      WorkoutSession.syncIndexes(),
      CognitiveStateHistoryModel.syncIndexes(),
      ObservationModel.syncIndexes(),
      BehavioralProfile.syncIndexes(),
    ]);
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    SSEConnectionManager.getInstance().reset();
    await Promise.all([
      OutboxEventModel.deleteMany({}),
      UserDeliveryJournalModel.deleteMany({}),
      UserDeliverySequenceModel.deleteMany({}),
      ConsumerProcessingLedgerModel.deleteMany({}),
      PartitionLeaseModel.deleteMany({}),
      DailyLog.deleteMany({}),
      NutritionLog.deleteMany({}),
      WorkoutSession.deleteMany({}),
      CognitiveStateHistoryModel.deleteMany({}),
      ObservationModel.deleteMany({}),
      BehavioralProfile.deleteMany({}),
    ]);
  });

  it("5.6-01: Full closed-loop chain from DailyLog+Nutrition+Workout mutation -> OutboxWorkerDaemon -> Consumers -> Journal -> SSE/Invalidation -> Grounded Projections with strict User A / User B isolation", async () => {
    const userA = new mongoose.Types.ObjectId().toString();
    const userB = new mongoose.Types.ObjectId().toString();
    const today = "2026-11-26";

    // 1. User A commits DailyLog + NutritionLog via Outbox engines + WorkoutSession
    await upsertDailyLogWithOutbox({
      userId: userA,
      date: today,
      sections: {
        sleep: { hours: 7.5, quality: 8 },
        mental: { mood: 8, energy: 8, stress: 3 },
        signals: { hydrationMl: 2000 },
      },
      options: {
        clientMutationId: "e2e_daily_a",
        source: "e2e_test",
      },
    });

    await saveNutritionLogWithOutbox({
      userId: userA,
      date: today,
      meals: [],
      dailyTotals: { calories: 2250, protein: 150, carbs: 220, fats: 75 },
      options: {
        clientMutationId: "e2e_nutri_a",
        source: "e2e_test",
      },
    });

    await WorkoutSession.create({
      userId: userA,
      dateOnly: today,
      workoutType: "pull_day",
      intensity: "high",
      durationSeconds: 60 * 60,
      startedAt: new Date(),
    });

    // 2. Run OutboxWorkerDaemon single cycle -> processes consumers + sequences UserDeliveryJournal
    const daemon = new OutboxWorkerDaemon({ batchSize: 20 });
    const cycleReport = await daemon.runOnce();
    assert.ok(cycleReport.succeededCount >= 2, "Daemon must dispatch both outbox events");

    // 3. Verify consumers populated CognitiveStateHistory, Observations & BehavioralProfile for User A only
    const cogA = await CognitiveStateHistoryModel.find({ userId: userA }).lean();
    assert.ok(cogA.length >= 1, "CognitiveStateHistory must be populated for User A");
    const obsA = await ObservationModel.find({ userId: userA }).lean();
    assert.ok(obsA.length >= 1, "Observations must be extracted for User A");
    const profA = await BehavioralProfile.findOne({ userId: userA }).lean();
    assert.ok(profA, "BehavioralProfile must be updated for User A");

    const cogB = await CognitiveStateHistoryModel.find({ userId: userB }).lean();
    assert.equal(cogB.length, 0, "User B must have zero leaked cognitive history");

    // 4. Verify UserDeliveryJournal & OutboxEvent.deliverySeq
    const journalsA = await UserDeliveryJournalModel.find({ userId: userA }).sort({ deliverySeq: 1 }).lean();
    assert.ok(journalsA.length >= 2);
    assert.deepEqual(
      journalsA.map((j) => j.deliverySeq),
      journalsA.map((_, idx) => idx + 1)
    );
    const outboxA = await OutboxEventModel.find({ userId: userA }).lean();
    assert.ok(outboxA.every((e) => typeof e.deliverySeq === "number" && e.deliverySeq >= 1));

    // 5. Simulate UI invalidation listener receiving User A's journal tags vs User B's scope
    let refreshedA = 0;
    let refreshedB = 0;
    const coalescerA = createInvalidationCoalescer({
      tags: ["nutrition", "daily-log", "dashboard"],
      userId: userA,
      debounceMs: 20,
      onInvalidate: () => {
        refreshedA++;
      },
    });
    const coalescerB = createInvalidationCoalescer({
      tags: ["nutrition", "daily-log", "dashboard"],
      userId: userB,
      debounceMs: 20,
      onInvalidate: () => {
        refreshedB++;
      },
    });

    for (const j of journalsA) {
      coalescerA.handleInvalidateEvent({ tags: j.invalidationTags, deliverySeq: j.deliverySeq, userId: userA });
      coalescerB.handleInvalidateEvent({ tags: j.invalidationTags, deliverySeq: j.deliverySeq, userId: userA });
    }
    await new Promise((r) => setTimeout(r, 60));
    coalescerA.dispose();
    coalescerB.dispose();

    assert.equal(refreshedA, 1, "User A UI must refresh once via coalescer");
    assert.equal(refreshedB, 0, "User B UI must never refresh on User A invalidation");

    // 6. Verify KernelCapabilityService + ContextProjectionEngine produce grounded projections for User A and unknown for User B
    const kernel = new KernelCapabilityService();
    const engine = new ContextProjectionEngine();

    const stateA = await kernel.readAuthoritativeState(userA);
    const healthA = engine.projectHealth(stateA);
    const wellA = engine.projectWellness(stateA);
    assert.equal(healthA.dataStatus, "grounded");
    assert.equal(healthA.nutritionSummary.caloriesEstimate, 2250);
    assert.equal(healthA.biometricSummary.sleepDurationHours, 7.5);
    assert.equal(healthA.recentWorkouts.length, 1);
    assert.equal(wellA.dataStatus, "grounded");
    assert.equal(wellA.sleepSummary.perceivedQuality, "excellent");

    const stateB = await kernel.readAuthoritativeState(userB);
    const healthB = engine.projectHealth(stateB);
    const wellB = engine.projectWellness(stateB);
    assert.equal(healthB.dataStatus, "unknown");
    assert.equal(healthB.nutritionSummary.caloriesEstimate, null);
    assert.equal(wellB.dataStatus, "unknown");
    assert.equal(wellB.stressBand, "unknown");
  });
});
