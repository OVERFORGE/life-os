/**
 * phase6CrossDomainIntelligence.test.ts
 * Phase 6 Verification Suite: Cross-Domain Intelligence & Causal State Reasoning
 * Validates multi-factor correlation, epistemic link distinction, adversarial independence,
 * latency benchmarks (< 15ms), and deterministic replay.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { CrossDomainIntelligenceEngine } from "../../reasoning/CrossDomainIntelligenceEngine";
import { Observation } from "../../telemetry/Observation";
import { CalendarObservationExtractor } from "../../telemetry/pipeline/CalendarObservationExtractor";
import { WearableObservationExtractor } from "../../telemetry/pipeline/WearableObservationExtractor";

test("PHASE 6: Cross-Domain Intelligence & Causal State Reasoning Suite", async (suite) => {
  const engine = CrossDomainIntelligenceEngine.getInstance();
  const testUserId = "user_cross_domain_test";
  const now = 1785000000000;

  await suite.test("CROSS-01: Multi-Factor Synthesis: Schedule Density + Sleep Deficit", () => {
    const insights = engine.evaluate({
      userId: testUserId,
      currentTime: now,
      scheduleDensity: 0.75, // 6h meetings in 8h day
      sleepHours: 4.5,       // Severe sleep deficit (3.5h)
      cognitiveLoadEstimate: 0.70,
      energyEstimate: 0.30,
    });

    assert.ok(insights.length > 0, "Must generate cross-domain insights");
    const overloadInsight = insights.find((i) => i.title.includes("Cognitive Load"));
    assert.ok(overloadInsight, "Must generate Cognitive Load & Energy Depletion insight");

    assert.ok(overloadInsight.tensionScore >= 0.60, `Tension score must be >= 0.60, got ${overloadInsight.tensionScore}`);
    assert.equal(overloadInsight.recommendedActionURN, "urn:lifeos:action:protect_afternoon_focus");

    // Verify epistemic links on contributing factors
    const factors = overloadInsight.contributingFactors;
    assert.ok(factors.some((f) => f.domain === "calendar" && f.epistemicStatus === "ASSOCIATION"));
    assert.ok(factors.some((f) => f.domain === "health" && f.epistemicStatus === "EVIDENCE_SUPPORTED_HYPOTHESIS"));
  });

  await suite.test("CROSS-02: Goal Execution Bottleneck Synthesis", () => {
    const insights = engine.evaluate({
      userId: testUserId,
      currentTime: now,
      calendarFragmentation: 0.60,
      deepWorkHours: 1.0,
      goalPressureScore: 0.85,
    });

    const bottleneck = insights.find((i) => i.title.includes("Goal Execution Bottleneck"));
    assert.ok(bottleneck, "Must identify goal bottleneck when calendar is fragmented and pressure is high");
    assert.ok(bottleneck.tensionScore >= 0.60);
    assert.equal(bottleneck.recommendedActionURN, "urn:lifeos:action:consolidate_calendar_blocks");
  });

  await suite.test("CROSS-03: Adversarial False-Correlation Rejection (Physical Strain != Cognitive Burnout)", () => {
    // User has high physical training strain (heavy leg day), but well-rested (8.5h sleep) and light calendar (0 meetings)
    const insights = engine.evaluate({
      userId: testUserId,
      currentTime: now,
      scheduleDensity: 0.10,
      sleepHours: 8.5,
      trainingStrainScore: 0.85,
      cognitiveLoadEstimate: 0.20,
      goalPressureScore: 0.20,
    });

    // Engine must NOT claim cognitive overload or burnout
    const falseOverload = insights.find((i) => i.title.includes("Cognitive Load & Energy Depletion"));
    assert.equal(falseOverload, undefined, "High physical strain must NOT falsely trigger cognitive burnout");

    // Engine must NOT claim goal execution bottleneck
    const falseBottleneck = insights.find((i) => i.title.includes("Goal Execution Bottleneck"));
    assert.equal(falseBottleneck, undefined, "Light calendar must NOT trigger goal bottleneck");
  });

  await suite.test("CROSS-04: Synthesizing Directly from Phase 2 Observations", () => {
    // Generate real passive observations with 6 hours of meetings
    const dayStart = now - 12 * 3600 * 1000;
    const observations: Observation[] = [
      ...CalendarObservationExtractor.extractObservations({
        userId: testUserId,
        dayStartMs: dayStart,
        events: [
          { id: "e1", title: "M1", startTime: dayStart + 9 * 3600 * 1000, endTime: dayStart + 15 * 3600 * 1000, status: "confirmed" },
        ],
      }),
      ...WearableObservationExtractor.extractObservations({
        userId: testUserId,
        data: { source: "apple_health", timestamp: now - 4 * 3600 * 1000, sleepHours: 4.0 },
      }),
    ];

    const insights = engine.evaluate({ userId: testUserId, currentTime: now }, observations);
    assert.ok(insights.length > 0, "Must synthesize insights from Phase 2 observations");
    assert.ok(insights.some((i) => i.title.includes("Cognitive Load")));
  });

  await suite.test("CROSS-05: Evaluation Latency Budget (< 15ms) & Replay Determinism", () => {
    const input = {
      userId: testUserId,
      currentTime: now,
      scheduleDensity: 0.65,
      sleepHours: 5.5,
      goalPressureScore: 0.70,
      trainingStrainScore: 0.40,
    };

    const start = performance.now();
    const iterations = 500;
    let lastResult: any = null;

    for (let i = 0; i < iterations; i++) {
      lastResult = engine.evaluate(input);
    }
    const elapsedMs = performance.now() - start;
    const avgMs = elapsedMs / iterations;

    console.log(`[Phase 6] CrossDomainIntelligenceEngine latency: ${avgMs.toFixed(3)}ms (budget: < 15ms)`);
    assert.ok(avgMs < 15.0, `Evaluation must be under 15ms budget, took ${avgMs}ms`);

    // Deterministic replay: rerun produces identical insight count and tension scores
    const replayResult = engine.evaluate(input);
    assert.equal(replayResult.length, lastResult.length);
    assert.equal(replayResult[0].tensionScore, lastResult[0].tensionScore);
    assert.equal(replayResult[0].title, lastResult[0].title);
  });
});
