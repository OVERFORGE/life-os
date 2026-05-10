import { generateCandidateSchedules } from "./server/planner/scheduling/generateCandidateSchedules";
import { validateCandidateSchedule } from "./server/planner/validation/validateCandidateSchedule";
import { computeScheduleStability } from "./server/planner/scheduling/computeScheduleStability";
import { normalizeTaskForScheduling } from "./server/planner/normalization/normalizeTaskForScheduling";
import { createTemporalWindow, temporalWindowsIntersect } from "./server/planner/utils/TemporalWindow";
import { PlacementAnalysisContext, SchedulableTask } from "./server/planner/types/SchedulingTypes";

// ─── Assertion Utilities ──────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}`);
  }
}

function assertApprox(name: string, actual: number, expected: number, epsilon = 0.01) {
  assert(name, Math.abs(actual - expected) <= epsilon);
}

// ─── Shared Fixtures ─────────────────────────────────────────────────────────

const defaultContext: PlacementAnalysisContext = {
  availabilityWindows: [
    { window: createTemporalWindow(480, 720), daysOfWeek: [1], score: 0.9, confidence: 0.9 },  // 08:00–12:00
    { window: createTemporalWindow(780, 1020), daysOfWeek: [1], score: 0.8, confidence: 0.9 }, // 13:00–17:00
  ],
  recurringConstraints: [],
  recoveryWindows: [],
  peakFocusWindows: [
    { window: createTemporalWindow(540, 660), score: 1.0, confidence: 0.9 },  // 09:00–11:00
  ],
  sleepWindow: { window: createTemporalWindow(1380, 360), confidence: 0.9 },  // 23:00–06:00
  chronotype: { type: "morning", confidence: 0.8 },
  fragmentationScore: 0.2,
  dataReliabilityScore: 0.85,
};

function makeTask(
  id: string,
  durationMinutes: number,
  priority: number = 3,
  urgency: number = 0.5,
  requiresDeepWork: boolean = false
): SchedulableTask {
  return normalizeTaskForScheduling({
    id,
    title: `Task ${id}`,
    priority,
    metadata: {
      estimatedDuration: durationMinutes,
      urgency,
      requiresDeepWork,
    },
  });
}

console.log("══════════════════════════════════════════════════════");
console.log("LIFEOS — PHASE 2B: CANDIDATE SCHEDULE GENERATION TESTS");
console.log("══════════════════════════════════════════════════════");

// ─── 1. Basic Generation ─────────────────────────────────────────────────────
console.log("\n[1. Basic Generation]");

const tasks = [
  makeTask("t1", 60, 3, 0.5),
  makeTask("t2", 45, 4, 0.7),
  makeTask("t3", 30, 2, 0.3),
];

const schedules = generateCandidateSchedules(tasks, defaultContext);
assert("generates at least 1 schedule", schedules.length >= 1);
assert("generates at most 3 schedule variants", schedules.length <= 3);
assert("schedules are sorted by scheduleScore DESC", schedules[0].scheduleScore >= schedules[schedules.length - 1].scheduleScore);

for (const s of schedules) {
  assert(`schedule '${s.scheduleId}' has non-empty reasoning`, s.reasoning.length > 0);
  assert(`schedule '${s.scheduleId}' has valid coverageRatio`, s.coverageRatio >= 0 && s.coverageRatio <= 1);
  assert(`schedule '${s.scheduleId}' has finite scheduleScore`, Number.isFinite(s.scheduleScore));
  assert(`schedule '${s.scheduleId}' has finite confidence`, Number.isFinite(s.confidence));
}

// ─── 2. No-Overlap Invariant ─────────────────────────────────────────────────
console.log("\n[2. No-Overlap Invariant]");

for (const schedule of schedules) {
  const placements = schedule.scheduledPlacements;
  let overlapping = false;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (temporalWindowsIntersect(
        placements[i].placement.temporalWindow,
        placements[j].placement.temporalWindow
      )) {
        overlapping = true;
        console.error(`  ❌ Overlap detected between task '${placements[i].task.id}' and '${placements[j].task.id}' in schedule '${schedule.scheduleId}'`);
      }
    }
  }
  assert(`no overlapping placements in '${schedule.scheduleId}'`, !overlapping);
}

// ─── 3. Coverage Ratio Correctness ──────────────────────────────────────────
console.log("\n[3. Coverage Ratio Correctness]");

for (const schedule of schedules) {
  const total = schedule.scheduledPlacements.length + schedule.unscheduledTaskIds.length;
  const expected = total > 0 ? schedule.scheduledPlacements.length / total : 0;
  assertApprox(
    `coverage ratio is correct for '${schedule.scheduleId}'`,
    schedule.coverageRatio,
    expected,
    0.001
  );
}

// ─── 4. Priority Arbitration ─────────────────────────────────────────────────
console.log("\n[4. Priority Arbitration]");

// Create two tasks that must compete — same large duration but different urgency
const urgentTask = makeTask("urgent", 120, 5, 0.95, true);
const lowPriorityTask = makeTask("low", 120, 1, 0.1, false);

// Single narrow window — only one task can fit
const narrowContext: PlacementAnalysisContext = {
  ...defaultContext,
  availabilityWindows: [
    { window: createTemporalWindow(540, 660), daysOfWeek: [1], score: 0.9, confidence: 0.9 }
  ],
};

const arbitrationSchedules = generateCandidateSchedules([urgentTask, lowPriorityTask], narrowContext);
assert("generates schedules when tasks compete", arbitrationSchedules.length >= 1);

for (const s of arbitrationSchedules) {
  const hasUrgent = s.scheduledPlacements.some(sp => sp.task.id === "urgent");
  const hasLow = s.scheduledPlacements.some(sp => sp.task.id === "low");
  // Both can't be in the schedule — only one fits
  assert(
    `only one task placed in narrow window (${s.scheduleId})`,
    !(hasUrgent && hasLow)
  );
  if (hasLow && !hasUrgent) {
    // Low priority task was placed and urgent wasn't — this is a valid scenario
    // when urgency_first or priority_first seeds, urgent wins
    // We just assert the schedule is topologically valid
  }
}

// In urgency_first strategy, urgent task should win
const urgencyFirstSchedule = arbitrationSchedules.find(s => s.seedStrategy === "urgency_first");
if (urgencyFirstSchedule) {
  const urgentPlaced = urgencyFirstSchedule.scheduledPlacements.some(sp => sp.task.id === "urgent");
  const lowUnscheduled = urgencyFirstSchedule.unscheduledTaskIds.includes("low");
  assert("urgency_first: urgent task placed over low priority", urgentPlaced);
  assert("urgency_first: low priority task deferred", lowUnscheduled);
}

// ─── 5. Unschedulable Task Handling ─────────────────────────────────────────
console.log("\n[5. Unschedulable Task Handling]");

// A task requiring 480 minutes in a 60-minute window — cannot be placed
const hugeTask = makeTask("huge", 480, 5, 1.0);

const tinyContext: PlacementAnalysisContext = {
  ...defaultContext,
  availabilityWindows: [
    { window: createTemporalWindow(600, 660), daysOfWeek: [1], score: 0.9, confidence: 0.9 }
  ],
};

const withUnschedulable = generateCandidateSchedules([hugeTask], tinyContext);
assert("generates schedules even when tasks are unschedulable", withUnschedulable.length >= 1);
for (const s of withUnschedulable) {
  assert(`unschedulable task appears in unscheduledTaskIds (${s.scheduleId})`,
    s.unscheduledTaskIds.includes("huge")
  );
  assert(`unschedulable task not in scheduledPlacements (${s.scheduleId})`,
    !s.scheduledPlacements.some(sp => sp.task.id === "huge")
  );
  assertApprox(`coverageRatio is 0 for fully unschedulable set (${s.scheduleId})`, s.coverageRatio, 0, 0.001);
}

// ─── 6. Determinism Invariant ────────────────────────────────────────────────
console.log("\n[6. Determinism Invariant]");

const dTasks = [
  makeTask("d1", 60, 3, 0.5),
  makeTask("d2", 45, 4, 0.7),
  makeTask("d3", 30, 2, 0.3),
];

const run1 = generateCandidateSchedules(dTasks, defaultContext);
const run2 = generateCandidateSchedules(dTasks, defaultContext);

assert("same number of schedules on repeated run", run1.length === run2.length);
for (let i = 0; i < run1.length; i++) {
  assert(
    `schedule[${i}] has same scheduleId on repeated run`,
    run1[i].scheduleId === run2[i].scheduleId
  );
  assert(
    `schedule[${i}] has same scheduleScore on repeated run`,
    run1[i].scheduleScore === run2[i].scheduleScore
  );
  assert(
    `schedule[${i}] has same number of placements on repeated run`,
    run1[i].scheduledPlacements.length === run2[i].scheduledPlacements.length
  );
  assert(
    `schedule[${i}] has same seedStrategy on repeated run`,
    run1[i].seedStrategy === run2[i].seedStrategy
  );
}

// ─── 7. Schedule Validation ──────────────────────────────────────────────────
console.log("\n[7. Schedule Validation]");

for (const schedule of schedules) {
  const validation = validateCandidateSchedule(schedule, defaultContext);
  assert(`schedule '${schedule.scheduleId}' passes structural validation`, validation.valid);
}

// Inject an overlapping schedule and verify it's rejected
const placedTaskA = makeTask("va", 60, 3, 0.5);
const placedTaskB = makeTask("vb", 60, 4, 0.7);
const badSchedule: any = {
  scheduleId: "bad_overlap_schedule",
  scheduledPlacements: [
    { task: placedTaskA, placement: { ...schedules[0]?.scheduledPlacements[0]?.placement, temporalWindow: createTemporalWindow(600, 660), taskId: "va", reasoning: ["valid_fallback_placement"], penaltiesApplied: [], boostsApplied: [], blockingReasons: [], placementScore: 0.7, confidence: 0.8, stabilityScore: 0.8, placementType: "optimal", dayOfWeek: 1, metadata: { focusAlignment: 0, recoveryConflict: 0, fragmentationRisk: 0, chronotypeAlignment: 0, deepWorkScore: 0 } } },
    { task: placedTaskB, placement: { ...schedules[0]?.scheduledPlacements[0]?.placement, temporalWindow: createTemporalWindow(620, 680), taskId: "vb", reasoning: ["valid_fallback_placement"], penaltiesApplied: [], boostsApplied: [], blockingReasons: [], placementScore: 0.7, confidence: 0.8, stabilityScore: 0.8, placementType: "optimal", dayOfWeek: 1, metadata: { focusAlignment: 0, recoveryConflict: 0, fragmentationRisk: 0, chronotypeAlignment: 0, deepWorkScore: 0 } } },
  ],
  unscheduledTaskIds: [],
  conflicts: [],
  scheduleScore: 0.8,
  stabilityScore: 0.8,
  focusScore: 0.5,
  fragmentationScore: 0.2,
  recoverySafetyScore: 0.9,
  coverageRatio: 1.0,
  confidence: 0.85,
  seedStrategy: "urgency_first",
  reasoning: ["bad_overlap"],
  penaltiesApplied: [],
  boostsApplied: [],
};
const badValidation = validateCandidateSchedule(badSchedule, defaultContext);
assert("overlapping schedule is rejected by validation", !badValidation.valid);
assert("correct error code for overlap", badValidation.errors.some(e => e.code === "OVERLAPPING_SCHEDULED_PLACEMENTS"));

// ─── 8. Stability Scoring ────────────────────────────────────────────────────
console.log("\n[8. Stability Scoring]");

// Empty schedule is maximally stable
const emptyStability = computeScheduleStability([], defaultContext);
assertApprox("empty schedule has stability=1.0", emptyStability.stabilityScore, 1.0, 0.001);

// Deep-work task after low-energy task should trigger sequencing penalty
const deepWorkTask = makeTask("dw", 60, 4, 0.8, true);
const lowEnergyTask = makeTask("le", 30, 2, 0.2, false);
const suboptimalPlacements: any = [
  {
    task: lowEnergyTask,
    placement: { temporalWindow: createTemporalWindow(480, 510) }
  },
  {
    task: deepWorkTask,
    placement: { temporalWindow: createTemporalWindow(540, 600) }
  },
];
const suboptimalStability = computeScheduleStability(suboptimalPlacements, defaultContext);
assert("suboptimal sequencing penalized", suboptimalStability.penalties.includes("suboptimal_cognitive_sequencing"));
assert("suboptimal sequencing reduces stability below 1.0", suboptimalStability.stabilityScore < 1.0);

// Optimal: deep work first, then low energy
const optimalPlacements: any = [
  {
    task: deepWorkTask,
    placement: { temporalWindow: createTemporalWindow(480, 540) }
  },
  {
    task: lowEnergyTask,
    placement: { temporalWindow: createTemporalWindow(600, 630) }
  },
];
const optimalStability = computeScheduleStability(optimalPlacements, defaultContext);
assert("optimal sequencing scores higher than suboptimal", optimalStability.stabilityScore > suboptimalStability.stabilityScore);

// ─── 9. Empty Task List ──────────────────────────────────────────────────────
console.log("\n[9. Edge Cases]");

const emptySchedules = generateCandidateSchedules([], defaultContext);
assert("empty task list produces empty schedule list", emptySchedules.length === 0);

// Single task
const singleSchedules = generateCandidateSchedules([makeTask("solo", 30, 3, 0.5)], defaultContext);
assert("single task generates at least 1 schedule", singleSchedules.length >= 1);
for (const s of singleSchedules) {
  assert(`single task schedule has ≤1 placement (${s.seedStrategy})`,
    s.scheduledPlacements.length <= 1
  );
}

// ─── 10. Randomized No-Overlap Invariant ────────────────────────────────────
console.log("\n[10. Randomized Topology Invariants (50 cases)]");

function rng(min: number, max: number): number {
  // Deterministic LCG seeded by loop counter
  return min + Math.floor(((min * 1103515245 + max * 12345) & 0x7fffffff) % (max - min + 1));
}

let propPassed = 0;
let propFailed = 0;

for (let i = 0; i < 50; i++) {
  const numTasks = 2 + (i % 4); // 2–5 tasks
  const tasks: SchedulableTask[] = [];
  for (let j = 0; j < numTasks; j++) {
    const dur = 15 + ((i * j + j * 7 + 13) % 6) * 15; // 15, 30, 45, 60, 75, 90
    const pri = 1 + (i + j) % 5;
    tasks.push(makeTask(`rand_${i}_${j}`, dur, pri, 0.3 + ((i * j) % 7) * 0.1));
  }

  const randSchedules = generateCandidateSchedules(tasks, defaultContext);

  for (const s of randSchedules) {
    // Invariant 1: no overlapping placements
    const ps = s.scheduledPlacements;
    let hasOverlap = false;
    for (let a = 0; a < ps.length; a++) {
      for (let b = a + 1; b < ps.length; b++) {
        if (temporalWindowsIntersect(ps[a].placement.temporalWindow, ps[b].placement.temporalWindow)) {
          hasOverlap = true;
        }
      }
    }
    if (hasOverlap) { propFailed++; console.error(`  ❌ Overlap in random case ${i}`); }
    else propPassed++;

    // Invariant 2: all scores finite and in [0,1]
    const scoreValid = [s.scheduleScore, s.stabilityScore, s.focusScore, s.fragmentationScore, s.recoverySafetyScore, s.coverageRatio, s.confidence]
      .every(v => Number.isFinite(v) && v >= 0 && v <= 1);
    if (!scoreValid) { propFailed++; console.error(`  ❌ Invalid score in random case ${i}`); }
    else propPassed++;

    // Invariant 3: reasoning non-empty
    if (s.reasoning.length === 0) { propFailed++; console.error(`  ❌ Empty reasoning in case ${i}`); }
    else propPassed++;

    // Invariant 4: validation passes
    const v = validateCandidateSchedule(s, defaultContext);
    if (!v.valid) { propFailed++; console.error(`  ❌ Validation failed in case ${i}: ${v.errors.map(e => e.code).join(", ")}`); }
    else propPassed++;
  }
}

console.log(`  ✅ Random: ${propPassed} checks passed, ❌ ${propFailed} failures`);
passed += propPassed;
failed += propFailed;

// ─── Final Results ────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(55)}`);
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES DETECTED in Phase 2B Schedule Generator.");
  process.exit(1);
} else {
  console.log("✅ All Phase 2B invariants satisfied.");
}
