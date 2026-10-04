/**
 * phase3CognitiveState.test.ts
 * Phase 3 Verification Suite: Passive Cognitive & Mental State Estimation
 * Validates range, monotonicity, outlier rejection, epistemic confidence calibration,
 * micro-checkin trigger budgets, latency benchmarks, and MongoDB persistence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { RealityTestHarness } from "./RealityTestHarness";
import { CognitiveStateEngine } from "../../worldv2/CognitiveStateEngine";
import { MicroCheckinTrigger } from "../../worldv2/proactive/MicroCheckinTrigger";
import { CognitiveStateHistoryModel } from "../../server/db/models/CognitiveStateHistoryModel";
import { CalendarObservationExtractor } from "../../telemetry/pipeline/CalendarObservationExtractor";
import { WearableObservationExtractor } from "../../telemetry/pipeline/WearableObservationExtractor";
import { TaskObservationExtractor } from "../../telemetry/pipeline/TaskObservationExtractor";
import { Observation } from "../../telemetry/Observation";

test("PHASE 3: Passive Cognitive & Mental State Estimation Suite", async (suite) => {
  const testUserId = new mongoose.Types.ObjectId().toString();
  const harness = new RealityTestHarness();

  await harness.connect();
  if (mongoose.connection.readyState === 1) {
    await CognitiveStateHistoryModel.deleteMany({ userId: testUserId });
  }

  const engine = CognitiveStateEngine.getInstance();
  const checkinTrigger = MicroCheckinTrigger.getInstance();
  checkinTrigger.resetHistory();

  await suite.test("COG-01: Bounded Range & Monotonicity of Cognitive Dimensions", () => {
    const now = Date.now();

    // Baseline light day
    const lightDayStartMs = now - 12 * 3600 * 1000;
    const lightObservations: Observation[] = [
      ...CalendarObservationExtractor.extractObservations({
        userId: testUserId,
        dayStartMs: lightDayStartMs,
        events: [
          {
            id: "e1",
            title: "Quick Sync",
            startTime: lightDayStartMs + 9 * 3600 * 1000,
            endTime: lightDayStartMs + 9.5 * 3600 * 1000, // 30 min
            status: "confirmed",
          },
        ],
      }),
      ...WearableObservationExtractor.extractObservations({
        userId: testUserId,
        data: { source: "whoop", timestamp: now - 4 * 3600 * 1000, sleepHours: 8.0, sleepQualityScore: 90 },
      }),
    ];

    const lightEstimate = engine.evaluate({ userId: testUserId, observations: lightObservations, currentTime: now });

    // Validate bounds
    assert.ok(lightEstimate.cognitiveLoad.estimate >= 0 && lightEstimate.cognitiveLoad.estimate <= 1.0);
    assert.ok(lightEstimate.stress.estimate >= 0 && lightEstimate.stress.estimate <= 1.0);
    assert.ok(lightEstimate.energy.estimate >= 0 && lightEstimate.energy.estimate <= 1.0);
    assert.ok(lightEstimate.focusReadiness.estimate >= 0 && lightEstimate.focusReadiness.estimate <= 1.0);

    // Heavy day with 5 back-to-back fragmented meetings (6 hours total meetings)
    const heavyDayStartMs = now - 12 * 3600 * 1000;
    const heavyObservations: Observation[] = [
      ...CalendarObservationExtractor.extractObservations({
        userId: testUserId,
        dayStartMs: heavyDayStartMs,
        events: [
          { id: "e1", title: "M1", startTime: heavyDayStartMs + 9 * 3600 * 1000, endTime: heavyDayStartMs + 10.5 * 3600 * 1000, status: "confirmed" },
          { id: "e2", title: "M2", startTime: heavyDayStartMs + 10.75 * 3600 * 1000, endTime: heavyDayStartMs + 12 * 3600 * 1000, status: "confirmed" },
          { id: "e3", title: "M3", startTime: heavyDayStartMs + 12.5 * 3600 * 1000, endTime: heavyDayStartMs + 14 * 3600 * 1000, status: "confirmed" },
          { id: "e4", title: "M4", startTime: heavyDayStartMs + 14.25 * 3600 * 1000, endTime: heavyDayStartMs + 15.5 * 3600 * 1000, status: "confirmed" },
          { id: "e5", title: "M5", startTime: heavyDayStartMs + 15.75 * 3600 * 1000, endTime: heavyDayStartMs + 17 * 3600 * 1000, status: "confirmed" },
        ],
      }),
      ...WearableObservationExtractor.extractObservations({
        userId: testUserId,
        data: { source: "whoop", timestamp: now - 4 * 3600 * 1000, sleepHours: 5.0, sleepQualityScore: 50 },
      }),
    ];

    const heavyEstimate = engine.evaluate({ userId: testUserId, observations: heavyObservations, currentTime: now });

    // Monotonicity check: Cognitive load and stress must be higher on heavy day than light day
    assert.ok(
      heavyEstimate.cognitiveLoad.estimate >= lightEstimate.cognitiveLoad.estimate,
      `Cognitive load must increase: ${heavyEstimate.cognitiveLoad.estimate} >= ${lightEstimate.cognitiveLoad.estimate}`
    );
    assert.ok(
      heavyEstimate.stress.estimate >= lightEstimate.stress.estimate,
      `Stress must increase: ${heavyEstimate.stress.estimate} >= ${lightEstimate.stress.estimate}`
    );
    assert.ok(
      heavyEstimate.energy.estimate <= lightEstimate.energy.estimate,
      `Energy must decrease: ${heavyEstimate.energy.estimate} <= ${lightEstimate.energy.estimate}`
    );
  });

  await suite.test("COG-02: Sensor Outlier Rejection (watch left on charger)", () => {
    const now = Date.now();
    // 22 hours sleep reported by faulty sensor
    const outlierObs: Observation[] = WearableObservationExtractor.extractObservations({
      userId: testUserId,
      data: { source: "apple_health", timestamp: now - 3600000, sleepHours: 22.0 },
    });

    const estimate = engine.evaluate({ userId: testUserId, observations: outlierObs, currentTime: now });

    // Outlier must be rejected; energy should not be set to 1.0 based on 22 hours sleep
    assert.ok(estimate.energy.estimate <= 0.85, "Outlier 22h sleep must not artificially maximize energy");
  });

  await suite.test("COG-03: Epistemic Confidence Calibration and Micro-Checkin Requirements", () => {
    const now = Date.now();

    // 0 observations: confidence should be 0.10, micro-checkin required
    const zeroEstimate = engine.evaluate({ userId: testUserId, observations: [], currentTime: now });
    assert.equal(zeroEstimate.focusReadiness.confidence, 0.10);
    assert.equal(zeroEstimate.requiresMicroCheckin, true);
    assert.ok(zeroEstimate.checkinPrompt !== undefined);

    // 3 complete observational domains (sleep, calendar, tasks)
    const richObservations: Observation[] = [
      ...WearableObservationExtractor.extractObservations({
        userId: testUserId,
        data: { source: "whoop", timestamp: now - 18000000, sleepHours: 7.5, sleepQualityScore: 82 },
      }),
      ...CalendarObservationExtractor.extractObservations({
        userId: testUserId,
        dayStartMs: now - 3600000,
        events: [{ id: "m1", title: "Review", startTime: now - 2000000, endTime: now - 1000000 }],
      }),
      ...TaskObservationExtractor.extractObservations({
        userId: testUserId,
        activities: [{ taskId: "t1", title: "Task 1", completedAt: now - 500000 }],
      }),
    ];

    const richEstimate = engine.evaluate({ userId: testUserId, observations: richObservations, currentTime: now });
    assert.ok(
      richEstimate.focusReadiness.confidence >= 0.85,
      `Confidence with 3 domains must be >= 0.85, got ${richEstimate.focusReadiness.confidence}`
    );
    assert.equal(richEstimate.requiresMicroCheckin, false);
  });

  await suite.test("COG-04: MicroCheckinTrigger 24-Hour Rate Limiting Budget", () => {
    const now = Date.now();
    const zeroEstimate = engine.evaluate({ userId: testUserId, observations: [], currentTime: now });

    // 1st call: Should trigger
    const eval1 = checkinTrigger.evaluate(zeroEstimate);
    assert.equal(eval1.shouldTrigger, true);
    assert.ok(eval1.options && eval1.options.length >= 2);

    // 2nd call 1 hour later: Must be blocked by 24-hour rate limit budget
    const laterEstimate = engine.evaluate({ userId: testUserId, observations: [], currentTime: now + 3600000 });
    const eval2 = checkinTrigger.evaluate(laterEstimate);
    assert.equal(eval2.shouldTrigger, false, "Second checkin within 24h must be rejected by rate limit");
    assert.ok(eval2.reason?.includes("Rate limit"));
  });

  await suite.test("COG-05: User Micro-Checkin Feedback Loop & Hybrid Provenance", () => {
    const now = Date.now();
    const initialEstimate = engine.evaluate({
      userId: testUserId,
      observations: [],
      currentTime: now,
    });
    assert.equal(initialEstimate.provenance, "PASSIVE_INFERENCE");

    // User submits micro-checkin: perceived energy is low (0.20), stress is high (0.85)
    const hybridEstimate = engine.evaluate({
      userId: testUserId,
      observations: [],
      currentTime: now + 60000,
      recentMicroCheckin: {
        userId: testUserId,
        timestamp: now + 60000,
        perceivedEnergy: 0.20,
        perceivedStress: 0.85,
      },
    });

    assert.equal(hybridEstimate.provenance, "HYBRID");
    // Energy should be calibrated downward toward 0.20
    assert.ok(hybridEstimate.energy.estimate <= 0.35);
    // Stress should be calibrated upward toward 0.85
    assert.ok(hybridEstimate.stress.estimate >= 0.65);
    // Confidence is boosted by user ground-truth input
    assert.ok(hybridEstimate.energy.confidence > initialEstimate.energy.confidence);
  });

  await suite.test("COG-06: Latency Benchmark (< 10ms budget) & Deterministic Replay", () => {
    const now = Date.now();
    const obs: Observation[] = WearableObservationExtractor.extractObservations({
      userId: testUserId,
      data: { source: "garmin", timestamp: now - 3600000, sleepHours: 7.0 },
    });

    // Run 500 evaluations to benchmark latency
    const start = performance.now();
    const iterations = 500;
    let lastResult: any = null;

    for (let i = 0; i < iterations; i++) {
      lastResult = engine.evaluate({ userId: testUserId, observations: obs, currentTime: now });
    }
    const elapsedMs = performance.now() - start;
    const avgMs = elapsedMs / iterations;

    console.log(`[Phase 3] CognitiveStateEngine latency: ${avgMs.toFixed(3)}ms per evaluation (budget: < 10ms)`);
    assert.ok(avgMs < 10.0, `Evaluation must be under 10ms budget, took ${avgMs}ms`);

    // Deterministic replay: rerun and assert identical numbers
    const rerunResult = engine.evaluate({ userId: testUserId, observations: obs, currentTime: now });
    assert.equal(rerunResult.stress.estimate, lastResult.stress.estimate);
    assert.equal(rerunResult.energy.estimate, lastResult.energy.estimate);
    assert.equal(rerunResult.cognitiveLoad.estimate, lastResult.cognitiveLoad.estimate);
    assert.equal(rerunResult.focusReadiness.estimate, lastResult.focusReadiness.estimate);
  });

  await suite.test("COG-07: Constitutional Compliance & Medical Non-Claim Invariant", () => {
    const estimate = engine.evaluate({ userId: testUserId, observations: [] });
    assert.equal(
      estimate.disclaimer,
      "Operational readiness estimate only; not a medical assessment.",
      "Must include exact non-medical disclaimer"
    );
  });

  await suite.test("COG-08: MongoDB Persistence in CognitiveStateHistoryModel", async () => {
    if (mongoose.connection.readyState !== 1) return;

    const now = Date.now();
    const estimate = engine.evaluate({ userId: testUserId, observations: [], currentTime: now });

    const doc = await CognitiveStateHistoryModel.create({
      userId: estimate.userId,
      timestamp: estimate.timestamp,
      stress: {
        estimate: estimate.stress.estimate,
        confidence: estimate.stress.confidence,
        primaryFactors: estimate.stress.primaryFactors,
      },
      energy: {
        estimate: estimate.energy.estimate,
        confidence: estimate.energy.confidence,
        primaryFactors: estimate.energy.primaryFactors,
      },
      cognitiveLoad: {
        estimate: estimate.cognitiveLoad.estimate,
        confidence: estimate.cognitiveLoad.confidence,
        primaryFactors: estimate.cognitiveLoad.primaryFactors,
      },
      focusReadiness: {
        estimate: estimate.focusReadiness.estimate,
        confidence: estimate.focusReadiness.confidence,
        primaryFactors: estimate.focusReadiness.primaryFactors,
      },
      provenance: estimate.provenance,
      temporalValidity: estimate.temporalValidity,
      disclaimer: estimate.disclaimer,
    });

    assert.ok(doc._id, "Document must be stored with _id");

    const retrieved = await CognitiveStateHistoryModel.findOne({ userId: testUserId }).sort({ timestamp: -1 });
    assert.ok(retrieved);
    assert.equal(retrieved.userId, testUserId);
    assert.equal(retrieved.stress.estimate, estimate.stress.estimate);
  });

  // Cleanup after all subtests
  if (mongoose.connection.readyState === 1) {
    await CognitiveStateHistoryModel.deleteMany({ userId: testUserId });
  }
  await harness.disconnect();
});
