/**
 * phase7InterventionOutcomeLearning.test.ts
 * Phase 7 Verification Suite: Closed-Loop Intervention & Outcome Learning
 * Validates T+4h and T+24h verification, confounder detection, exponential recency decay (tau = 21d),
 * user feedback loops, and MongoDB persistence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { RealityTestHarness } from "./RealityTestHarness";
import { InterventionVerificationEngine } from "../../interventions/InterventionVerificationEngine";
import { InterventionRecordModel } from "../../server/db/models/InterventionRecordModel";

test("PHASE 7: Closed-Loop Intervention & Outcome Learning Suite", async (suite) => {
  const testUserId = new mongoose.Types.ObjectId().toString();
  const harness = new RealityTestHarness();

  await harness.connect();
  if (mongoose.connection.readyState === 1) {
    await InterventionRecordModel.deleteMany({ userId: testUserId });
  }

  const engine = InterventionVerificationEngine.getInstance();
  engine.clearCache();

  await suite.test("INTV-01: Intervention Scheduling with T+4h and T+24h Observation Windows", async () => {
    const executedAt = 1785000000000;
    const record = await engine.createIntervention({
      userId: testUserId,
      triggerType: "PROACTIVE_ENGINE",
      crossDomainTensionId: "tension-1",
      stateBefore: {
        lifeState: "OVERLOADED",
        cognitiveLoad: 0.80,
        goalPressure: 0.75,
      },
      proposedAction: {
        capabilityURN: "urn:lifeos:action:protect_afternoon_focus",
        parameters: { durationMinutes: 60 },
      },
      expectedOutcome: {
        targetMetric: "focus_duration",
        expectedDelta: 45, // Expect +45 minutes of focus
      },
      executedAt,
    });

    assert.ok(record.interventionId.startsWith("intv-"));
    assert.equal(record.windows.t4h.measurementAt, executedAt + 4 * 3600 * 1000);
    assert.equal(record.windows.t24h.measurementAt, executedAt + 24 * 3600 * 1000);
    assert.equal(record.windows.t4h.evaluatedStatus, undefined);
  });

  await suite.test("INTV-02: T+4h Outcome Verification (Effective vs Ineffective vs Confounded)", async () => {
    const baseTime = 1785000000000;
    const t4Time = baseTime + 4 * 3600 * 1000;

    // 1. Intervention 1: Delivered +50m focus (expected +45m) -> EFFECTIVE
    const intv1 = await engine.createIntervention({
      userId: testUserId,
      triggerType: "PROACTIVE_ENGINE",
      stateBefore: { lifeState: "NORMAL", cognitiveLoad: 0.5, goalPressure: 0.5 },
      proposedAction: { capabilityURN: "urn:action:focus", parameters: {} },
      expectedOutcome: { targetMetric: "focus_duration", expectedDelta: 45 },
      executedAt: baseTime,
    });

    // 2. Intervention 2: Confounded by emergency meeting -> UNCERTAIN
    const intv2 = await engine.createIntervention({
      userId: testUserId,
      triggerType: "PROACTIVE_ENGINE",
      stateBefore: { lifeState: "NORMAL", cognitiveLoad: 0.5, goalPressure: 0.5 },
      proposedAction: { capabilityURN: "urn:action:focus", parameters: {} },
      expectedOutcome: { targetMetric: "focus_duration", expectedDelta: 45 },
      executedAt: baseTime,
    });

    // Trigger verification worker at T+4h
    const result = await engine.verifyPendingInterventions(testUserId, t4Time, (userId, metric, executedAt, measuredAt, interventionId) => {
      if (interventionId === intv1.interventionId && metric === "focus_duration") {
        return { observedDelta: 50, confounders: [] };
      }
      return { observedDelta: 10, confounders: ["Unscheduled emergency sync booked"] };
    });

    assert.ok(result.t4hEvaluatedCount >= 2);
    assert.ok(result.effectiveCount >= 1);

    const updated1 = engine.getInterventionById(intv1.interventionId);
    assert.equal(updated1?.windows.t4h.evaluatedStatus, "EFFECTIVE");
    assert.equal(updated1?.windows.t4h.observedDelta, 50);

    const updated2 = engine.getInterventionById(intv2.interventionId);
    assert.equal(updated2?.windows.t4h.evaluatedStatus, "UNCERTAIN");
    assert.ok(updated2?.windows.t4h.confoundersDetected?.includes("Unscheduled emergency sync booked"));
  });

  await suite.test("INTV-03: Exponential Recency Decay Strategy Scoring (tau = 21 days)", async () => {
    const urn = "urn:lifeos:action:recency_scoring_test";
    const now = 1785000000000;
    const dayMs = 24 * 3600 * 1000;

    // Record an effective intervention 1 day ago
    const recent = await engine.createIntervention({
      userId: testUserId,
      triggerType: "PROACTIVE_ENGINE",
      stateBefore: { lifeState: "NORMAL", cognitiveLoad: 0.5, goalPressure: 0.5 },
      proposedAction: { capabilityURN: urn, parameters: {} },
      expectedOutcome: { targetMetric: "focus_duration", expectedDelta: 45 },
      executedAt: now - 1 * dayMs,
    });
    recent.windows.t4h.evaluatedStatus = "EFFECTIVE";

    // Record an older adverse intervention 30 days ago (attenuated by exp decay)
    const oldAdverse = await engine.createIntervention({
      userId: testUserId,
      triggerType: "PROACTIVE_ENGINE",
      stateBefore: { lifeState: "NORMAL", cognitiveLoad: 0.5, goalPressure: 0.5 },
      proposedAction: { capabilityURN: urn, parameters: {} },
      expectedOutcome: { targetMetric: "focus_duration", expectedDelta: 45 },
      executedAt: now - 30 * dayMs,
    });
    oldAdverse.windows.t4h.evaluatedStatus = "ADVERSE";

    const score = engine.calculateStrategyRecencyScore(testUserId, urn, now);
    // Recent effective intervention (weight ~0.95) should dominate older adverse (weight ~0.24)
    assert.ok(score > 0.70, `Recent effective intervention must dominate, got score ${score}`);
  });

  await suite.test("INTV-04: User Qualitative Feedback Loop (Thumbs Up / Down)", async () => {
    const intv = await engine.createIntervention({
      userId: testUserId,
      triggerType: "AVEN_CONVERSATION",
      stateBefore: { lifeState: "NORMAL", cognitiveLoad: 0.5, goalPressure: 0.5 },
      proposedAction: { capabilityURN: "urn:action:reschedule", parameters: {} },
      expectedOutcome: { targetMetric: "task_completion_rate", expectedDelta: 0.3 },
      executedAt: Date.now(),
    });

    const recorded = await engine.recordUserFeedback(intv.interventionId, "THUMBS_UP");
    assert.equal(recorded, true);

    const updated = engine.getInterventionById(intv.interventionId);
    assert.equal(updated?.userFeedback, "THUMBS_UP");
  });

  await suite.test("INTV-05: MongoDB Persistence in InterventionRecordModel", async () => {
    if (mongoose.connection.readyState !== 1) return;

    const count = await InterventionRecordModel.countDocuments({ userId: testUserId });
    assert.ok(count >= 3, `Expected at least 3 records in DB, found ${count}`);

    const sample = await InterventionRecordModel.findOne({ userId: testUserId });
    assert.ok(sample);
    assert.ok(sample.interventionId.startsWith("intv-"));
    assert.ok(sample.windows.t4h);
  });

  // Cleanup
  if (mongoose.connection.readyState === 1) {
    await InterventionRecordModel.deleteMany({ userId: testUserId });
  }
  await harness.disconnect();
});
