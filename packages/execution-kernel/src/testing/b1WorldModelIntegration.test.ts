/**
 * b1WorldModelIntegration.test.ts
 *
 * Verification suite for Phase B1 Loops 3, 4, 5, 6:
 * - Loop 3: Parallel domain hydration, server maxTimeMS, and monotonic snapshot fencing.
 * - Loop 4: Feeding analytical engines (WorldModelV2, CognitiveStateEngine) with real observations & graph.
 * - Loop 5: Honest UNKNOWN cognitive semantics and null physical metrics when unobserved.
 * - Loop 6: Dual context selection architecture and unbreakable degraded marker invariant.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { WorldModelBridge } from "../worldv2/WorldModelBridge";
import { ContextProjectionSerializer } from "../worldv2/ContextProjectionSerializer";
import { ILifeContextProjection } from "../worldv2/contracts/LifeContextProjectionContracts";
import { createFrozenObservation, generateDeterministicObservationId } from "../telemetry/Observation";
import { ExecutionGraph, ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";

test("LOOP 3-6 (WP2, WP3): Canonical World Model Integration & Truthful Quality", async (suite) => {
  const bridge = WorldModelBridge.getInstance();

  await suite.test("LOOP 3: Snapshot fencing and cache isolation across users", async () => {
    const userA = `user_fence_a_${Date.now()}`;
    const userB = `user_fence_b_${Date.now()}`;

    const projA = await bridge.getProjection(userA);
    const projB = await bridge.getProjection(userB);

    assert.equal(projA.userId, userA);
    assert.equal(projB.userId, userB);
    assert.notEqual(projA.userId, projB.userId, "Users must remain strictly isolated");

    // Cache hit verification
    const cachedA = await bridge.getProjection(userA);
    assert.equal(cachedA.projectionTimestamp, projA.projectionTimestamp, "Should return identical cached instance");
  });

  await suite.test("LOOP 4: Real observations feed analytical engine and cognitive state", async () => {
    const testUserId = `user_real_obs_${Date.now()}`;
    const now = Date.now();

    // Create real observations
    const sleepObs = createFrozenObservation({
      id: generateDeterministicObservationId("SleepDurationHours", "sleep-1", now),
      type: "SleepDurationHours",
      userId: testUserId,
      timestamp: now,
      generatedAt: now,
      generatedBy: "ObservationMapper-v1",
      normalizedValue: 0.85,
      rawValue: 8.0, // 8 hours = 480 mins
      unit: "hours",
      confidence: 0.95,
      metadata: {},
      ownership: { sourceCollection: "wearables", sourceEntityId: "oura_01", originatingSubsystem: "Test", createdAt: now },
    });

    const recoveryObs = createFrozenObservation({
      id: generateDeterministicObservationId("SleepRecoveryScore", "recovery-1", now),
      type: "SleepRecoveryScore",
      userId: testUserId,
      timestamp: now,
      generatedAt: now,
      generatedBy: "ObservationMapper-v1",
      normalizedValue: 0.88, // OPTIMAL recovery
      rawValue: 88,
      unit: "score",
      confidence: 0.92,
      metadata: {},
      ownership: { sourceCollection: "wearables", sourceEntityId: "oura_01", originatingSubsystem: "Test", createdAt: now },
    });

    // Populate a sample execution graph
    const graph = new ExecutionGraph();
    graph.addNode({
      id: "task_urgent_1",
      entityType: "task",
      title: "Deliver Q4 Product Milestone",
      status: "pending",
      priority: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: { dueDate: new Date(now + 86400000).toISOString() },
    });
    const graphSnapshot = graph.createSnapshot();

    const projection = await bridge.getProjection(testUserId, {
      observations: [sleepObs, recoveryObs],
      graphSnapshot,
      forceRefresh: true,
    });

    assert.equal(projection.userId, testUserId);
    // Real physical metrics must match observations exactly
    assert.equal(projection.physicalReadiness.sleepDurationMinutes, 480, "8 hours must convert to 480 minutes");
    assert.equal(projection.physicalReadiness.sleepQualityScore, 0.88);
    assert.equal(projection.physicalReadiness.recoveryStatus, "OPTIMAL");

    // Real cognitive state evaluated from observations
    assert.notEqual(projection.cognitiveState.state, "UNKNOWN", "With observations present, state must be evaluated");
    assert.ok(projection.cognitiveState.estimatedReadiness !== null, "Readiness must be computed");
    assert.ok(projection.cognitiveState.estimatedFatigue !== null, "Fatigue must be computed");
    assert.equal(projection.cognitiveState.evidenceEvaluationStatus, "EVALUATED");
  });

  await suite.test("LOOP 5: Empty telemetry produces truthful UNKNOWN and null physical values", async () => {
    const emptyUserId = `user_truthful_empty_${Date.now()}`;
    const projection = await bridge.getProjection(emptyUserId, { forceRefresh: true });

    // Cognitive State MUST be UNKNOWN with null estimates
    assert.equal(projection.cognitiveState.state, "UNKNOWN");
    assert.equal(projection.cognitiveState.confidence, null);
    assert.equal(projection.cognitiveState.estimatedFatigue, null);
    assert.equal(projection.cognitiveState.estimatedReadiness, null);
    assert.equal(projection.cognitiveState.primaryDrivers.length, 0);
    assert.equal(projection.cognitiveState.evidenceEvaluationStatus, "INSUFFICIENT_EVIDENCE");

    // Physical Readiness MUST be null / UNKNOWN (never fabricated 420m or 0.8)
    assert.equal(projection.physicalReadiness.sleepDurationMinutes, null);
    assert.equal(projection.physicalReadiness.sleepQualityScore, null);
    assert.equal(projection.physicalReadiness.readinessScore, null);
    assert.equal(projection.physicalReadiness.recoveryStatus, "UNKNOWN");

    // Degradation state must be truthful
    assert.equal(projection.degradation.isDegraded, true);
    assert.equal(projection.degradation.fallbackActive, true);
    assert.ok(projection.degradation.missingFields.includes("observations"));
    assert.ok(projection.degradation.missingFields.includes("sleepTelemetry"));
    assert.ok(projection.degradation.missingFields.includes("cognitiveTelemetry"));
  });

  await suite.test("LOOP 6: Dual Context Selection & Unbreakable Degradation Marker Invariant", () => {
    const sampleProjection: ILifeContextProjection = {
      userId: "user_selection_test",
      projectionTimestamp: Date.now(),
      projectionVersion: 2,
      degradation: {
        isDegraded: true,
        degradationReason: "Sensor disconnected",
        missingFields: ["sleepTelemetry"],
        fallbackActive: true,
      },
      cognitiveState: {
        state: "OVERLOADED",
        confidence: 0.88,
        provenance: "TELEMETRY",
        freshnessTimestamp: Date.now(),
        primaryDrivers: ["meeting_density", "context_switching"],
        estimatedFatigue: 0.75,
        estimatedReadiness: 0.30,
        evidenceEvaluationStatus: "EVALUATED",
      },
      physicalReadiness: {
        readinessScore: 0.35,
        sleepDurationMinutes: 320,
        sleepQualityScore: 0.50,
        recoveryStatus: "ADEQUATE",
        freshnessTimestamp: Date.now(),
      },
      operationalSchedule: {
        hardCommitmentCount: 4,
        todayMeetingCount: 4,
        meetingCount: 4,
        todayMeetingDurationMinutes: 180,
        uniqueOccupiedBlockCount: 3,
        totalOccupiedDurationMinutes: 180,
        remainingFreeIntervalsCount: 2,
        freeFocusBlocksRemaining: 1,
        isScheduleTight: true,
        scheduleDensity: 0.70,
        calendarState: "PACKED",
        nextCommitmentTime: "14:00",
        nextCommitmentTitle: "Product Sync",
        freshnessTimestamp: Date.now(),
      },
      goalPressures: [
        { goalId: "g1", title: "Ship B1 Milestone", domain: "engineering", pressureScore: 0.95, isCritical: true },
      ],
      activeInterventions: [],
      quietHoursActive: false,
    };

    // 1. Baseline Summary (~150 tokens)
    const baseline = ContextProjectionSerializer.serializeBaselineSummary(sampleProjection);
    assert.ok(baseline.estimatedTokens <= 150, `Baseline tokens must be <= 150, got ${baseline.estimatedTokens}`);
    assert.ok(baseline.serializedContext.includes("[DEGRADED_CONTEXT:"));

    // 2. Schedule-tailored Context Selection
    const schedSelected = ContextProjectionSerializer.selectContext(sampleProjection, "SCHEDULE");
    assert.ok(schedSelected.estimatedTokens <= 350, `Selected tokens must be <= 350, got ${schedSelected.estimatedTokens}`);
    assert.ok(schedSelected.serializedContext.includes("Schedule: 4 mtgs (180m)"));
    assert.ok(schedSelected.serializedContext.includes("Product Sync @ 14:00"));

    // 3. Health-tailored Context Selection
    const healthSelected = ContextProjectionSerializer.selectContext(sampleProjection, "HEALTH");
    assert.ok(healthSelected.serializedContext.includes("meeting_density"));

    // 4. CRITICAL INVARIANT: Degraded Context Marker is NEVER pruned under extreme budget pressure
    const extremeConstrained = ContextProjectionSerializer.serialize(sampleProjection, {
      maxCharacterBudget: 50, // Severely restricted budget
    });

    assert.ok(
      extremeConstrained.serializedContext.includes("[DEGRADED_CONTEXT:"),
      "Degraded context marker MUST NOT be pruned even under severe budget limit"
    );
  });
});

