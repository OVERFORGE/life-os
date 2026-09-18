import test from "node:test";
import assert from "node:assert/strict";
import { SynthesisEngine } from "../orchestration/synthesis/SynthesisEngine";
import { PolicyTier } from "../orchestration/synthesis/ConflictResolutionPolicy";
import { SpecialistOutput } from "../orchestration/contracts/AgentContracts";
import { ActionProposal } from "../orchestration/contracts/ActionProposalContracts";

test("Phase 9 (TC-04): SynthesisEngine resolves Recovery vs Workload conflict prioritizing Tier 1 over Tier 5", () => {
  const engine = new SynthesisEngine();

  // Productivity proposes heavy urgent priority task adjustment
  const productivityProposal: ActionProposal = {
    id: "act_prod_1",
    domain: "productivity",
    actionType: "adjust_task_priority",
    targetEntityId: "task_heavy_1",
    payload: { taskId: "task_heavy_1", priority: "urgent" },
    rationale: "4-hour deep focus block required to complete critical path project",
    reversibility: "reversible_with_compensation",
    idempotencyKey: "key_prod_1",
  };

  // Wellness proposes physiological recovery constraint due to severe fatigue
  const wellnessProposal: ActionProposal = {
    id: "act_well_1",
    domain: "wellness",
    actionType: "apply_recovery_constraint",
    payload: { maxFocusMinutes: 30, mandatoryRestWindow: true },
    rationale: "Severe physiological deficit; risk of burnout",
    reversibility: "atomic_single_doc",
    idempotencyKey: "key_well_1",
  };

  const specialistOutputs: SpecialistOutput[] = [
    {
      domain: "productivity",
      summary: "High workload pressure, recommends urgent focus block.",
      observations: [{ id: "obs_1", category: "Observation", source: "Productivity", timestamp: Date.now(), observedAt: Date.now(), payload: "3 deadlines" }],
      estimates: [],
      hypotheses: [],
      proposals: [productivityProposal],
      confidence: 0.85,
    },
    {
      domain: "wellness",
      summary: "Physiological deficit detected; mandatory rest needed.",
      observations: [],
      estimates: [{ id: "est_1", category: "Estimate", source: "Wellness", timestamp: Date.now(), confidence: 0.9, evidenceSources: ["sleep_debt"], payload: "High fatigue" }],
      hypotheses: [],
      proposals: [wellnessProposal],
      confidence: 0.92,
    },
  ];

  const synthesis = engine.synthesize(specialistOutputs, "Help me plan my day, I am exhausted");

  // Invariant 1: Conflict was detected and recorded
  assert.equal(synthesis.conflicts.length, 1);
  const conflict = synthesis.conflicts[0];
  assert.equal(conflict.dominantTier, PolicyTier.TIER_1_SAFETY_AND_RECOVERY);
  assert.ok(conflict.resolutionRationale.includes("Tier 1"));

  // Invariant 2: Tier 1 (Wellness recovery) was accepted, Tier 5 (Productivity heavy block) was suppressed
  assert.ok(conflict.acceptedProposals.some((p) => p.id === "act_well_1"));
  assert.ok(conflict.suppressedProposals.some((p) => p.id === "act_prod_1"));

  // Invariant 3: Approved proposals in synthesis reflect the resolution
  assert.ok(synthesis.approvedProposals.some((p) => p.id === "act_well_1"));
  assert.equal(synthesis.approvedProposals.some((p) => p.id === "act_prod_1"), false);

  // Invariant 4: Epistemic records combined
  assert.equal(synthesis.combinedObservations.length, 1);
  assert.equal(synthesis.combinedEstimates.length, 1);
});

test("Phase 9: Non-conflicting proposals across domains are fully merged without suppression", () => {
  const engine = new SynthesisEngine();

  const specialistOutputs: SpecialistOutput[] = [
    {
      domain: "productivity",
      summary: "Task backlog is light.",
      observations: [],
      estimates: [],
      hypotheses: [],
      proposals: [
        {
          id: "act_p1",
          domain: "productivity",
          actionType: "complete_task",
          targetEntityId: "t1",
          payload: { taskId: "t1" },
          rationale: "Done",
          reversibility: "reversible_with_compensation",
          idempotencyKey: "k1",
        },
      ],
      confidence: 0.9,
    },
    {
      domain: "health",
      summary: "Good day for a workout.",
      observations: [],
      estimates: [],
      hypotheses: [],
      proposals: [
        {
          id: "act_h1",
          domain: "health",
          actionType: "log_workout",
          payload: { type: "running" },
          rationale: "Cardio",
          reversibility: "atomic_single_doc",
          idempotencyKey: "k2",
        },
      ],
      confidence: 0.9,
    },
  ];

  const synthesis = engine.synthesize(specialistOutputs, "What should I do?");
  assert.equal(synthesis.conflicts.length, 0);
  assert.equal(synthesis.approvedProposals.length, 2);
});
