/**
 * phase2ContinuousTelemetry.test.ts
 * Phase 2 Verification Suite: Continuous Telemetry & Observation Engine
 * Validates extractors, deterministic IDs, bulkWrite deduplication, out-of-order handling,
 * throughput latency budgets, and WorldModelBridge integration.
 */

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { RealityTestHarness } from "./RealityTestHarness";
import { ObservationPipeline } from "../../telemetry/pipeline/ObservationPipeline";
import { CalendarObservationExtractor } from "../../telemetry/pipeline/CalendarObservationExtractor";
import { WearableObservationExtractor } from "../../telemetry/pipeline/WearableObservationExtractor";
import { TaskObservationExtractor } from "../../telemetry/pipeline/TaskObservationExtractor";
import { ObservationModel } from "../../server/db/models/ObservationModel";
import { TelemetryIngestionService } from "../../telemetry/TelemetryIngestionService";
import { WorldModelBridge } from "../../worldv2/WorldModelBridge";
import { RawCalendarEvent, RawWearableData } from "../../telemetry/contracts/ObservationEventContracts";

test("PHASE 2: Continuous Telemetry & Observation Engine Suite", async (suite) => {
  const testUserId = new mongoose.Types.ObjectId().toString();
  const harness = new RealityTestHarness();

  // Setup database connection and clean cache
  await harness.connect();
  if (mongoose.connection.readyState === 1) {
    await ObservationModel.deleteMany({ userId: testUserId });
  }
  ObservationPipeline.getInstance().clearMemoryCache();

  await suite.test("OBS-01: CalendarObservationExtractor extracts ScheduleDensity, Fragmentation, and DeepWork", () => {
    const dayStartMs = new Date("2026-10-04T00:00:00Z").getTime();
    const events: RawCalendarEvent[] = [
      {
        id: "evt-1",
        title: "Sprint Standup",
        startTime: dayStartMs + 9 * 3600 * 1000,
        endTime: dayStartMs + 9.5 * 3600 * 1000,
        status: "confirmed",
      },
      {
        id: "evt-2",
        title: "Architecture Sync",
        startTime: dayStartMs + 10 * 3600 * 1000,
        endTime: dayStartMs + 11.5 * 3600 * 1000,
        status: "confirmed",
      },
      {
        id: "evt-3",
        title: "1-on-1",
        startTime: dayStartMs + 11.75 * 3600 * 1000,
        endTime: dayStartMs + 12.5 * 3600 * 1000,
        status: "confirmed",
      },
    ];

    const observations = CalendarObservationExtractor.extractObservations({
      userId: testUserId,
      dayStartMs,
      events,
      generationTimestamp: dayStartMs + 18 * 3600 * 1000,
    });

    assert.equal(observations.length, 3, "Must produce 3 calendar observations");

    const densityObs = observations.find((o) => o.type === "ScheduleDensity");
    const fragObs = observations.find((o) => o.type === "CalendarFragmentation");
    const deepWorkObs = observations.find((o) => o.type === "DeepWorkWindow");

    assert.ok(densityObs, "ScheduleDensity observation must exist");
    assert.ok(fragObs, "CalendarFragmentation observation must exist");
    assert.ok(deepWorkObs, "DeepWorkWindow observation must exist");

    // Total meeting duration: 2.75 hours
    assert.ok(Math.abs(densityObs.rawValue - 2.75) < 0.1, `Meeting hours should be ~2.75, got ${densityObs.rawValue}`);
    assert.ok(densityObs.normalizedValue > 0.3 && densityObs.normalizedValue < 0.4);

    // Gaps: 2 fragmented short gaps
    assert.equal(fragObs.rawValue, 2);
    assert.equal(fragObs.normalizedValue, 0.4);

    // Deep work: remaining afternoon >= 4 hours
    assert.ok(deepWorkObs.rawValue >= 4.0);
    assert.equal(deepWorkObs.normalizedValue, 1.0);
  });

  await suite.test("OBS-02: WearableObservationExtractor extracts SleepDurationHours, Deficit, Recovery, and Workout", () => {
    const now = Date.now();
    const wearableData: RawWearableData = {
      source: "apple_health",
      timestamp: now,
      sleepHours: 6.0,
      sleepQualityScore: 78,
      restingHeartRate: 62,
      activeMinutes: 45,
      steps: 8500,
    };

    const observations = WearableObservationExtractor.extractObservations({
      userId: testUserId,
      data: wearableData,
      generationTimestamp: now,
    });

    assert.ok(observations.length >= 4, "Must extract at least 4 wearable observations");

    const sleepObs = observations.find((o) => o.type === "SleepDurationHours");
    const deficitObs = observations.find((o) => o.type === "SleepDeprivation");
    const recoveryObs = observations.find((o) => o.type === "SleepRecoveryScore");
    const workoutObs = observations.find((o) => o.type === "WorkoutCompleted");

    assert.ok(sleepObs && deficitObs && recoveryObs && workoutObs);
    assert.equal(sleepObs.rawValue, 6.0);
    assert.equal(sleepObs.normalizedValue, 0.75); // 6 / 8

    assert.equal(deficitObs.rawValue, 2.0); // 8 - 6
    assert.equal(deficitObs.normalizedValue, 0.25); // 2 / 8

    assert.equal(recoveryObs.rawValue, 78);
    assert.equal(recoveryObs.normalizedValue, 0.78);

    assert.equal(workoutObs.rawValue, 45);
    assert.equal(workoutObs.normalizedValue, 0.75);
  });

  await suite.test("OBS-03: TaskObservationExtractor extracts TaskExecutionVelocity", () => {
    const now = Date.now();
    const activities = [
      { taskId: "task-1", title: "Write tests", completedAt: now - 3600000 },
      { taskId: "task-2", title: "Refactor engine", completedAt: now - 1800000 },
      { taskId: "task-3", title: "Audit security", completedAt: now },
    ];

    const observations = TaskObservationExtractor.extractObservations({
      userId: testUserId,
      activities,
      windowDays: 1,
      generationTimestamp: now,
    });

    assert.equal(observations.length, 1);
    const velocityObs = observations[0];
    assert.equal(velocityObs.type, "TaskExecutionVelocity");
    assert.equal(velocityObs.rawValue, 3);
    assert.equal(velocityObs.normalizedValue, 0.6);
  });

  await suite.test("OBS-04: ObservationPipeline enforces deduplication under duplicate submissions", async () => {
    const pipeline = ObservationPipeline.getInstance();
    const baseTime = 1785000000000;

    const sampleObs = CalendarObservationExtractor.extractObservations({
      userId: testUserId,
      dayStartMs: baseTime,
      events: [
        {
          id: "evt-dup-1",
          title: "Executive Review",
          startTime: baseTime + 9 * 3600 * 1000,
          endTime: baseTime + 10 * 3600 * 1000,
          status: "confirmed",
        },
      ],
    })[0];

    // Ingest the same observation 100 times concurrently
    const duplicates = Array.from({ length: 100 }, () => sampleObs);
    const result = await pipeline.ingestObservations(duplicates);

    assert.equal(result.totalSubmitted, 100);
    assert.equal(result.insertedCount, 1, "Only 1 document should be inserted");
    assert.equal(result.duplicateCount, 99, "99 duplicates must be detected");
    assert.equal(result.failedCount, 0);

    if (mongoose.connection.readyState === 1) {
      const count = await ObservationModel.countDocuments({ id: sampleObs.id });
      assert.equal(count, 1, "Database must hold exactly 1 copy of the observation");
    }

    // Subsequent ingestion of identical observation
    const secondResult = await pipeline.ingestObservations([sampleObs]);
    assert.equal(secondResult.insertedCount, 0);
    assert.equal(secondResult.duplicateCount, 1);
  });

  await suite.test("OBS-05: Out-of-order timestamps sorted into chronological order", async () => {
    const pipeline = ObservationPipeline.getInstance();
    const t1 = 1785010000000;
    const t2 = 1785020000000;
    const t3 = 1785030000000;

    const obs1 = WearableObservationExtractor.extractObservations({
      userId: testUserId,
      data: { source: "garmin", timestamp: t1, sleepHours: 7.5 },
    })[0];

    const obs2 = WearableObservationExtractor.extractObservations({
      userId: testUserId,
      data: { source: "garmin", timestamp: t2, sleepHours: 6.5 },
    })[0];

    const obs3 = WearableObservationExtractor.extractObservations({
      userId: testUserId,
      data: { source: "garmin", timestamp: t3, sleepHours: 8.0 },
    })[0];

    // Ingest out of order: T3, T1, T2
    await pipeline.ingestObservations([obs3, obs1, obs2]);

    const windowResults = await pipeline.getObservationsForWindow(testUserId, t1 - 1000, t3 + 1000);
    assert.ok(windowResults.length >= 3);

    for (let i = 0; i < windowResults.length - 1; i++) {
      assert.ok(
        windowResults[i].timestamp >= windowResults[i + 1].timestamp,
        `Results must be descending: ${windowResults[i].timestamp} >= ${windowResults[i + 1].timestamp}`
      );
    }
  });

  await suite.test("OBS-06: Batch throughput latency budget verified", async () => {
    const pipeline = ObservationPipeline.getInstance();
    const count = 50;
    const batch: any[] = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
      batch.push({
        id: `obs-perf-${testUserId}-${now + i}`,
        type: "ScheduleDensity",
        userId: testUserId,
        timestamp: now + i,
        generatedAt: now,
        normalizedValue: 0.5,
        rawValue: 4,
        unit: "hours",
        confidence: 1.0,
        metadata: {},
        ownership: {
          sourceCollection: "test",
          sourceEntityId: `test-${i}`,
          originatingSubsystem: "PerfTest",
          createdAt: now + i,
        },
      });
    }

    const result = await pipeline.ingestObservations(batch);
    console.log(`[Phase 2] Batch ingestion duration: ${result.durationMs}ms for ${count} items`);
    assert.ok(result.durationMs < 500, `Batch latency must be under budget, got ${result.durationMs}ms`);
    assert.equal(result.failedCount, 0);
  });

  await suite.test("OBS-07: TelemetryIngestionService and WorldModelBridge integration", async () => {
    const pipeline = ObservationPipeline.getInstance();
    const now = Date.now();

    const wearableObs = WearableObservationExtractor.extractObservations({
      userId: testUserId,
      data: {
        source: "whoop",
        timestamp: now - 3600000,
        sleepHours: 5.0,
        sleepQualityScore: 55,
      },
      generationTimestamp: now,
    });

    await pipeline.ingestObservations(wearableObs);

    const payload = await TelemetryIngestionService.getInstance().ingestTelemetry(testUserId, now);
    assert.ok(payload.observations.length > 0, "Payload must contain observations");

    const hasPassiveSleep = payload.observations.some(
      (o) => o.type === "SleepDurationHours" || o.type === "SleepDeprivation"
    );
    assert.ok(hasPassiveSleep, "Payload must include passively ingested sleep observation");

    const projection = await WorldModelBridge.getInstance().getProjection(testUserId, {
      observations: payload.observations,
    });

    assert.ok(projection, "WorldModel projection must be generated");
    assert.equal(projection.userId, testUserId);
    assert.ok(projection.cognitiveState, "Cognitive state must be present");
  });

  // Cleanup after all subtests
  if (mongoose.connection.readyState === 1) {
    await ObservationModel.deleteMany({ userId: testUserId });
  }
  await harness.disconnect();
});
