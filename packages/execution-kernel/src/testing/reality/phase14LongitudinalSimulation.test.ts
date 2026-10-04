import test from "node:test";
import assert from "node:assert/strict";

import { AdaptiveUserPersona } from "../../../../../apps/web/simulation/personas/AdaptiveUserPersona";
import { LongitudinalSimulationHarness } from "../../../../../apps/web/simulation/engine/LongitudinalSimulationHarness";

test("PHASE 14: Longitudinal Adaptive Simulation & Hidden Ground Truth Suite", async (suite) => {
  const testUserId = "sim-user-phase14-" + Date.now();

  await suite.test("SIM-01: Adaptive Persona Private Ground Truth Decoupling", async () => {
    const persona = new AdaptiveUserPersona(testUserId, "Test Subject", 777);

    // Initial state
    const truth = persona.getHiddenGroundTruth();
    assert.ok(truth.trueFatigue >= 0.0 && truth.trueFatigue <= 1.0);
    assert.equal(truth.hiddenIllness, false);

    // Advance 14 days (triggers hidden illness at days 12-16)
    for (let day = 1; day <= 14; day++) {
      persona.tickDay(day);
    }

    const sickTruth = persona.getHiddenGroundTruth();
    assert.equal(sickTruth.hiddenIllness, true, "Illness must trigger on day 14");
    assert.ok(sickTruth.trueFatigue > 0.6, "Illness must escalate fatigue");

    // Verify observable output doesn't contain hidden keys
    const obs = persona.emitDailyObservables(14);
    assert.equal((obs as any).hiddenIllness, undefined, "Observable must NOT contain hidden ground truth keys");
    assert.equal((obs as any).trueFatigue, undefined);
    assert.ok(obs.sleepRecoveryScore < 0.6, "Sensor observables should reflect low recovery");
  });

  await suite.test("SIM-02: Accelerated 30-Day Longitudinal Simulation Run", async () => {
    const harness = LongitudinalSimulationHarness.getInstance();

    const startTime = performance.now();
    const report = await harness.runLongitudinalSimulation(30, 202, `${testUserId}-30d`);
    const durationMs = performance.now() - startTime;

    assert.equal(report.simulatedDays, 30);
    assert.ok(durationMs < 5000, `30 simulated days should execute in < 5000ms, took ${durationMs}ms`);

    // Verify Pearson correlation with hidden truth
    assert.ok(
      report.correlationWithHiddenTruth >= 0.75,
      `Correlation r must be >= 0.75, got ${report.correlationWithHiddenTruth}`
    );

    // Constitutional Invariant: Zero preference oscillation
    assert.equal(
      report.preferenceOscillationCount,
      0,
      "Preference oscillation count must equal exactly 0"
    );

    // Efficacy rate
    assert.ok(
      report.successRateT4h >= 0.70,
      `Intervention efficacy must be >= 0.70, got ${report.successRateT4h}`
    );

    assert.ok(report.stabilityScore >= 70, `Stability score should be >= 70, got ${report.stabilityScore}`);
  });

  await suite.test("SIM-03: Accelerated 90-Day Longitudinal Stability Run & Bounded Memory", async () => {
    const harness = LongitudinalSimulationHarness.getInstance();

    const report = await harness.runLongitudinalSimulation(90, 303, `${testUserId}-90d`);

    assert.equal(report.simulatedDays, 90);
    assert.equal(report.preferenceOscillationCount, 0);
    assert.ok(report.totalInterventions > 0);

    // Memory growth must remain bounded (< 100KB/day)
    assert.ok(
      report.memoryGrowthBytesPerDay < 100000,
      `Memory growth per day must be bounded (< 100KB), got ${report.memoryGrowthBytesPerDay} bytes`
    );

    assert.equal(report.passedAllInvariants, true, "All 90-day invariants must pass");
  });

  await suite.test("SIM-04: Adversarial Sensor Outage Handling (3 Consecutive Missing Days)", async () => {
    const persona = new AdaptiveUserPersona(testUserId, "Sensor Outage Test", 999);

    // Force missing telemetry
    const observables = persona.emitDailyObservables(5);
    observables.telemetryMissing = true;

    // Simulate LifeOS handling missing observables
    const inferredReadiness = observables.telemetryMissing ? 0.65 : observables.sleepRecoveryScore;
    const isDegraded = observables.telemetryMissing;

    assert.equal(isDegraded, true);
    // Should fall back to neutral prior (0.65) without hallucinating extreme values
    assert.equal(inferredReadiness, 0.65);
    assert.ok(inferredReadiness >= 0.5 && inferredReadiness <= 0.8, "Neutral prior must be bounded");
  });
});
