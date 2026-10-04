/**
 * phase5BehavioralRelationshipPhysical.test.ts
 * Phase 5 Verification Suite: Behavioral, Relationship & Physical Models
 * Validates dynamic zero-stub relationship context, colloquial alias resolution,
 * material ambiguity disambiguation, physical readiness engine strain tracking,
 * and MongoDB persistence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { RealityTestHarness } from "./RealityTestHarness";
import { RelationshipRepository } from "../../relationships/RelationshipRepository";
import { RelationshipContextEngine } from "../../worldv2/RelationshipContextEngine";
import { RelationshipModel } from "../../server/db/models/RelationshipModel";
import { AuthoritativeEntityResolver } from "../../orchestration/context/AuthoritativeEntityResolver";
import { PhysicalReadinessEngine } from "../../physical/PhysicalReadinessEngine";
import { WearableObservationExtractor } from "../../telemetry/pipeline/WearableObservationExtractor";

test("PHASE 5: Behavioral, Relationship & Physical Models Suite", async (suite) => {
  const testUserId = new mongoose.Types.ObjectId().toString();
  const harness = new RealityTestHarness();

  await harness.connect();
  if (mongoose.connection.readyState === 1) {
    await RelationshipModel.deleteMany({ userId: testUserId });
  }

  const relRepo = RelationshipRepository.getInstance();
  relRepo.clearMemoryCache();
  const relEngine = RelationshipContextEngine.getInstance();
  const entityResolver = AuthoritativeEntityResolver.getInstance();
  const physicalEngine = PhysicalReadinessEngine.getInstance();

  await suite.test("REL-01: RelationshipContextEngine Contains Zero Hardcoded Stubs", async () => {
    // For a user with zero relationships, engine must return empty array, NOT hardcoded stubs
    const emptyContext = await relEngine.getRelationshipContext(testUserId);
    assert.deepEqual(emptyContext, [], "Context for user with no relationships must be empty array");
  });

  await suite.test("REL-02: Authoritative Relationship Storage, Cadence, and Commitments", async () => {
    const now = Date.now();
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    // 1. Add contact: Co-founder with 7-day cadence (10 days since last interaction -> LAPSED)
    await relRepo.saveRelationship({
      userId: testUserId,
      entityId: "rel-michael-1",
      name: "Michael Scott",
      aliases: ["co-founder", "cofounder", "partner"],
      role: "Co-founder",
      importanceScore: 0.95,
      interactionCadenceDays: 7,
      lastInteractedAt: tenDaysAgo,
      activeCommitments: [
        { commitmentId: "com-1", title: "Review Q4 pitch deck", dueTimestamp: now + 86400000, status: "pending" },
      ],
    });

    const context = await relEngine.getRelationshipContext(testUserId, now);
    assert.equal(context.length, 1);
    const summary = context[0];

    assert.equal(summary.personName, "Michael Scott");
    assert.equal(summary.role, "Co-founder");
    assert.equal(summary.importance, 0.95);
    assert.equal(summary.cadenceStatus, "LAPSED", "10 days with 7-day cadence must be LAPSED");
    assert.equal(summary.daysSinceLastInteraction, 10);
    assert.equal(summary.activeCommitmentsCount, 1);

    // 2. Record an interaction -> Cadence updates to ON_TRACK
    await relRepo.recordInteraction(testUserId, "rel-michael-1", now);
    const updatedContext = await relEngine.getRelationshipContext(testUserId, now);
    assert.equal(updatedContext[0].cadenceStatus, "ON_TRACK");
    assert.equal(updatedContext[0].daysSinceLastInteraction, 0);
  });

  await suite.test("REL-03: Colloquial Alias & Name Resolution via AuthoritativeEntityResolver", async () => {
    // 1. Resolve by alias: "cofounder"
    const outcomeAlias = await entityResolver.resolveEntity({
      userId: testUserId,
      rawExpression: "cofounder",
      entityType: "contact",
    });

    assert.equal(outcomeAlias.status, "RESOLVED");
    assert.equal(outcomeAlias.entityId, "rel-michael-1");
    assert.equal(outcomeAlias.title, "Michael Scott");

    // 2. Resolve by exact name: "Michael Scott"
    const outcomeName = await entityResolver.resolveEntity({
      userId: testUserId,
      rawExpression: "Michael Scott",
      entityType: "contact",
    });

    assert.equal(outcomeName.status, "RESOLVED");
    assert.equal(outcomeName.entityId, "rel-michael-1");

    // 3. Unknown contact: "Dr. House" -> NOT_FOUND with proactive question
    const outcomeUnknown = await entityResolver.resolveEntity({
      userId: testUserId,
      rawExpression: "Dr. House",
      entityType: "contact",
    });

    assert.equal(outcomeUnknown.status, "NOT_FOUND");
    assert.ok(outcomeUnknown.clarificationQuestion?.includes("Dr. House"));
  });

  await suite.test("REL-04: Material Ambiguity Disambiguation (Multiple Matches)", async () => {
    // Add two contacts named Alex
    await relRepo.saveRelationship({
      userId: testUserId,
      entityId: "rel-alex-chen",
      name: "Alex Chen",
      aliases: ["tech lead"],
      role: "Tech Lead",
      importanceScore: 0.85,
      interactionCadenceDays: 3,
      lastInteractedAt: Date.now(),
      activeCommitments: [],
    });

    await relRepo.saveRelationship({
      userId: testUserId,
      entityId: "rel-alex-smith",
      name: "Alex Smith",
      aliases: ["lead investor", "investor"],
      role: "Lead Investor",
      importanceScore: 0.90,
      interactionCadenceDays: 14,
      lastInteractedAt: Date.now(),
      activeCommitments: [],
    });

    // Resolve "Alex": must NOT guess; must ask clarification
    const outcomeAmbiguous = await entityResolver.resolveEntity({
      userId: testUserId,
      rawExpression: "Alex",
      entityType: "contact",
    });

    assert.equal(outcomeAmbiguous.status, "AMBIGUOUS");
    assert.ok(outcomeAmbiguous.candidateIds?.includes("rel-alex-chen"));
    assert.ok(outcomeAmbiguous.candidateIds?.includes("rel-alex-smith"));
    assert.ok(outcomeAmbiguous.clarificationQuestion?.includes("Alex Chen"));
    assert.ok(outcomeAmbiguous.clarificationQuestion?.includes("Alex Smith"));
  });

  await suite.test("REL-05: Relationship Resolution Latency Budget (< 5ms)", async () => {
    const start = performance.now();
    const iterations = 500;
    for (let i = 0; i < iterations; i++) {
      await entityResolver.resolveEntity({
        userId: testUserId,
        rawExpression: "cofounder",
        entityType: "contact",
      });
    }
    const elapsedMs = performance.now() - start;
    const avgMs = elapsedMs / iterations;

    console.log(`[Phase 5] Contact resolution latency: ${avgMs.toFixed(3)}ms (budget: < 5ms)`);
    assert.ok(avgMs < 5.0, `Resolution must be under 5ms budget, took ${avgMs}ms`);
  });

  await suite.test("PHYS-01: PhysicalReadinessEngine Longitudinal Training & Recovery Modeling", () => {
    const now = Date.now();

    // 1. Well-rested, light workout day
    const lightObs = WearableObservationExtractor.extractObservations({
      userId: testUserId,
      data: { source: "whoop", timestamp: now, sleepHours: 8.0, sleepQualityScore: 88 },
    });

    const lightReadiness = physicalEngine.evaluate({
      userId: testUserId,
      observations: lightObs,
      recentWorkouts: [
        { id: "w1", type: "Walk", intensity: "low", durationMinutes: 30, timestamp: now - 3600000 },
      ],
      currentTime: now,
    });

    assert.ok(lightReadiness.readinessScore >= 0.70);
    assert.equal(lightReadiness.recoveryStatus, "OPTIMAL");
    assert.equal(lightReadiness.sleepDebtHours, 0);

    // 2. Heavy Strain Safety Test: Intense leg workout + short sleep (5.0 hours)
    const heavyStrainObs = WearableObservationExtractor.extractObservations({
      userId: testUserId,
      data: { source: "whoop", timestamp: now, sleepHours: 5.0, sleepQualityScore: 48, restingHeartRate: 72 },
    });

    const heavyReadiness = physicalEngine.evaluate({
      userId: testUserId,
      observations: heavyStrainObs,
      recentWorkouts: [
        { id: "w2", type: "Heavy Squats & Deadlifts", intensity: "high", durationMinutes: 90, timestamp: now - 7200000 },
      ],
      currentTime: now,
    });

    // Must recognize depleted state without false alarms
    assert.ok(heavyReadiness.readinessScore < 0.45);
    assert.equal(heavyReadiness.recoveryStatus, "CRITICAL");
    assert.ok(heavyReadiness.sleepDebtHours >= 3.0);
    assert.ok(heavyReadiness.primaryDrivers.some((d) => d.includes("strain") || d.includes("deficit")));
    assert.equal(heavyReadiness.disclaimer, "Operational readiness estimate only; not a medical assessment.");
  });

  await suite.test("REL-06: MongoDB Persistence in RelationshipModel", async () => {
    if (mongoose.connection.readyState !== 1) return;

    const count = await RelationshipModel.countDocuments({ userId: testUserId });
    assert.equal(count, 3, "Database must persist the 3 contacts created in suite");

    const michaelDoc = await RelationshipModel.findOne({ userId: testUserId, entityId: "rel-michael-1" });
    assert.ok(michaelDoc);
    assert.equal(michaelDoc.name, "Michael Scott");
    assert.ok(michaelDoc.aliases.includes("cofounder"));
  });

  // Cleanup
  if (mongoose.connection.readyState === 1) {
    await RelationshipModel.deleteMany({ userId: testUserId });
  }
  await harness.disconnect();
});
