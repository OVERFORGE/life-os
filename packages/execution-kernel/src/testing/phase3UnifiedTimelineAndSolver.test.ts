import { test } from "node:test";
import assert from "node:assert/strict";
import { ScheduleSolver } from "../temporal/solver/ScheduleSolver";
import { TemporalTimelineEngine } from "../temporal/projection/TemporalTimelineEngine";
import {
  TemporalOccurrence,
  ExecutionChronicleEntry,
  StructuredLocationContext,
} from "../temporal/contracts/TemporalContracts";
import { normalizeTemporalInterval } from "../temporal/normalization/temporalNormalizer";
import {
  ScheduleOccurrenceAdapter,
  RescheduleOccurrenceAdapter,
  CancelOccurrenceAdapter,
} from "../temporal/adapters/TemporalActionAdapters";
import { ActionProposal } from "../orchestration/contracts/ActionProposalContracts";

const TEST_DATE = "2026-09-22";

test("Phase 3: ScheduleSolver - Mandatory Transition Buffers (Guardrail 6)", () => {
  const solver = ScheduleSolver.getInstance();

  const homeLoc: StructuredLocationContext = { category: "HOME", requiresPhysicalTransit: false };
  const gymLoc: StructuredLocationContext = { category: "GYM", label: "Downtown Gym", requiresPhysicalTransit: true };
  const workLoc: StructuredLocationContext = { category: "WORK_SITE", label: "Office Tower", requiresPhysicalTransit: true };
  const virtualLoc: StructuredLocationContext = { category: "VIRTUAL", requiresPhysicalTransit: false };

  // Case 1: HOME -> HOME => 0 buffer
  assert.equal(solver.computeTransitionBufferMinutes(homeLoc, homeLoc), 0, "HOME to HOME requires 0 buffer");

  // Case 2: VIRTUAL -> VIRTUAL => 0 buffer
  assert.equal(solver.computeTransitionBufferMinutes(virtualLoc, virtualLoc), 0, "VIRTUAL to VIRTUAL requires 0 buffer");

  // Case 3: HOME -> VIRTUAL => 0 buffer
  assert.equal(solver.computeTransitionBufferMinutes(homeLoc, virtualLoc), 0, "HOME to VIRTUAL requires 0 buffer");

  // Case 4: HOME -> GYM (different physical locations) => 20 buffer
  assert.equal(solver.computeTransitionBufferMinutes(homeLoc, gymLoc), 20, "HOME to GYM requires physical transition buffer");

  // Case 5: GYM -> WORK_SITE => 20 buffer
  assert.equal(solver.computeTransitionBufferMinutes(gymLoc, workLoc), 20, "GYM to WORK_SITE requires physical commute buffer");
});

test("Phase 3: ScheduleSolver - Collision Detection & Local Schedule Repair", () => {
  const solver = ScheduleSolver.getInstance();

  // Existing anchor block: Team Standup 10:00 to 11:00 (start: 600, end: 660) at Office Tower
  const officeLoc: StructuredLocationContext = { category: "WORK_SITE", label: "Office Tower", requiresPhysicalTransit: true };
  const existingBlock: TemporalOccurrence = {
    occurrenceId: "occ_standup_101",
    userId: "usr_solver_test",
    title: "Team Standup",
    kind: "HARD_EVENT",
    dateOnly: TEST_DATE,
    plannedInterval: normalizeTemporalInterval({
      dateOnly: TEST_DATE,
      startMinute: 600,
      durationMinutes: 60,
    }).interval!,
    locationContext: officeLoc,
    rigidity: "UNMOVABLE",
    status: "SCHEDULED",
    version: 1,
    overrideType: "NONE",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 1. Placement with collision and repair disabled: should fail
  const directCollision = solver.solvePlacement({
    dateOnly: TEST_DATE,
    idealStartMinute: 615, // 10:15 (collides with 10:00 - 11:00)
    durationMinutes: 45,
    locationContext: officeLoc,
    existingOccurrences: [existingBlock],
    allowLocalRepair: false,
  });

  assert.equal(directCollision.feasible, false, "Must detect direct collision");
  assert.ok(directCollision.reason?.includes("Collides with"), "Reason must cite collision");

  // 2. Placement with collision and local repair enabled: should find closest feasible slot
  const repairedPlacement = solver.solvePlacement({
    dateOnly: TEST_DATE,
    idealStartMinute: 615, // 10:15
    durationMinutes: 45,
    locationContext: officeLoc,
    existingOccurrences: [existingBlock],
    allowLocalRepair: true,
  });

  assert.equal(repairedPlacement.feasible, true, "Local repair must find feasible slot");
  assert.equal(repairedPlacement.repairAttempted, true, "Repair attempted must be true");
  const slot = repairedPlacement.selectedSlot!;
  assert.ok(
    slot.startMinute >= 660 || slot.endMinute <= 600,
    "Repaired slot must not overlap with standup (10:00 - 11:00)"
  );
  assert.ok(slot.suitabilityScore > 0, "Repaired slot must have positive suitability score");
});

test("Phase 3: ScheduleSolver - Deterministic Replay (Guardrail 15)", () => {
  const solver = ScheduleSolver.getInstance();
  const officeLoc: StructuredLocationContext = { category: "WORK_SITE", label: "Office", requiresPhysicalTransit: true };

  const existingBlock: TemporalOccurrence = {
    occurrenceId: "occ_fixed_01",
    userId: "usr_replay",
    title: "Client Meeting",
    kind: "HARD_EVENT",
    dateOnly: TEST_DATE,
    plannedInterval: normalizeTemporalInterval({
      dateOnly: TEST_DATE,
      startMinute: 840, // 14:00
      durationMinutes: 90,
    }).interval!,
    locationContext: officeLoc,
    rigidity: "UNMOVABLE",
    status: "SCHEDULED",
    version: 1,
    overrideType: "NONE",
    createdAt: 1000,
    updatedAt: 1000,
  };

  const req = {
    dateOnly: TEST_DATE,
    idealStartMinute: 870, // 14:30 (collides)
    durationMinutes: 60,
    locationContext: officeLoc,
    existingOccurrences: [existingBlock],
    allowLocalRepair: true,
  };

  // Replay test: execute 5 times in a row, all outputs must be byte-for-byte identical
  const run1 = solver.solvePlacement(req);
  const run2 = solver.solvePlacement(req);
  const run3 = solver.solvePlacement(req);

  assert.equal(run1.selectedSlot?.startMinute, run2.selectedSlot?.startMinute);
  assert.equal(run2.selectedSlot?.startMinute, run3.selectedSlot?.startMinute);
  assert.equal(run1.selectedSlot?.suitabilityScore, run2.selectedSlot?.suitabilityScore);
});

test("Phase 3: TemporalTimelineEngine - Planned vs Actual Projection (Guardrail 11)", () => {
  const engine = TemporalTimelineEngine.getInstance();
  const userId = "usr_timeline_test";

  // Planned occurrence: 09:00 - 10:30 (90 minutes) Deep Work
  const occ1: TemporalOccurrence = {
    occurrenceId: "occ_deep_work_01",
    userId,
    title: "Deep Work Sprint",
    kind: "WORK_SESSION",
    dateOnly: TEST_DATE,
    plannedInterval: normalizeTemporalInterval({
      dateOnly: TEST_DATE,
      startMinute: 540,
      durationMinutes: 90,
    }).interval!,
    locationContext: { category: "HOME", requiresPhysicalTransit: false },
    rigidity: "ELASTIC",
    status: "SCHEDULED",
    version: 1,
    overrideType: "NONE",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Actual chronicle: Executed 09:00 - 11:00 (120 minutes) => OVERRUN by 30 minutes
  const chronStartMs = new Date(`${TEST_DATE}T09:00:00Z`).getTime();
  const chronEndMs = chronStartMs + 120 * 60 * 1000;
  const chron1: ExecutionChronicleEntry = {
    chronicleId: "chron_actual_01",
    userId,
    occurrenceId: "occ_deep_work_01",
    entityType: "task",
    title: "Deep Work Sprint",
    startedAtMs: chronStartMs,
    endedAtMs: chronEndMs,
    durationMinutes: 120,
    interruptionsCount: 0,
    source: "web_manual",
    createdAt: chronEndMs,
  };

  // Ad-hoc unprompted session: 13:00 - 13:45 (45 minutes)
  const adHocStartMs = new Date(`${TEST_DATE}T13:00:00Z`).getTime();
  const adHocEndMs = adHocStartMs + 45 * 60 * 1000;
  const chronAdHoc: ExecutionChronicleEntry = {
    chronicleId: "chron_adhoc_02",
    userId,
    entityType: "general",
    title: "Spontaneous bug triage",
    startedAtMs: adHocStartMs,
    endedAtMs: adHocEndMs,
    durationMinutes: 45,
    interruptionsCount: 1,
    source: "web_manual",
    createdAt: adHocEndMs,
  };

  const projection = engine.projectDayTimeline(
    userId,
    TEST_DATE,
    [occ1],
    [chron1, chronAdHoc],
    "UTC"
  );

  assert.equal(projection.userId, userId);
  assert.equal(projection.dateOnly, TEST_DATE);
  assert.equal(projection.blocks.length, 2, "Must project 2 blocks: 1 matched planned block + 1 ad-hoc block");

  // Invariant 11: Planned interval was 90 minutes; actual was 120 minutes; planned is PRESERVED!
  const block1 = projection.blocks.find((b) => b.occurrenceId === "occ_deep_work_01")!;
  assert.ok(block1, "Must find block for occurrence 1");
  assert.equal(block1.planned?.durationMinutes, 90, "Planned duration must remain 90 minutes");
  assert.equal(block1.actual?.durationMinutes, 120, "Actual duration must be 120 minutes");
  assert.equal(block1.variance.status, "OVERRUN", "Variance status must be OVERRUN");
  assert.equal(block1.variance.durationDeltaMinutes, 30, "Delta must be +30 minutes");

  // Check ad-hoc block
  const adHocBlock = projection.blocks.find((b) => b.chronicleId === "chron_adhoc_02")!;
  assert.ok(adHocBlock, "Must find ad-hoc block");
  assert.equal(adHocBlock.variance.status, "UNPLANNED_EXECUTION");
  assert.equal(adHocBlock.planned, undefined, "Ad-hoc block has no planned interval");
  assert.equal(adHocBlock.actual?.durationMinutes, 45);

  // Summary statistics
  assert.equal(projection.summary.totalPlannedMinutes, 90);
  assert.equal(projection.summary.totalActualMinutes, 165); // 120 + 45
  assert.equal(projection.summary.completedOccurrencesCount, 1);
  assert.equal(projection.summary.adHocSessionsCount, 1);
});

test("Phase 3: Action Adapters & Compensating Sagas", async () => {
  const scheduleAdapter = new ScheduleOccurrenceAdapter();

  const proposal: ActionProposal = {
    id: "prop_test_occ_01",
    domain: "productivity",
    actionType: "schedule_occurrence",
    payload: {
      title: "Core Architecture Review",
      dateOnly: TEST_DATE,
      startTime: "15:00",
      durationMinutes: 60,
      locationCategory: "HOME",
    },
    rationale: "Review RoutineAI architecture",
    reversibility: "atomic_single_doc",
    idempotencyKey: "idemp_test_occ_01",
  };

  // 1. Precondition validation
  const preCheck = await scheduleAdapter.validatePreconditions(proposal, "usr_adapter_test");
  assert.equal(preCheck.valid, true, "Preconditions must be valid");

  // 2. Execution
  const execResult = await scheduleAdapter.execute(proposal, "usr_adapter_test");
  assert.equal(execResult.success, true);
  assert.ok(execResult.occurrenceId.startsWith("occ_adhoc_"));
  assert.equal(execResult.plannedInterval.startMinute, 900);
  assert.equal(execResult.plannedInterval.durationMinutes, 60);

  // 3. Compensation saga (rollback)
  const compResult = await scheduleAdapter.compensate(proposal, execResult, "usr_adapter_test");
  assert.equal(compResult.compensated, true, "Compensation must succeed cleanly");
});
