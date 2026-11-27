import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { ConsumerRegistry } from "../events/consumers/ConsumerRegistry";
import { CognitiveHistoryConsumer } from "../events/consumers/CognitiveHistoryConsumer";
import { PhysicalReadinessConsumer } from "../events/consumers/PhysicalReadinessConsumer";
import { BehavioralIntelligenceConsumer } from "../events/consumers/BehavioralIntelligenceConsumer";
import { PublicationEligibilityGate } from "../events/delivery/PublicationEligibilityGate";
import { CognitiveStateHistoryModel } from "../server/db/models/CognitiveStateHistoryModel";
import { ObservationModel } from "../server/db/models/ObservationModel";
import { BehavioralProfile } from "../../../../apps/web/server/db/models/BehavioralProfile";
import { BehavioralObservationModel } from "../../../../apps/web/server/db/models/BehavioralObservationModel";
import { ConsumerProcessingLedgerModel } from "../../../../apps/web/server/db/models/ConsumerProcessingLedgerModel";
import { DailyLog } from "../../../../apps/web/server/db/models/DailyLog";

describe("Stage 5 Increment 5.2: Consumers, CognitiveStateEngine & Telemetry Extraction", () => {
  before(async () => {
    await connectIsolatedTestDB({ dbName: "life-os-stage5-2-test" });
    await Promise.all([
      CognitiveStateHistoryModel.syncIndexes(),
      ObservationModel.syncIndexes(),
      BehavioralProfile.syncIndexes(),
      BehavioralObservationModel.syncIndexes(),
      ConsumerProcessingLedgerModel.syncIndexes(),
      DailyLog.syncIndexes(),
    ]);
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    await Promise.all([
      CognitiveStateHistoryModel.deleteMany({}),
      ObservationModel.deleteMany({}),
      BehavioralProfile.deleteMany({}),
      BehavioralObservationModel.deleteMany({}),
      ConsumerProcessingLedgerModel.deleteMany({}),
      DailyLog.deleteMany({}),
    ]);
  });

  it("5.2-01: domain.daily_log.updated computes cognitive state via CognitiveStateEngine and upserts idempotently by lastEventId", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const consumer = new CognitiveHistoryConsumer();

    const envelope = {
      eventId: "evt_dailylog_cog_1",
      userId,
      category: "DOMAIN_EVENT" as const,
      type: "domain.daily_log.updated",
      aggregateId: "log_cog_1",
      aggregateType: "dailylog" as const,
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_cog_52",
      source: "web.daily_log.today",
      payload: {
        logId: "log_cog_1",
        userId,
        date: "2026-11-26",
        updatedSections: ["sleep", "mental"],
        sleepHours: 5.0,
        mentalEnergy: 2,
        mentalStress: 4,
        updatedAt: new Date().toISOString(),
      },
    };

    const res1 = await consumer.process(envelope, 1);
    assert.equal(res1.status, "SUCCEEDED");

    // Simulate pre-ack crash where ConsumerProcessingLedger didn't record SUCCEEDED and consumer runs again
    const res2 = await consumer.process(envelope, 2);
    assert.equal(res2.status, "SUCCEEDED");

    const docs = await CognitiveStateHistoryModel.find({ userId }).lean();
    assert.equal(docs.length, 1, "Idempotent upsert must prevent duplicate history snapshots");
    assert.equal(docs[0].lastEventId, "evt_dailylog_cog_1");
    assert.equal(docs[0].provenance, "HYBRID");
    // Short sleep + low energy + high stress should differ from naive 0.35/0.75/0.40/0.80 constants
    assert.notEqual(docs[0].energy.estimate, 0.75);
    assert.ok(docs[0].stress.estimate > 0.35);
  });

  it("5.2-02: daily_log, signal, and nutrition events extract Observations and advance BehavioralProfile without double-counting", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const phys = new PhysicalReadinessConsumer();
    const behav = new BehavioralIntelligenceConsumer();

    const dailyEnvelope = {
      eventId: "evt_dailylog_obs_1",
      userId,
      category: "DOMAIN_EVENT" as const,
      type: "domain.daily_log.updated",
      aggregateId: "log_obs_1",
      aggregateType: "dailylog" as const,
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_obs_1",
      source: "web.daily_log.today",
      payload: {
        logId: "log_obs_1",
        userId,
        date: "2026-11-26",
        updatedSections: ["sleep", "mental", "work"],
        sleepHours: 7.5,
        mentalStress: 3,
        mentalEnergy: 7,
        deepWorkHours: 3.5,
        updatedAt: new Date().toISOString(),
      },
    };

    const signalEnvelope = {
      eventId: "evt_signal_obs_1",
      userId,
      category: "DOMAIN_EVENT" as const,
      type: "domain.signal.logged",
      aggregateId: "log_obs_1",
      aggregateType: "dailylog" as const,
      aggregateVersion: 2,
      eventOrdinal: 1,
      causalSequence: 2001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_sig_1",
      source: "web.signals.log",
      payload: { userId, date: "2026-11-26", key: "sleepHours", value: 7.5 },
    };

    const nutEnvelope = {
      eventId: "evt_nut_obs_1",
      userId,
      category: "DOMAIN_EVENT" as const,
      type: "domain.nutrition.logged",
      aggregateId: "nut_1",
      aggregateType: "nutrition_log" as const,
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_nut_1",
      source: "web.nutrition.log",
      payload: {
        logId: "nut_1",
        userId,
        date: "2026-11-26",
        mealsCount: 2,
        dailyTotals: { calories: 1950, protein: 140, carbs: 200, fats: 60 },
        loggedAt: new Date().toISOString(),
      },
    };

    assert.equal((await phys.process(dailyEnvelope, 1)).status, "SUCCEEDED");
    assert.equal((await phys.process(signalEnvelope, 1)).status, "SUCCEEDED");
    assert.equal((await behav.process(dailyEnvelope, 1)).status, "SUCCEEDED");
    assert.equal((await behav.process(nutEnvelope, 1)).status, "SUCCEEDED");
    // Redelivery must be idempotent
    assert.equal((await behav.process(nutEnvelope, 2)).status, "SUCCEEDED");

    const obs = await ObservationModel.find({ userId }).lean();
    assert.ok(obs.length >= 3, "Observations should be persisted from daily_log and signal events");

    const profile = await BehavioralProfile.findOne({ userId }).lean();
    assert.ok(profile, "BehavioralProfile must be created/updated");
    assert.equal((profile as any).projectionRevision, 2);
  });

  it("5.2-03: Sibling failure isolation keeps succeeded consumers intact and gates PublicationEligibilityGate until retry passes", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const registry = new ConsumerRegistry();

    let shouldFailCog = true;
    let physCalls = 0;
    let behavCalls = 0;

    registry.register({
      name: "PhysicalReadinessConsumer",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["domain.daily_log.updated"],
      process: async () => {
        physCalls++;
        return { status: "SUCCEEDED" };
      },
    });
    registry.register({
      name: "BehavioralIntelligenceConsumer",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["domain.daily_log.updated"],
      process: async () => {
        behavCalls++;
        return { status: "SUCCEEDED" };
      },
    });
    registry.register({
      name: "CognitiveHistoryConsumer",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["domain.daily_log.updated"],
      process: async () => {
        if (shouldFailCog) {
          return { status: "FAILED_RETRYABLE", error: "Simulated transient failure" };
        }
        return { status: "SUCCEEDED" };
      },
    });

    const envelope = {
      eventId: "evt_isolation_test_1",
      userId,
      category: "DOMAIN_EVENT" as const,
      type: "domain.daily_log.updated",
      aggregateId: "log_iso_1",
      aggregateType: "dailylog" as const,
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: Date.now(),
      recordedAt: Date.now(),
      correlationId: "corr_iso_1",
      source: "test",
      payload: { logId: "log_iso_1", userId, date: "2026-11-26", updatedAt: new Date().toISOString() },
    };

    // Attempt 1: CognitiveHistoryConsumer fails, siblings still succeed
    const d1 = await registry.dispatch(envelope, 1);
    assert.equal(d1.success, false);
    assert.equal(physCalls, 1);
    assert.equal(behavCalls, 1);

    const gate = new PublicationEligibilityGate();
    const elig1 = await gate.evaluateEligibility({
      eventId: envelope.eventId,
      userId,
      type: "domain.daily_log.updated",
      deliveryStatus: "DELIVERED",
    });
    assert.equal(elig1.eligible, false, "Eligibility gate must block until all requiredConsumers succeed");

    // Attempt 2: Retry skips already-SUCCEEDED siblings and runs only failed CognitiveHistoryConsumer
    shouldFailCog = false;
    const d2 = await registry.dispatch(envelope, 2);
    assert.equal(d2.success, true);
    assert.ok(d2.skippedConsumers.includes("PhysicalReadinessConsumer"));
    assert.ok(d2.skippedConsumers.includes("BehavioralIntelligenceConsumer"));
    assert.equal(physCalls, 1, "Succeeded sibling must not re-run");
    assert.equal(behavCalls, 1, "Succeeded sibling must not re-run");

    const elig2 = await gate.evaluateEligibility({
      eventId: envelope.eventId,
      userId,
      type: "domain.daily_log.updated",
      deliveryStatus: "DELIVERED",
    });
    assert.equal(elig2.eligible, true);
  });
});
