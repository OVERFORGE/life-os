/**
 * b3Loop4SubsystemMigration.test.ts
 * 
 * Milestone B — Phase B3: Work Package 2 / Loop 4
 * In-Memory Singleton Deprecation & Subsystem Migration Verification
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  BehavioralProfile,
  mapModelToUserProfile,
  DEFAULT_BEHAVIORAL_PROFILE,
} from "../learning/BehaviorProfile";
import { LearningEngine } from "../learning/LearningEngine";
import { LifeStateEngine } from "../worldv2/LifeStateEngine";
import { Observation, createFrozenObservation } from "../telemetry/Observation";

describe("B3 WP2 Loop 4: In-Memory Singleton Deprecation & Subsystem Migration", () => {
  let profileBridge: BehavioralProfile;

  beforeEach(() => {
    profileBridge = BehavioralProfile.getInstance();
    profileBridge.clearUserProfiles();
  });

  it("B3-LOOP4-01: Multi-tenant user isolation prevents behavioral profile leakage between users", () => {
    // Update Alice
    profileBridge.updateUserProfile("usr_alice", {
      taskCompletionRate: 0.95,
      executionConsistency: 0.90,
      procrastinationTendency: 0.05,
    });

    // Update Bob
    profileBridge.updateUserProfile("usr_bob", {
      taskCompletionRate: 0.35,
      executionConsistency: 0.40,
      procrastinationTendency: 0.60,
    });

    const aliceProfile = profileBridge.getUserProfile("usr_alice");
    const bobProfile = profileBridge.getUserProfile("usr_bob");
    const charlieProfile = profileBridge.getUserProfile("usr_charlie"); // uninitialized user

    assert.equal(aliceProfile.taskCompletionRate, 0.95);
    assert.equal(aliceProfile.procrastinationTendency, 0.05);

    assert.equal(bobProfile.taskCompletionRate, 0.35);
    assert.equal(bobProfile.procrastinationTendency, 0.60);

    // Charlie gets truthful defaults without pollution from Alice or Bob
    assert.equal(charlieProfile.taskCompletionRate, DEFAULT_BEHAVIORAL_PROFILE.taskCompletionRate);
    assert.equal(charlieProfile.procrastinationTendency, DEFAULT_BEHAVIORAL_PROFILE.procrastinationTendency);
  });

  it("B3-LOOP4-02: mapModelToUserProfile maps MongoDB model document to UserBehavioralProfile DTO", () => {
    const mockDbDoc = {
      userId: "usr_persisted_123",
      projectionRevision: 5,
      wakeWindow: { averageMinutes: 480 },
      sleepWindow: { averageMinutes: 1380 },
      behaviorStabilityScore: 0.88,
      lastRecalculatedAt: new Date("2026-10-31T03:00:00Z"),
      metrics: {
        taskCompletionRate: 0.82,
        procrastinationTendency: 0.12,
        deepWorkConsistency: 0.75,
        totalWeightedFinalizedCommitments: 24.5,
      },
    };

    const userProfile = mapModelToUserProfile(mockDbDoc, "usr_persisted_123");
    assert.equal(userProfile.userId, "usr_persisted_123");
    assert.equal(userProfile.taskCompletionRate, 0.82);
    assert.equal(userProfile.procrastinationTendency, 0.12);
    assert.equal(userProfile.executionConsistency, 0.75);
    assert.equal(userProfile.scheduleStability, 0.88);
    assert.equal(userProfile.preferredWorkHours.startHour, 8);
    assert.equal(userProfile.preferredSleepWindow.startHour, 23);
  });

  it("B3-LOOP4-03: LearningEngine updates per-user profile when userId is supplied", () => {
    const learningEngine = LearningEngine.getInstance();
    const now = Date.now();

    const aliceObs: Observation[] = [
      createFrozenObservation({
        id: "obs_vel_1",
        userId: "usr_alice",
        type: "TaskExecutionVelocity",
        normalizedValue: 0.92,
        rawValue: 0.92,
        unit: "ratio",
        timestamp: now,
        generatedAt: now,
        generatedBy: "Test",
        confidence: 1.0,
        metadata: {},
        ownership: {
          sourceCollection: "tasks",
          sourceEntityId: "task_1",
          originatingSubsystem: "Test",
          createdAt: now,
        },
      }),
    ];

    const result = learningEngine.processObservations(aliceObs, now, "usr_alice");
    assert.ok(result.activeProfile);
    assert.equal(result.activeProfile.taskCompletionRate, 0.92);
    assert.equal(result.activeProfile.userId, "usr_alice");

    // Verify Bob is not mutated
    const bobProfile = profileBridge.getUserProfile("usr_bob");
    assert.notEqual(bobProfile.taskCompletionRate, 0.92);
  });

  it("B3-LOOP4-04: LifeStateEngine evaluates life state incorporating per-user behavioral evidence", () => {
    const lifeStateEngine = LifeStateEngine.getInstance();
    const aliceProfile = profileBridge.getUserProfile("usr_alice");
    aliceProfile.taskCompletionRate = 0.94;

    const evaluation = lifeStateEngine.evaluate({
      observations: [],
      profile: aliceProfile,
    });

    assert.ok(evaluation.structuredEvidence.some(
      (e) => e.metric === "BehavioralProfileCompletionRate" && e.value === 0.94
    ), "Must include BehavioralProfileCompletionRate structured evidence");
  });
});
