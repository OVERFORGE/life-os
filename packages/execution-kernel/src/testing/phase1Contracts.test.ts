import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ORCHESTRATION_POLICY,
  EstimateRecord,
  FactRecord,
  ActionProposal,
  MentalStateEvidence,
} from "../orchestration/contracts";

test("Phase 1: DEFAULT_ORCHESTRATION_POLICY is immutable and structurally sound", () => {
  assert.ok(Object.isFrozen(DEFAULT_ORCHESTRATION_POLICY));
  assert.equal(DEFAULT_ORCHESTRATION_POLICY.defaultMaxIterations, 3);
  assert.equal(DEFAULT_ORCHESTRATION_POLICY.absoluteMaxIterations, 5);
  assert.ok(
    DEFAULT_ORCHESTRATION_POLICY.defaultMaxIterations <= DEFAULT_ORCHESTRATION_POLICY.absoluteMaxIterations,
    "Default iterations must be <= absolute ceiling"
  );
  assert.equal(DEFAULT_ORCHESTRATION_POLICY.specialistTimeoutMs, 4000);
  assert.equal(DEFAULT_ORCHESTRATION_POLICY.totalExecutionTimeoutMs, 15000);
});

test("Phase 1: Epistemic separation enforces confidence on estimates and provenance on facts", () => {
  const fact: FactRecord<{ dueDate: string }> = {
    id: "fact_1",
    category: "Fact",
    source: "Kernel",
    timestamp: Date.now(),
    payload: { dueDate: "2026-09-15" },
    provenance: "MongoDB",
  };
  assert.equal(fact.category, "Fact");
  assert.equal(fact.provenance, "MongoDB");

  const estimate: EstimateRecord<{ stressLevel: number }> = {
    id: "est_1",
    category: "Estimate",
    source: "Wellness",
    timestamp: Date.now(),
    payload: { stressLevel: 8 },
    confidence: 0.82,
    evidenceSources: ["sleep_deficit", "task_postponement_rate"],
  };
  assert.equal(estimate.category, "Estimate");
  assert.ok(estimate.confidence >= 0 && estimate.confidence <= 1);
});

test("Phase 1: ActionProposal requires reversibility classification and idempotencyKey", () => {
  const proposal: ActionProposal<{ taskId: string; newDate: string }> = {
    id: "prop_1",
    domain: "productivity",
    actionType: "reschedule_task",
    targetEntityId: "task_123",
    payload: { taskId: "task_123", newDate: "2026-09-16" },
    rationale: "Mitigate evening workload clash with high workout demand",
    reversibility: "reversible_with_compensation",
    idempotencyKey: "hash_test_12345",
  };
  assert.equal(proposal.domain, "productivity");
  assert.equal(proposal.reversibility, "reversible_with_compensation");
  assert.ok(proposal.idempotencyKey.length > 0);
});

test("Phase 1: MentalStateEvidence enforces category and confidence provenance", () => {
  const evidence: MentalStateEvidence = {
    category: "passive_sleep",
    source: "Oura/DailyLog",
    timestamp: Date.now(),
    rawSignal: { sleepHours: 4.5, remPercentage: 12 },
    confidence: 0.95,
  };
  assert.equal(evidence.category, "passive_sleep");
  assert.equal(evidence.confidence, 0.95);
});
