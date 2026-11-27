import test from "node:test";
import assert from "node:assert/strict";
import {
  ContextProjectionEngine,
  FORBIDDEN_PRODUCTIVITY_FIELDS,
  FORBIDDEN_HEALTH_FIELDS,
  FORBIDDEN_WELLNESS_FIELDS,
} from "../orchestration/context/ContextProjectionEngine";
import { createMockKernelSnapshot, createMockGraphSnapshot } from "./fixtures/mockWorldState";
import { AuthoritativeKernelState } from "../orchestration/kernel/IKernelCapabilityService";

function createMockState(withDomainData: boolean = false): AuthoritativeKernelState {
  const worldSnapshot = createMockKernelSnapshot({
    userId: "user_p6_test",
  });
  if (withDomainData) {
    (worldSnapshot.subsystems.lifeState as any).physiologicalScore = 82;
    (worldSnapshot.subsystems.lifeState as any).mentalState = {
      focusIndex: 0.85,
      stressLevel: 0.25,
      energyLevel: 0.8,
      sleepDebtHours: 0.5,
    };
  }
  const graphSnapshot = createMockGraphSnapshot();
  return {
    userId: "user_p6_test",
    timestamp: Date.now(),
    worldSnapshot,
    graphSnapshot,
    domainSnapshot: withDomainData
      ? {
          dailyLog: {
            date: "2026-11-26",
            sleepHours: 7.5,
            sleepQuality: 8,
            moodScore: 8,
            energyLevel: 8,
            stressLevel: 3,
            hydrationMl: 1750,
            caloriesEstimate: 2100,
          },
          nutrition: {
            date: "2026-11-26",
            totalCalories: 2100,
            hydrationMl: 1750,
          },
          recentWorkouts: [
            { id: "w1", type: "strength", intensity: "high", durationMinutes: 50 },
          ],
          cognitiveState: {
            focusIndex: 0.85,
            stressLevel: 0.25,
            energyLevel: 0.8,
            recoveryCapacity: 0.82,
            sleepDebtHours: 0.5,
            physiologicalScore: 82,
            confidence: 0.9,
          },
          missingDomains: [],
        }
      : {
          dailyLog: null,
          nutrition: null,
          recentWorkouts: [],
          cognitiveState: null,
          missingDomains: ["dailyLog", "nutrition", "workouts", "cognitiveState"],
        },
  };
}

test("Phase 6 (TC-15): Productivity projection enforces truthful nulls, hydrates goals, contains zero raw biometrics, and is deeply frozen", () => {
  const engine = new ContextProjectionEngine();

  // Unobserved physiological/cognitive state must be null / "unknown" (D1)
  const ungrounded = engine.projectProductivity(createMockState(false));
  assert.equal(ungrounded.domain, "productivity");
  assert.ok(Array.isArray(ungrounded.tasks));
  assert.ok(ungrounded.goals.length >= 1, "Goals must hydrate from goalPressure");
  assert.equal(ungrounded.crossDomainSignals.cognitiveReadinessScore, null);
  assert.equal(ungrounded.crossDomainSignals.physicalEnergyLevel, "unknown");
  assert.equal(ungrounded.crossDomainSignals.recoveryBand, "unknown");
  assert.equal(ungrounded.dataStatus, "partial");

  // Grounded state hydrates authentic numbers
  const projection = engine.projectProductivity(createMockState(true));
  assert.equal(projection.dataStatus, "grounded");
  assert.equal(projection.crossDomainSignals.cognitiveReadinessScore, 85);
  assert.equal(projection.crossDomainSignals.physicalEnergyLevel, "high");
  assert.equal(projection.crossDomainSignals.recoveryBand, "optimal");

  // Invariant 3: NO raw biometric data
  const json = JSON.stringify(projection);
  for (const forbidden of FORBIDDEN_PRODUCTIVITY_FIELDS) {
    assert.equal(
      json.toLowerCase().includes(`"${forbidden.toLowerCase()}":`),
      false,
      `Productivity projection leaked forbidden field: ${forbidden}`
    );
  }

  // Invariant 4: Deeply frozen / immutable
  assert.ok(Object.isFrozen(projection));
  assert.ok(Object.isFrozen(projection.crossDomainSignals));
});

test("Phase 6 (TC-15): Health projection enforces truthful nulls, hydrates empirical data, and leaks zero task descriptions", () => {
  const engine = new ContextProjectionEngine();

  const ungrounded = engine.projectHealth(createMockState(false));
  assert.equal(ungrounded.domain, "health");
  assert.equal(ungrounded.trainingStatus, "unknown");
  assert.equal(ungrounded.biometricSummary.physicalRecoveryScore, null);
  assert.equal(ungrounded.biometricSummary.sleepDurationHours, null);
  assert.equal(ungrounded.nutritionSummary.hydrationMl, null);
  assert.equal(ungrounded.nutritionSummary.caloriesEstimate, null);
  assert.equal(ungrounded.dataStatus, "unknown");

  const projection = engine.projectHealth(createMockState(true));
  assert.equal(projection.dataStatus, "grounded");
  assert.equal(projection.trainingStatus, "maintenance");
  assert.equal(projection.biometricSummary.physicalRecoveryScore, 82);
  assert.equal(projection.biometricSummary.sleepDurationHours, 7.5);
  assert.equal(projection.nutritionSummary.hydrationMl, 1750);
  assert.equal(projection.nutritionSummary.caloriesEstimate, 2100);
  assert.equal(projection.recentWorkouts.length, 1);

  // Invariant: NO task descriptions or financial metadata
  const json = JSON.stringify(projection);
  for (const forbidden of FORBIDDEN_HEALTH_FIELDS) {
    assert.equal(
      json.toLowerCase().includes(`"${forbidden.toLowerCase()}":`),
      false,
      `Health projection leaked forbidden field: ${forbidden}`
    );
  }

  assert.equal(json.includes("Complete Thesis Chapter 1"), false);
  assert.equal(json.includes("Review Code PR"), false);
  assert.ok(Object.isFrozen(projection));
});

test("Phase 6 (TC-15): Wellness projection enforces truthful nulls/unknowns and normalized workload metrics", () => {
  const engine = new ContextProjectionEngine();

  const ungrounded = engine.projectWellness(createMockState(false));
  assert.equal(ungrounded.domain, "wellness");
  assert.equal(ungrounded.recoveryCapacity, null);
  assert.equal(ungrounded.mentalBandwidthScore, null);
  assert.equal(ungrounded.stressBand, "unknown");
  assert.equal(ungrounded.sleepSummary.totalHours, null);
  assert.equal(ungrounded.sleepSummary.perceivedQuality, "unknown");
  assert.equal(ungrounded.crossDomainSignals.physicalFatigue, "unknown");
  assert.equal(ungrounded.dataStatus, "unknown");

  const projection = engine.projectWellness(createMockState(true));
  assert.equal(projection.dataStatus, "grounded");
  assert.equal(projection.recoveryCapacity, 82);
  assert.equal(projection.mentalBandwidthScore, 75);
  assert.equal(projection.stressBand, "low");
  assert.equal(projection.sleepSummary.totalHours, 7.5);
  assert.equal(projection.sleepSummary.perceivedQuality, "excellent");
  assert.equal(projection.crossDomainSignals.physicalFatigue, "fresh");

  const json = JSON.stringify(projection);
  for (const forbidden of FORBIDDEN_WELLNESS_FIELDS) {
    assert.equal(
      json.toLowerCase().includes(`"${forbidden.toLowerCase()}":`),
      false,
      `Wellness projection leaked forbidden field: ${forbidden}`
    );
  }

  assert.ok(Object.isFrozen(projection));
});

test("Phase 6 (TC-15): Intentional injection of forbidden fields is caught and rejected by assertNoForbiddenFields", () => {
  const engine = new ContextProjectionEngine();

  const leakedProductivityPayload = {
    domain: "productivity",
    tasks: [],
    rawHrv: 45,
  };

  assert.throws(
    () => engine.assertNoForbiddenFields(leakedProductivityPayload, FORBIDDEN_PRODUCTIVITY_FIELDS, "Productivity"),
    /\[SECURITY_VIOLATION\]: Forbidden field 'rawHrv' leaked into Productivity context projection!/
  );

  const leakedHealthPayload = {
    domain: "health",
    taskDescriptions: ["Secret corporate merger documentation"],
  };

  assert.throws(
    () => engine.assertNoForbiddenFields(leakedHealthPayload, FORBIDDEN_HEALTH_FIELDS, "Health"),
    /\[SECURITY_VIOLATION\]: Forbidden field 'taskDescriptions' leaked into Health context projection!/
  );
});
