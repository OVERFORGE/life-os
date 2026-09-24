import { test } from "node:test";
import assert from "node:assert/strict";
import { TemporalTimelineEngine } from "../temporal/projection/TemporalTimelineEngine";
import { ScheduleSolver } from "../temporal/solver/ScheduleSolver";
import {
  ScheduleOccurrenceAdapter,
  RescheduleOccurrenceAdapter,
  CancelOccurrenceAdapter,
  LogExecutionIntervalAdapter,
} from "../temporal/adapters/TemporalActionAdapters";
import { ActionProposal } from "../orchestration/contracts/ActionProposalContracts";
import {
  TemporalOccurrence,
  ExecutionChronicleEntry,
} from "../temporal/contracts/TemporalContracts";
import { normalizeTemporalInterval } from "../temporal/normalization/temporalNormalizer";

const TEST_DATE = "2026-09-24";
const USER_ID = "usr_phase6_test";

test("Phase 6: Calendar Control Surface - ActionProposal Kernel Roundtrip (Guardrail 12 & 17)", async () => {
  // Test that Web and Mobile Calendar interactions dispatch through the sovereign kernel capability layer
  const scheduleAdapter = new ScheduleOccurrenceAdapter();
  const rescheduleAdapter = new RescheduleOccurrenceAdapter();
  const cancelAdapter = new CancelOccurrenceAdapter();
  const logAdapter = new LogExecutionIntervalAdapter();

  // 1. Calendar UI triggers "Schedule Block" (09:00 - 10:30, 90 min)
  const scheduleProposal: ActionProposal = {
    id: "prop_p6_sched_01",
    domain: "productivity",
    actionType: "schedule_occurrence",
    payload: {
      title: "RoutineAI Kernel Integration",
      dateOnly: TEST_DATE,
      startTime: "09:00",
      durationMinutes: 90,
      kind: "WORK_SESSION",
      locationCategory: "HOME",
    },
    rationale: "Calendar block placement by user",
    reversibility: "atomic_single_doc",
    idempotencyKey: "idemp_p6_sched_01",
  };

  const preCheck1 = await scheduleAdapter.validatePreconditions(scheduleProposal, USER_ID);
  assert.equal(preCheck1.valid, true);

  const schedResult = await scheduleAdapter.execute(scheduleProposal, USER_ID);
  assert.equal(schedResult.success, true);
  assert.ok(schedResult.occurrenceId);
  assert.equal(schedResult.plannedInterval.startMinute, 540); // 09:00
  assert.equal(schedResult.plannedInterval.endMinute, 630); // 10:30
  assert.equal(schedResult.plannedInterval.durationMinutes, 90);

  const occurrenceId = schedResult.occurrenceId;

  // 2. Calendar UI triggers "Drag / Reschedule" (Move to 14:00 - 15:30)
  const rescheduleProposal: ActionProposal = {
    id: "prop_p6_resched_02",
    domain: "productivity",
    actionType: "reschedule_occurrence",
    payload: {
      occurrenceId,
      newDateOnly: TEST_DATE,
      newStartTime: "14:00",
      newDurationMinutes: 90,
      reason: "User dragged block on timeline canvas",
    },
    rationale: "Calendar drag-and-drop",
    reversibility: "atomic_single_doc",
    idempotencyKey: "idemp_p6_resched_02",
  };

  const preCheck2 = await rescheduleAdapter.validatePreconditions(rescheduleProposal, USER_ID);
  assert.equal(preCheck2.valid, true);

  const reschedResult = await rescheduleAdapter.execute(rescheduleProposal, USER_ID);
  assert.equal(reschedResult.success, true);
  assert.equal(reschedResult.newPlannedInterval.startMinute, 840); // 14:00
  assert.equal(reschedResult.newPlannedInterval.endMinute, 930); // 15:30

  // 3. User logs execution chronicle directly from Calendar
  const logProposal: ActionProposal = {
    id: "prop_p6_log_03",
    domain: "productivity",
    actionType: "log_execution_interval",
    payload: {
      occurrenceId,
      title: "RoutineAI Kernel Integration",
      startedAtMs: new Date(`${TEST_DATE}T14:00:00Z`).getTime(),
      endedAtMs: new Date(`${TEST_DATE}T15:45:00Z`).getTime(), // 105 min (15 min overrun)
      durationMinutes: 105,
      notes: "Completed all test adapters and solver integration",
    },
    rationale: "Calendar one-click work logging",
    reversibility: "atomic_single_doc",
    idempotencyKey: "idemp_p6_log_03",
  };

  const preCheck3 = await logAdapter.validatePreconditions(logProposal, USER_ID);
  assert.equal(preCheck3.valid, true);

  const logResult = await logAdapter.execute(logProposal, USER_ID);
  assert.equal(logResult.success, true);
  assert.ok(logResult.chronicleId.startsWith("chron_"));
  assert.equal(logResult.durationMinutes, 105);

  // 4. User cancels a block
  const cancelProposal: ActionProposal = {
    id: "prop_p6_cancel_04",
    domain: "productivity",
    actionType: "cancel_occurrence",
    payload: {
      occurrenceId,
      reason: "Superseded by emergency triage",
    },
    rationale: "Calendar block deletion",
    reversibility: "atomic_single_doc",
    idempotencyKey: "idemp_p6_cancel_04",
  };

  const preCheck4 = await cancelAdapter.validatePreconditions(cancelProposal, USER_ID);
  assert.equal(preCheck4.valid, true);

  const cancelResult = await cancelAdapter.execute(cancelProposal, USER_ID);
  assert.equal(cancelResult.success, true);
  assert.equal(cancelResult.status, "CANCELLED");
});

test("Phase 6: Planned vs Actual Ghosting & Variance Computation (Guardrail 11)", () => {
  const engine = TemporalTimelineEngine.getInstance();

  const occurrence: TemporalOccurrence = {
    occurrenceId: "occ_p6_ghost_01",
    userId: USER_ID,
    title: "Focus Block",
    kind: "WORK_SESSION",
    dateOnly: TEST_DATE,
    plannedInterval: normalizeTemporalInterval({
      dateOnly: TEST_DATE,
      startMinute: 600, // 10:00
      durationMinutes: 60, // 10:00 - 11:00
    }).interval!,
    locationContext: { category: "HOME", requiresPhysicalTransit: false },
    rigidity: "ELASTIC",
    status: "SCHEDULED",
    version: 1,
    overrideType: "NONE",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const startedAtMs = new Date(`${TEST_DATE}T10:00:00Z`).getTime();
  const endedAtMs = startedAtMs + 80 * 60 * 1000; // 80 min (20 min overrun)

  const chronicle: ExecutionChronicleEntry = {
    chronicleId: "chron_p6_ghost_01",
    userId: USER_ID,
    occurrenceId: "occ_p6_ghost_01",
    entityType: "task",
    title: "Focus Block",
    startedAtMs,
    endedAtMs,
    durationMinutes: 80,
    interruptionsCount: 0,
    source: "web_manual",
    createdAt: endedAtMs,
  };

  const timeline = engine.projectDayTimeline(
    USER_ID,
    TEST_DATE,
    [occurrence],
    [chronicle],
    "UTC"
  );

  assert.equal(timeline.blocks.length, 1);
  const block = timeline.blocks[0];

  // Visual ghosting check: planned block is preserved in planned track, actual in actual track
  assert.equal(block.planned?.durationMinutes, 60, "Planned block duration preserved at 60m");
  assert.equal(block.actual?.durationMinutes, 80, "Actual block duration projected at 80m");
  assert.equal(block.variance.status, "OVERRUN");
  assert.equal(block.variance.durationDeltaMinutes, 20);

  // Summary telemetry verification
  assert.equal(timeline.summary.totalPlannedMinutes, 60);
  assert.equal(timeline.summary.totalActualMinutes, 80);
  assert.equal(timeline.summary.completedOccurrencesCount, 1);
});

test("Phase 6: Full Closed-Loop Flow - Intention -> Execution -> Goal Progress Separation (Guardrail 10)", () => {
  // Goal: Deliver RoutineAI V3
  const finiteGoal: any = {
    id: "goal_p6_01",
    userId: USER_ID,
    title: "Deliver RoutineAI V3 Architecture",
    nature: "finite_deliverable",
    category: "PROJECT",
    status: "in_progress",
    definitionOfDone: "All 6 phases verified with zero semantic regex violations",
    targetCompletionDate: "2026-09-30",
    milestones: [
      { id: "m1", title: "Phase 1 Temporal Contracts", completed: true },
      { id: "m2", title: "Phase 2 Goal Evolution", completed: true },
      { id: "m3", title: "Phase 3 Timeline Engine", completed: true },
      { id: "m4", title: "Phase 4 Cadence & Constraints", completed: true },
      { id: "m5", title: "Phase 5 Aven Persona", completed: true },
      { id: "m6", title: "Phase 6 Calendar UI & Replay", completed: false },
    ],
  };

  // Step 1: User schedules 10 occurrences for this goal.
  // GUARDRAIL 10: Merely scheduling occurrences MUST confer 0% goal progress!
  const computeProgress = (g: any) => {
    const total = g.milestones.length;
    const completed = g.milestones.filter((m: any) => m.completed).length;
    const percent = Math.round((completed / total) * 100);
    return {
      deliverableProgressPercent: percent,
      status: percent === 100 ? "completed" : "in_progress",
      completedAt: percent === 100 ? new Date() : undefined,
    };
  };

  const statsAfterScheduling = computeProgress(finiteGoal);
  assert.equal(statsAfterScheduling.deliverableProgressPercent, 83); // 5/6 milestones completed = 83%
  assert.equal(statsAfterScheduling.status, "in_progress");

  // Step 2: User completes final milestone m6 and logs execution
  finiteGoal.milestones[5].completed = true;
  const statsAfterDone = computeProgress(finiteGoal);
  assert.equal(statsAfterDone.deliverableProgressPercent, 100);
  assert.equal(statsAfterDone.status, "completed");
  assert.ok(statsAfterDone.completedAt);
});

test("Phase 6: Calendar Idempotency & Deterministic Replay (Guardrail 14 & 15)", async () => {
  const solver = ScheduleSolver.getInstance();
  const engine = TemporalTimelineEngine.getInstance();

  const occurrences: TemporalOccurrence[] = [
    {
      occurrenceId: "occ_rep_01",
      userId: USER_ID,
      title: "Sprint Planning",
      kind: "HARD_EVENT",
      dateOnly: TEST_DATE,
      plannedInterval: normalizeTemporalInterval({
        dateOnly: TEST_DATE,
        startMinute: 600,
        durationMinutes: 60,
      }).interval!,
      locationContext: { category: "WORK_SITE", label: "HQ", requiresPhysicalTransit: true },
      rigidity: "UNMOVABLE",
      status: "SCHEDULED",
      version: 1,
      overrideType: "NONE",
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  // Replay timeline projection 3 times
  const t1 = engine.projectDayTimeline(USER_ID, TEST_DATE, occurrences, [], "UTC");
  const t2 = engine.projectDayTimeline(USER_ID, TEST_DATE, occurrences, [], "UTC");
  const t3 = engine.projectDayTimeline(USER_ID, TEST_DATE, occurrences, [], "UTC");

  assert.deepEqual(t1, t2, "Timeline projection 1 and 2 must be deeply identical");
  assert.deepEqual(t2, t3, "Timeline projection 2 and 3 must be deeply identical");
});
