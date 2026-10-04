/**
 * phase4DeepUserModel.test.ts
 * Phase 4 Verification Suite: Deep User Model & Preference Intelligence
 * Validates 5-tier authority hierarchy, non-overridability of explicit preferences,
 * candidate promotion, latency budgets (< 2ms), zero-regex contradiction resolution,
 * and MongoDB persistence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { RealityTestHarness } from "./RealityTestHarness";
import { PreferenceAuthorityManager } from "../../user/PreferenceAuthorityManager";
import { UserDeepProfileModel } from "../../server/db/models/UserDeepProfileModel";
import { ContradictionResolver } from "../../memory/ContradictionResolver";
import { CandidateMemory } from "../../memory/EpistemicVerificationEngine";
import { PersonalMemoryRecord } from "../../memory/PersonalMemoryContracts";

test("PHASE 4: Deep User Model & Preference Intelligence Suite", async (suite) => {
  const testUserId = new mongoose.Types.ObjectId().toString();
  const harness = new RealityTestHarness();

  await harness.connect();
  if (mongoose.connection.readyState === 1) {
    await UserDeepProfileModel.deleteMany({ userId: testUserId });
  }

  const prefManager = PreferenceAuthorityManager.getInstance();
  prefManager.clearCache();

  await suite.test("PREF-01: 5-Tier Authority Hierarchy - Lower Tier Cannot Overwrite Higher Tier", async () => {
    const key = "no_meetings_before_10am";

    // 1. User sets an EXPLICIT_HARD rule
    const setHardSuccess = await prefManager.setPreference(testUserId, {
      key,
      value: true,
      authority: "EXPLICIT_HARD",
      confidence: 1.0,
      lastReinforced: Date.now(),
      provenance: {
        source: "manual",
        sourceId: "user_settings_page",
        subsystem: "UserSettings",
        extractedAt: Date.now(),
      },
    });
    assert.equal(setHardSuccess, true, "Setting EXPLICIT_HARD rule must succeed");

    const resolvedInitial = await prefManager.resolvePreference(testUserId, key);
    assert.equal(resolvedInitial.effectiveValue, true);
    assert.equal(resolvedInitial.authority, "EXPLICIT_HARD");
    assert.equal(resolvedInitial.isOverridableByAgent, false);

    // 2. An inferred LEARNED observation attempts to overwrite it with false
    const overwriteLearnedSuccess = await prefManager.setPreference(testUserId, {
      key,
      value: false,
      authority: "LEARNED",
      confidence: 0.85,
      lastReinforced: Date.now(),
      provenance: {
        source: "calendar",
        sourceId: "calendar_analysis",
        subsystem: "LearningEngine",
        extractedAt: Date.now(),
      },
    });
    assert.equal(overwriteLearnedSuccess, false, "LEARNED preference MUST NOT overwrite EXPLICIT_HARD");

    // 3. A CANDIDATE proposal attempts to overwrite it
    const overwriteCandidateSuccess = await prefManager.setPreference(testUserId, {
      key,
      value: false,
      authority: "CANDIDATE",
      confidence: 0.90,
      lastReinforced: Date.now(),
      provenance: {
        source: "calendar",
        sourceId: "candidate_trigger",
        subsystem: "LearningEngine",
        extractedAt: Date.now(),
      },
    });
    assert.equal(overwriteCandidateSuccess, false, "CANDIDATE preference MUST NOT overwrite EXPLICIT_HARD");

    // 4. Verify value remains untouched
    const resolvedAfterAttempts = await prefManager.resolvePreference(testUserId, key);
    assert.equal(resolvedAfterAttempts.effectiveValue, true, "Effective value must remain true");
    assert.equal(resolvedAfterAttempts.authority, "EXPLICIT_HARD");
  });

  await suite.test("PREF-02: Candidate Promotion to EXPLICIT_SOFT on User Confirmation", async () => {
    const key = "preferred_workout_time";

    // 1. LearningEngine proposes a CANDIDATE preference
    await prefManager.setPreference(testUserId, {
      key,
      value: "evening",
      authority: "CANDIDATE",
      confidence: 0.80,
      lastReinforced: Date.now(),
      provenance: {
        source: "tasks",
        sourceId: "task_cadence_inference",
        subsystem: "LearningEngine",
        extractedAt: Date.now(),
      },
    });

    const candidateResolved = await prefManager.resolvePreference(testUserId, key);
    assert.equal(candidateResolved.authority, "CANDIDATE");
    assert.equal(candidateResolved.effectiveValue, "evening");

    // 2. User confirms candidate preference
    const promoteSuccess = await prefManager.promoteCandidatePreference(testUserId, key);
    assert.equal(promoteSuccess, true, "Promotion must succeed for CANDIDATE");

    const promotedResolved = await prefManager.resolvePreference(testUserId, key);
    assert.equal(promotedResolved.authority, "EXPLICIT_SOFT", "Promoted preference must become EXPLICIT_SOFT");
    assert.equal(promotedResolved.confidence, 1.0);
    assert.equal(promotedResolved.effectiveValue, "evening");
  });

  await suite.test("PREF-03: Preference Lookup Latency Budget (< 2ms)", async () => {
    const key = "latency_test_key";
    await prefManager.setPreference(testUserId, {
      key,
      value: 42,
      authority: "EXPLICIT_SOFT",
      confidence: 1.0,
      lastReinforced: Date.now(),
      provenance: {
        source: "manual",
        sourceId: "test",
        subsystem: "Test",
        extractedAt: Date.now(),
      },
    });

    // Benchmark 1,000 lookups
    const start = performance.now();
    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      await prefManager.resolvePreference(testUserId, key);
    }
    const totalDurationMs = performance.now() - start;
    const avgDurationMs = totalDurationMs / iterations;

    console.log(`[Phase 4] Preference lookup latency: ${avgDurationMs.toFixed(4)}ms (budget: < 2ms)`);
    assert.ok(avgDurationMs < 2.0, `Lookup must be under 2ms, took ${avgDurationMs}ms`);
  });

  await suite.test("PREF-04: Zero-Regex Contradiction Resolution Verification", () => {
    const resolver = ContradictionResolver.getInstance();

    const existingFact: any = {
      id: "mem_diet_existing",
      userId: testUserId,
      content: "I am strictly vegetarian",
      summary: "Dietary preference: vegetarian",
      domain: "health",
      memoryType: "semantic_fact",
      source: "explicit_user_statement",
      confidence: 1.0,
      importance: 0.9,
      isArchived: false,
      firstObservedAt: Date.now() - 86400000,
      lastReinforcedAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
      lifecycleStatus: "verified",
      evidenceCount: 1,
      provenance: {},
      relatedEntityIds: [],
      embeddingModel: "text-embedding-3-small",
      embeddingVersion: 1,
    };

    // 1. Explicit user statement contradiction (vegetarian -> meat)
    const candidateExplicit: CandidateMemory = {
      userId: testUserId,
      content: "I stopped being vegetarian and now eat meat regularly",
      summary: "Dietary preference: omnivore",
      domain: "health",
      memoryType: "semantic_fact",
      source: "explicit_user_statement",
    };

    const resolutionExplicit = resolver.resolve(candidateExplicit, [
      { memory: existingFact, score: 0.85 },
    ]);

    assert.equal(resolutionExplicit.action, "SUPERSEDED");
    assert.equal(resolutionExplicit.targetMemoryId, existingFact.id);

    // 2. Invariant 9: System inference trying to contradict explicit fact must be REJECTED
    const candidateInference: CandidateMemory = {
      userId: testUserId,
      content: "User eats meat based on restaurant receipt",
      summary: "Dietary preference: omnivore",
      domain: "health",
      memoryType: "semantic_fact",
      source: "system_inference",
    };

    const resolutionInference = resolver.resolve(candidateInference, [
      { memory: existingFact, score: 0.85 },
    ]);

    assert.equal(
      resolutionInference.action,
      "REJECTED_CONTRADICTION",
      "System inference must be REJECTED when contradicting verified explicit fact"
    );
  });

  await suite.test("PREF-05: MongoDB Persistence in UserDeepProfileModel", async () => {
    if (mongoose.connection.readyState !== 1) return;

    const doc = await UserDeepProfileModel.findOne({ userId: testUserId });
    assert.ok(doc, "UserDeepProfileModel document must exist in MongoDB");
    assert.equal(doc.userId, testUserId);
    assert.ok(doc.preferences.length >= 2, "Must contain persisted preferences");

    const noMeetingsPref = doc.preferences.find((p) => p.key === "no_meetings_before_10am");
    assert.ok(noMeetingsPref);
    assert.equal(noMeetingsPref.authority, "EXPLICIT_HARD");
    assert.equal(noMeetingsPref.value, true);
  });

  // Cleanup
  if (mongoose.connection.readyState === 1) {
    await UserDeepProfileModel.deleteMany({ userId: testUserId });
  }
  await harness.disconnect();
});
