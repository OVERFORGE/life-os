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

function createMockState(): AuthoritativeKernelState {
  const worldSnapshot = createMockKernelSnapshot({
    userId: "user_p6_test",
  });
  const graphSnapshot = createMockGraphSnapshot();
  return {
    userId: "user_p6_test",
    timestamp: Date.now(),
    worldSnapshot,
    graphSnapshot,
  };
}

test("Phase 6 (TC-15): Productivity projection contains zero raw biometrics and is deeply frozen", () => {
  const engine = new ContextProjectionEngine();
  const state = createMockState();

  const projection = engine.projectProductivity(state);

  // Invariant 1: Permitted fields exist
  assert.equal(projection.domain, "productivity");
  assert.ok(Array.isArray(projection.tasks));
  assert.ok(typeof projection.workloadDensityScore === "number");

  // Invariant 2: Derived cross-domain signals are present
  assert.ok(typeof projection.crossDomainSignals.cognitiveReadinessScore === "number");
  assert.ok(["low", "medium", "high"].includes(projection.crossDomainSignals.physicalEnergyLevel));

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

test("Phase 6 (TC-15): Health projection contains zero task descriptions or financial metadata", () => {
  const engine = new ContextProjectionEngine();
  const state = createMockState();

  const projection = engine.projectHealth(state);

  assert.equal(projection.domain, "health");
  assert.ok(["recovery", "maintenance", "overload"].includes(projection.trainingStatus));
  assert.ok(typeof projection.crossDomainSignals.pendingTaskCount === "number");

  // Invariant: NO task descriptions or financial metadata
  const json = JSON.stringify(projection);
  for (const forbidden of FORBIDDEN_HEALTH_FIELDS) {
    assert.equal(
      json.toLowerCase().includes(`"${forbidden.toLowerCase()}":`),
      false,
      `Health projection leaked forbidden field: ${forbidden}`
    );
  }

  // Confirm task titles/descriptions do NOT exist in Health projection
  assert.equal(json.includes("Write Q3 Report"), false);
  assert.equal(json.includes("Review Code PR"), false);

  assert.ok(Object.isFrozen(projection));
});

test("Phase 6 (TC-15): Wellness projection contains normalized workload metrics and no raw biometrics", () => {
  const engine = new ContextProjectionEngine();
  const state = createMockState();

  const projection = engine.projectWellness(state);

  assert.equal(projection.domain, "wellness");
  assert.ok(typeof projection.mentalBandwidthScore === "number");
  assert.ok(["low", "moderate", "high", "critical"].includes(projection.stressBand));
  assert.ok(typeof projection.crossDomainSignals.normalizedWorkload.activeTasks === "number");

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

  // Simulate an adversary attempting to leak raw HRV into productivity
  const leakedProductivityPayload = {
    domain: "productivity",
    tasks: [],
    rawHrv: 45, // FORBIDDEN!
  };

  assert.throws(
    () => engine.assertNoForbiddenFields(leakedProductivityPayload, FORBIDDEN_PRODUCTIVITY_FIELDS, "Productivity"),
    /\[SECURITY_VIOLATION\]: Forbidden field 'rawHrv' leaked into Productivity context projection!/
  );

  // Simulate an adversary attempting to leak confidential task descriptions into health
  const leakedHealthPayload = {
    domain: "health",
    taskDescriptions: ["Secret corporate merger documentation"], // FORBIDDEN!
  };

  assert.throws(
    () => engine.assertNoForbiddenFields(leakedHealthPayload, FORBIDDEN_HEALTH_FIELDS, "Health"),
    /\[SECURITY_VIOLATION\]: Forbidden field 'taskDescriptions' leaked into Health context projection!/
  );
});
