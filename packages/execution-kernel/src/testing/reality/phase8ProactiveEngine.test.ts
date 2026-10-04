import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

import { AutonomyPolicyManager } from "../../proactive/AutonomyPolicyManager";
import { InterruptionCostEvaluator } from "../../proactive/InterruptionCostEvaluator";
import { NotificationFatigueFilter } from "../../proactive/NotificationFatigueFilter";
import { ProactivePolicyDaemon } from "../../proactive/ProactivePolicyDaemon";
import { ProactiveEngine } from "../../proactive/ProactiveEngine";
import { IProactiveCandidate } from "../../proactive/contracts/ProactiveContracts";
import { ILifeContextProjection } from "../../worldv2/contracts/LifeContextProjectionContracts";
import { ProactiveActionLogModel } from "../../../../../apps/web/server/db/models/ProactiveActionLogModel";
import { ActionProposal } from "../../orchestration/contracts/ActionProposalContracts";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

test("PHASE 8: Proactive Intelligence & Policy Engine Suite", async (suite) => {
  const testUserId = "test-user-proact-phase8-" + Date.now();

  suite.before(async () => {
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri && mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { dbName: "lifeos" });
    }
  });

  suite.after(async () => {
    if (mongoose.connection.readyState === 1) {
      await ProactiveActionLogModel.deleteMany({ userId: testUserId });
      await mongoose.disconnect();
    }
  });

  await suite.test("PROACT-01: Autonomy Tiers (L0-L5) & Constitutional Safety (No Confidence-Based Execution)", async () => {
    const manager = AutonomyPolicyManager.getInstance();

    const lowRiskCandidate: IProactiveCandidate = {
      candidateId: "cand-low-01",
      userId: testUserId,
      autonomyLevel: "L5",
      urgency: "MEDIUM",
      domain: "FOCUS",
      proposal: {
        proposalId: "prop-01",
        capabilityURN: "urn:lifeos:action:create_internal_focus_block",
        intentCategory: "CREATE_SCHEDULE_ITEM",
        parameters: {},
        confidence: 0.99, // High confidence!
      } as unknown as ActionProposal,
      rationale: "Internal focus block is safe and reversible",
      requiredConfidence: 0.8,
      dedupKey: "dedup-01",
      actionValueScore: 0.8,
      estimatedInterruptionCost: 0.2,
      createdAt: Date.now(),
    };

    const externalDangerousCandidate: IProactiveCandidate = {
      candidateId: "cand-danger-01",
      userId: testUserId,
      autonomyLevel: "L5",
      urgency: "HIGH",
      domain: "SCHEDULE",
      proposal: {
        proposalId: "prop-02",
        capabilityURN: "urn:lifeos:action:delete_calendar_event",
        intentCategory: "MODIFY_SCHEDULE",
        parameters: {},
        confidence: 0.999, // Extreme confidence
      } as unknown as ActionProposal,
      rationale: "Delete meeting",
      requiredConfidence: 0.8,
      dedupKey: "dedup-02",
      actionValueScore: 0.9,
      estimatedInterruptionCost: 0.3,
      createdAt: Date.now(),
    };

    // Case A: User setting is L0 (Observe) -> All candidates blocked
    const evalL0 = manager.evaluateAutonomyEligibility(lowRiskCandidate, "L0");
    assert.equal(evalL0.eligible, false);
    assert.equal(evalL0.effectiveAutonomyLevel, "L0");

    // Case B: User setting is L5, Candidate is low-risk internal -> Eligible for L5 autonomous execution
    const evalL5Low = manager.evaluateAutonomyEligibility(lowRiskCandidate, "L5");
    assert.equal(evalL5Low.eligible, true);
    assert.equal(evalL5Low.effectiveAutonomyLevel, "L5");
    assert.equal(evalL5Low.requiresApproval, false);

    // Case C: Constitutional Invariant: External mutation / deletion CANNOT execute autonomously at L5
    // even with 0.999 confidence and user setting L5! Must be demoted to L4 (Approval required).
    const evalL5Dangerous = manager.evaluateAutonomyEligibility(externalDangerousCandidate, "L5");
    assert.equal(evalL5Dangerous.effectiveAutonomyLevel, "L4");
    assert.equal(evalL5Dangerous.requiresApproval, true, "Dangerous external mutation must require approval");
  });

  await suite.test("PROACT-02: Interruption Cost Evaluator (Quiet Hours & Cognitive Context)", async () => {
    const evaluator = InterruptionCostEvaluator.getInstance();

    const candidate: IProactiveCandidate = {
      candidateId: "cand-eval-01",
      userId: testUserId,
      autonomyLevel: "L4",
      urgency: "MEDIUM",
      domain: "TASK",
      proposal: {} as ActionProposal,
      rationale: "Task triage",
      requiredConfidence: 0.8,
      dedupKey: "eval-01",
      actionValueScore: 0.70,
      estimatedInterruptionCost: 0.20,
      createdAt: Date.now(),
    };

    // Normal afternoon context (cost low, should interrupt)
    const normalEval = evaluator.evaluate(candidate, {
      cognitiveLoad: 0.3,
      isQuietHours: false,
      inMeeting: false,
      inDeepWork: false,
      recentNotificationCountToday: 0,
    });
    assert.equal(normalEval.shouldInterrupt, true);
    assert.ok(normalEval.cost < 0.4);

    // Quiet hours context (cost prohibitive, blocks non-critical)
    const quietEval = evaluator.evaluate(candidate, {
      cognitiveLoad: 0.3,
      isQuietHours: true,
      inMeeting: false,
      inDeepWork: false,
      recentNotificationCountToday: 0,
    });
    assert.equal(quietEval.shouldInterrupt, false);
    assert.ok(quietEval.cost >= 1.0);
    assert.equal(quietEval.quietHoursActive, true);

    // Critical emergency alert penetrates quiet hours
    const criticalCandidate = { ...candidate, urgency: "CRITICAL" as const, actionValueScore: 0.95 };
    const criticalQuietEval = evaluator.evaluate(criticalCandidate, {
      cognitiveLoad: 0.3,
      isQuietHours: true,
      inMeeting: false,
      inDeepWork: false,
      recentNotificationCountToday: 0,
    });
    assert.equal(criticalQuietEval.shouldInterrupt, true);
  });

  await suite.test("PROACT-03: Notification Fatigue Filter & Daily Limits", async () => {
    const filter = NotificationFatigueFilter.getInstance();
    filter.clearHistory(testUserId);

    const testTime = new Date("2026-10-04T14:00:00Z").getTime(); // 2 PM UTC (outside quiet hours)

    const baseCandidate: IProactiveCandidate = {
      candidateId: "cand-fatigue",
      userId: testUserId,
      autonomyLevel: "L4",
      urgency: "HIGH",
      domain: "SCHEDULE",
      proposal: {} as ActionProposal,
      rationale: "Schedule adjustment",
      requiredConfidence: 0.85,
      dedupKey: "fatigue-key-1",
      actionValueScore: 0.8,
      estimatedInterruptionCost: 0.3,
      createdAt: testTime,
    };

    // First alert: Allowed
    const res1 = filter.shouldAllowNotification(baseCandidate, testTime, "UTC");
    assert.equal(res1.allowed, true);
    filter.recordDispatchedNotification(testUserId, baseCandidate.domain, baseCandidate.dedupKey, testTime);

    // Immediate duplicate: Suppressed by deduplication
    const resDup = filter.shouldAllowNotification(baseCandidate, testTime + 60000, "UTC");
    assert.equal(resDup.allowed, false);
    assert.ok(resDup.suppressionReason?.includes("Duplicate"));

    // Distinct key 10 mins later: Suppressed by hourly rate limit (max 1/hr)
    const resHourly = filter.shouldAllowNotification({
      ...baseCandidate,
      dedupKey: "fatigue-key-2",
    }, testTime + 10 * 60000, "UTC");
    assert.equal(resHourly.allowed, false);
    assert.ok(resHourly.suppressionReason?.includes("Hourly rate limit"));

    // Distinct key 2 hours later in same domain: Suppressed by 4-hour domain cooldown
    const resCooldown = filter.shouldAllowNotification({
      ...baseCandidate,
      dedupKey: "fatigue-key-2",
    }, testTime + 2 * 3600 * 1000, "UTC");
    assert.equal(resCooldown.allowed, false);
    assert.ok(resCooldown.suppressionReason?.includes("cooldown"));

    // Distinct key 4.5 hours later in HEALTH domain: Allowed (cooldown passed, domain different, 18:30 UTC)
    const time4_5hLater = testTime + Math.floor(4.5 * 3600 * 1000);
    const resHealth = filter.shouldAllowNotification({
      ...baseCandidate,
      domain: "HEALTH",
      dedupKey: "fatigue-key-3",
    }, time4_5hLater, "UTC");
    assert.equal(resHealth.allowed, true);
    filter.recordDispatchedNotification(testUserId, "HEALTH", "fatigue-key-3", time4_5hLater);

    // Send 3rd notification 7 hours later in FOCUS domain (21:00 UTC, before quiet hours at 22:00): Allowed
    const time7hLater = testTime + 7 * 3600 * 1000;
    const resFocus = filter.shouldAllowNotification({
      ...baseCandidate,
      domain: "FOCUS",
      dedupKey: "fatigue-key-4",
    }, time7hLater, "UTC");
    assert.equal(resFocus.allowed, true);
    filter.recordDispatchedNotification(testUserId, "FOCUS", "fatigue-key-4", time7hLater);

    // 4th notification at 21:30 UTC: Suppressed by Daily Notification Budget (max 3/day)
    const time7_5hLater = testTime + Math.floor(7.5 * 3600 * 1000);
    const res4th = filter.shouldAllowNotification({
      ...baseCandidate,
      domain: "TASK",
      dedupKey: "fatigue-key-5",
    }, time7_5hLater, "UTC");
    assert.equal(res4th.allowed, false);
    assert.ok(res4th.suppressionReason?.includes("Daily notification budget exceeded"));
  });

  await suite.test("PROACT-04: Circuit Breaker Protection on Consecutive Failures/Rejections", async () => {
    const manager = AutonomyPolicyManager.getInstance();
    manager.resetCircuitBreaker(testUserId);

    const candidate: IProactiveCandidate = {
      candidateId: "cand-cb",
      userId: testUserId,
      autonomyLevel: "L5",
      urgency: "MEDIUM",
      domain: "FOCUS",
      proposal: {
        proposalId: "p1",
        capabilityURN: "urn:lifeos:action:create_internal_focus_block",
        intentCategory: "CREATE_SCHEDULE_ITEM",
        parameters: {},
        confidence: 0.9,
      } as unknown as ActionProposal,
      rationale: "Focus block",
      requiredConfidence: 0.8,
      dedupKey: "cb-test",
      actionValueScore: 0.8,
      estimatedInterruptionCost: 0.2,
      createdAt: Date.now(),
    };

    // Initially active
    const eval1 = manager.evaluateAutonomyEligibility(candidate, "L5");
    assert.equal(eval1.eligible, true);
    assert.equal(eval1.circuitBreakerTripped, false);

    // Record 3 consecutive failures
    manager.recordFailureOrRejection(testUserId);
    manager.recordFailureOrRejection(testUserId);
    manager.recordFailureOrRejection(testUserId);

    // Circuit breaker is now tripped -> Downgraded to L0
    const evalTripped = manager.evaluateAutonomyEligibility(candidate, "L5");
    assert.equal(evalTripped.eligible, false);
    assert.equal(evalTripped.effectiveAutonomyLevel, "L0");
    assert.equal(evalTripped.circuitBreakerTripped, true);

    // Reset restores normal operation
    manager.resetCircuitBreaker(testUserId);
    const evalRestored = manager.evaluateAutonomyEligibility(candidate, "L5");
    assert.equal(evalRestored.eligible, true);
    assert.equal(evalRestored.circuitBreakerTripped, false);
  });

  await suite.test("PROACT-05: Proactive Engine & Daemon Pipeline Execution", async () => {
    const engine = ProactiveEngine.getInstance();
    const daemon = engine.getDaemon();
    NotificationFatigueFilter.getInstance().clearHistory(testUserId);

    // Mock life projection with sleep debt and dense meetings
    const mockProjection: ILifeContextProjection = {
      userId: testUserId,
      projectionTimestamp: Date.now(),
      projectionVersion: 1,
      degradation: { isDegraded: false, missingFields: [], fallbackActive: false },
      cognitiveState: {
        state: "NORMAL",
        confidence: 0.85,
        provenance: "TELEMETRY",
        freshnessTimestamp: Date.now(),
        primaryDrivers: ["Lack of sleep"],
        estimatedFatigue: 0.6,
        estimatedReadiness: 0.5,
      },
      physicalReadiness: {
        readinessScore: 0.5,
        sleepDurationMinutes: 300,
        sleepQualityScore: 0.45, // Poor recovery
        recoveryStatus: "IMPAIRED",
        freshnessTimestamp: Date.now(),
      },
      operationalSchedule: {
        todayMeetingCount: 4,
        todayMeetingDurationMinutes: 240, // Heavy schedule (4 hours)
        freeFocusBlocksRemaining: 2,
        isScheduleTight: true,
        freshnessTimestamp: Date.now(),
      },
      goalPressures: [{
        goalId: "g1",
        title: "Launch V2",
        domain: "productivity",
        pressureScore: 0.85,
        isCritical: true,
      }],
      activeInterventions: [],
      quietHoursActive: false,
    };

    // Daytime timestamp (14:00 UTC)
    const testNow = new Date("2026-10-04T14:00:00Z").getTime();

    // Run proactive pipeline with L4 autonomy setting
    const report = await engine.evaluateProactivePipeline(testUserId, mockProjection, "L4", testNow);

    assert.equal(report.userId, testUserId);
    assert.ok(report.candidatesGenerated.length >= 2, `Expected candidates generated, got ${report.candidatesGenerated.length}`);
    assert.ok(report.notificationsDispatched.length >= 1, "Expected at least 1 notification dispatched");
  });

  await suite.test("PROACT-06: MongoDB Persistence in ProactiveActionLogModel", async () => {
    if (mongoose.connection.readyState !== 1) return;

    const count = await ProactiveActionLogModel.countDocuments({ userId: testUserId });
    assert.ok(count >= 1, `Expected at least 1 proactive log in DB, found ${count}`);

    const log = await ProactiveActionLogModel.findOne({ userId: testUserId });
    assert.ok(log);
    assert.ok(log.actionId.startsWith("act_log_") || log.actionId.startsWith("act_"));
    assert.ok(log.domain);
    assert.ok(log.autonomyLevel);
  });
});
