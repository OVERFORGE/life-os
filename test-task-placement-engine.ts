import { 
  PlacementAnalysisContext, 
  RawTaskForScheduling 
} from "./server/planner/types/SchedulingTypes";
import {
  generateCandidatePlacements
} from "./server/planner/scheduling/generateCandidatePlacements";
import { normalizeTaskForScheduling } from "./server/planner/normalization/normalizeTaskForScheduling";
import { createTemporalWindow, temporalWindowContains } from "./server/planner/utils/TemporalWindow";
import { validateCandidatePlacement } from "./server/planner/validation/validateCandidatePlacement";

// --- Custom Assertion Utilities ---
let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, expected: boolean = true) {
  if (condition === expected) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}: expected ${expected}, got ${condition}`);
  }
}

function assertApprox(name: string, actual: number, expected: number, epsilon: number = 0.001) {
  if (Math.abs(actual - expected) <= epsilon) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}: expected ≈${expected}, got ${actual}`);
  }
}

console.log("======================================================");
console.log("LIFEOS - PHASE 2A: TASK PLACEMENT ENGINE TESTS");
console.log("======================================================");

// --- 1. Normalization Tests ---
console.log("\n[Normalization Layer]");
const rawTask1: RawTaskForScheduling = {
  id: "t1",
  title: "Read Book",
  metadata: {
    estimatedDuration: 10,
    minimumChunkSize: undefined
  }
};
const norm1 = normalizeTaskForScheduling(rawTask1);
assert("duration fallback applied", norm1.estimatedDurationMinutes === 10);
assert("minimum chunk size fallback (microtask) correctly min(duration, 15)", norm1.minimumChunkSize === 10);

const rawTask2 = {
  id: "t2",
  title: "Deep Work Session",
  metadata: {
    estimatedDuration: 120
  }
};
const norm2 = normalizeTaskForScheduling(rawTask2);
assert("duration fallback applied", norm2.estimatedDurationMinutes === 120);
assert("minimum chunk size fallback (large task) correctly min(duration, 15)", norm2.minimumChunkSize === 15);
assert("inferred deep work", norm2.requiresDeepWork === true);

// --- 2. Generation Engine Setup ---
console.log("\n[Placement Generation Engine]");

const defaultContext: PlacementAnalysisContext = {
  availabilityWindows: [
    { window: createTemporalWindow(600, 840), daysOfWeek: [1], score: 0.9, confidence: 0.9 } // 10:00 to 14:00 (4 hours)
  ],
  recurringConstraints: [],
  recoveryWindows: [],
  peakFocusWindows: [],
  sleepWindow: null,
  chronotype: { type: "morning", confidence: 0.8 },
  fragmentationScore: 0.2,
  dataReliabilityScore: 0.9
};

const task = normalizeTaskForScheduling({ id: "t3", metadata: { estimatedDuration: 60, requiresDeepWork: false } });

// --- 3. Edge + Midpoint Generation Tests ---
console.log("\n  [Edge + Midpoint Generation]");
const placements1 = generateCandidatePlacements(task, defaultContext);
const starts = placements1.map(p => p.temporalWindow.startMinute);
assert("start-aligned candidate exists (600)", starts.includes(600));
assert("end-aligned candidate exists (780)", starts.includes(780)); // 840 - 60 = 780
assert("midpoint candidate exists (690)", starts.includes(690)); // (240 - 60)/2 = 90 -> 600 + 90 = 690
assert("rolling candidate exists (630)", starts.includes(630));
assert("rolling candidate exists (660)", starts.includes(660));

// --- 4. Deep Work + Focus Alignment ---
console.log("\n  [Deep Work + Focus Alignment]");
const dwTask = normalizeTaskForScheduling({ 
  id: "dw1", 
  priority: 5,
  metadata: { estimatedDuration: 60, requiresDeepWork: true } 
});
const focusContext: PlacementAnalysisContext = {
  ...defaultContext,
  peakFocusWindows: [{ window: createTemporalWindow(600, 660), score: 1.0, confidence: 0.9 }] // Focus matches first slot exactly
};
const dwPlacements = generateCandidatePlacements(dwTask, focusContext);
const bestPlacement = dwPlacements[0];
assert("best placement aligns with focus window", bestPlacement.temporalWindow.startMinute === 600);
assert("best placement receives focus boost", bestPlacement.boostsApplied.includes("deep_work_focus_alignment"));
assert("best placement type is focus_aligned", bestPlacement.placementType === "focus_aligned");

// --- 5. Hard Constraints Rejection ---
console.log("\n  [Hard Constraints Rejection]");
const blockedContext: PlacementAnalysisContext = {
  ...defaultContext,
  recurringConstraints: [{ window: createTemporalWindow(630, 720), daysOfWeek: [1], constraintType: "hard", constraintStrength: 1.0, confidence: 1.0 }]
};
const blockedPlacements = generateCandidatePlacements(task, blockedContext);
assert("blocked candidates are rejected", blockedPlacements.every(p => p.temporalWindow.startMinute !== 630 && p.temporalWindow.startMinute !== 660));
assert("unblocked candidates survive", blockedPlacements.some(p => p.temporalWindow.startMinute === 600 || p.temporalWindow.startMinute === 720));

// --- 6. Recovery Penalty ---
console.log("\n  [Recovery Penalty]");
const recoveryContext: PlacementAnalysisContext = {
  ...defaultContext,
  // High availability score so it easily survives the 0.3 penalty
  availabilityWindows: [
    { window: createTemporalWindow(600, 840), daysOfWeek: [1], score: 1.0, confidence: 0.9 }
  ],
  // Use a smaller penalty so it doesn't cross the 0.4 threshold and get rejected
  recoveryWindows: [{ window: createTemporalWindow(600, 660), recoveryPenalty: 0.3, trigger: "gym", confidence: 0.9 }]
};
const recoveryPlacements = generateCandidatePlacements(task, recoveryContext);
const recPl = recoveryPlacements.find(p => p.temporalWindow.startMinute === 600);
// Score should be much lower than the 780 slot
const freePl = recoveryPlacements.find(p => p.temporalWindow.startMinute === 780);
assert("recovery penalty lowers score", (recPl?.placementScore ?? 1) < (freePl?.placementScore ?? 0));
assert("recovery conflict logged", recPl?.penaltiesApplied.includes("recovery_overlap_gym") ?? false);

// --- 7. Density Limit (Max 50) ---
console.log("\n  [Density Limits]");
const hugeContext: PlacementAnalysisContext = {
  ...defaultContext,
  availabilityWindows: [
    { window: createTemporalWindow(0, 1440), daysOfWeek: [1], score: 0.9, confidence: 0.9 } // 24 hours
  ]
};
const densityPlacements = generateCandidatePlacements(task, hugeContext);
assert("placements capped at 50", densityPlacements.length <= 50);

// --- 8. Sleep Proximity ---
console.log("\n  [Sleep Proximity]");
const sleepContext: PlacementAnalysisContext = {
  ...defaultContext,
  sleepWindow: { window: createTemporalWindow(1380, 420), confidence: 0.9 } // 23:00 to 07:00
};
const sleepTask = normalizeTaskForScheduling({ id: "sleepy", metadata: { estimatedDuration: 60 } });
const sleepPlacements = generateCandidatePlacements(sleepTask, sleepContext);
const sleepPenaltyApplied = sleepPlacements.some(p => p.penaltiesApplied.includes("sleep_proximity"));
// Since our availability is 10:00 to 14:00, distance to 23:00 is (1380 - 840) = 540m > 60m. 
// So no penalty should be applied here. Let's make an availability near sleep.
const sleepNearContext: PlacementAnalysisContext = {
  ...defaultContext,
  // Add focus window so the score doesn't drop below 0.2 and get rejected
  peakFocusWindows: [{ window: createTemporalWindow(1300, 1380), score: 1.0, confidence: 0.9 }],
  availabilityWindows: [{ window: createTemporalWindow(1300, 1380), daysOfWeek: [1], score: 0.9, confidence: 0.9 }],
  sleepWindow: { window: createTemporalWindow(1380, 420), confidence: 0.9 } // 23:00 to 07:00
};
const sleepNearPlacements = generateCandidatePlacements(sleepTask, sleepNearContext);
assert("sleep proximity penalty applied", sleepNearPlacements.some(p => p.penaltiesApplied.includes("sleep_proximity")));

// --- 9. Task Constraints & Priority ---
console.log("\n  [Task Constraints & Priority]");
const constrainedTask = normalizeTaskForScheduling({
  id: "tc1",
  priority: 1, // Will map to 0.2
  metadata: { 
    estimatedDuration: 60,
    requiresDeepWork: false,
    urgency: 0,
    hardConstraints: [createTemporalWindow(600, 660)], // Blocks 10:00-11:00
    softConstraints: [createTemporalWindow(780, 840)]  // Penalizes 13:00-14:00
  }
});
assert("priority mapped to 0.2 correctly", constrainedTask.priorityScore === 0.2);
assert("temporal flexibility initialized correctly", constrainedTask.temporalFlexibility === 0.85); // No urgency, no deep work -> base 0.85

const ctPlacements = generateCandidatePlacements(constrainedTask, defaultContext);
// Hard constraint at 600-660 blocks the start-aligned candidate [600, 660)
assert("task hard constraint rejects overlapping candidates", ctPlacements.every(p => p.temporalWindow.startMinute !== 600));

// Soft constraint at 780-840 penalizes the end-aligned candidate [780, 840)
const softPenalized = ctPlacements.find(p => p.temporalWindow.startMinute === 780);
assert("task soft constraint does not reject, but penalizes", softPenalized !== undefined);
assert("soft constraint penalty logged", softPenalized?.penaltiesApplied.includes("task_soft_constraint_overlap") ?? false);

// --- 10. Randomized Property Tests ---
console.log("\n[Randomized Property Tests (50 cases)]");
const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
let propPassed = 0, propFailed = 0;

for (let i = 0; i < 50; i++) {
  const availStart = rng(0, 1380);
  const availDur = rng(60, 480);
  const availEnd = (availStart + availDur) % 1440 || 1440;
  
  const ctx: PlacementAnalysisContext = {
    ...defaultContext,
    availabilityWindows: [
      { window: createTemporalWindow(availStart, availEnd), daysOfWeek: [1], score: 0.9, confidence: 0.9 }
    ]
  };
  
  const tDuration = rng(15, availDur - 15);
  const t = normalizeTaskForScheduling({ id: `r${i}`, metadata: { estimatedDuration: tDuration } });
  
  const placements = generateCandidatePlacements(t, ctx);
  
  for (const p of placements) {
    const aw = createTemporalWindow(availStart, availEnd);
    // Property 1: Placement duration equals task duration
    if (p.temporalWindow.durationMinutes !== tDuration) {
      console.error(`  ❌ Duration mismatch: got ${p.temporalWindow.durationMinutes}, expected ${tDuration}`);
      propFailed++;
    } else propPassed++;
    
    // Property 2: Placement is fully contained in availability
    if (!temporalWindowContains(aw, p.temporalWindow)) {
      console.error(`  ❌ Placement not contained in availability`);
      propFailed++;
    } else propPassed++;
    
    // Property 3: No invalid endMinute (e.g. 0)
    if (p.temporalWindow.endMinute < 1 || p.temporalWindow.endMinute > 1440) {
      console.error(`  ❌ Invalid end minute: ${p.temporalWindow.endMinute}`);
      propFailed++;
    } else propPassed++;
  }
}
console.log(`  ✅ Random: ${propPassed} checks passed, ❌ ${propFailed} failures`);
passed += propPassed; failed += propFailed;

// --- 11. Validation Boundary Tests (Hardening Pass) ---
console.log("\n  [Validation Boundary Assertions]");

const validBasePlacement: any = {
  taskId: "v1",
  dayOfWeek: 1,
  temporalWindow: createTemporalWindow(600, 660),
  placementScore: 0.8,
  confidence: 0.9,
  stabilityScore: 0.8,
  placementType: "optimal",
  penaltiesApplied: [],
  boostsApplied: [],
  blockingReasons: [],
  reasoning: ["valid_fallback_placement"]
};

// Test corrupt explainability
const corruptExplPlacement = { ...validBasePlacement, reasoning: [""] };
const v1 = validateCandidatePlacement(corruptExplPlacement, task, defaultContext);
if (!v1.valid && v1.errors.some(e => e.code === "EMPTY_EXPLAINABILITY_STRING")) {
  passed++;
} else {
  console.error(`  ❌ corrupt explainability string rejected failed`);
  failed++;
}

// Test valid array duplicates warning
const dupExplPlacement = { ...validBasePlacement, reasoning: ["valid_fallback_placement", "valid_fallback_placement"] };
const v2 = validateCandidatePlacement(dupExplPlacement, task, defaultContext);
if (v2.warnings.some(w => w.code === "DUPLICATE_EXPLAINABILITY")) {
  passed++;
} else {
  console.error(`  ❌ duplicate reasoning array triggers warning failed`);
  failed++;
}

// Test invalid score
const invScorePlacement = { ...validBasePlacement, placementScore: 1.5 };
const v3 = validateCandidatePlacement(invScorePlacement, task, defaultContext);
if (!v3.valid && v3.errors.some(e => e.code === "INVALID_SCORE_BOUNDS")) {
  passed++;
} else {
  console.error(`  ❌ invalid placement score bounds rejected failed`);
  failed++;
}

// Test duration mismatch
const mismatchPlacement = { ...validBasePlacement, temporalWindow: createTemporalWindow(600, 630) }; // duration 30, task is 60
const v4 = validateCandidatePlacement(mismatchPlacement, task, defaultContext);
if (!v4.valid && v4.errors.some(e => e.code === "DURATION_MISMATCH")) {
  passed++;
} else {
  console.error(`  ❌ duration mismatch rejected failed`);
  failed++;
}

console.log(`\n${"═".repeat(55)}`);
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES DETECTED in Task Placement Engine.");
  process.exit(1);
} else {
  console.log("✅ All Task Placement invariants satisfied.");
}

// ─────────────────────────────────────────────────────
// Final Phase 2A Hardening Regression Tests
// ─────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════════════════");
console.log("FINAL PHASE 2A HARDENING REGRESSION TESTS");
console.log("══════════════════════════════════════════════════════");

// --- A. Priority Validation ---
console.log("\n  [Priority Validation]");

const nanPriorityTask = normalizeTaskForScheduling({ id: "p1", priority: NaN });
assert("NaN priority falls back to safePriority=2", nanPriorityTask.priority === 2);
assert("NaN priority normalized to 0.4", nanPriorityTask.priorityScore === 0.4);

const infPriorityTask = normalizeTaskForScheduling({ id: "p2", priority: Infinity });
assert("Infinity priority falls back to safePriority=2", infPriorityTask.priority === 2);

const negativePriorityTask = normalizeTaskForScheduling({ id: "p3", priority: -999 });
assert("Out-of-domain negative priority falls back to 2", negativePriorityTask.priority === 2);

const overflowPriorityTask = normalizeTaskForScheduling({ id: "p4", priority: 999 });
assert("Out-of-domain overflow priority falls back to 2", overflowPriorityTask.priority === 2);

const validPriorityTask = normalizeTaskForScheduling({ id: "p5", priority: 5 });
assert("Valid priority 5 normalized correctly", validPriorityTask.priorityScore === 1.0);

const lowPriorityTask = normalizeTaskForScheduling({ id: "p6", priority: 1 });
assert("Valid priority 1 normalized correctly", lowPriorityTask.priorityScore === 0.2);

// --- B. Deterministic ID Fallback ---
console.log("\n  [Deterministic ID Fallback]");

const noIdTask = normalizeTaskForScheduling({ metadata: { estimatedDuration: 30 } });
assert("Missing ID falls back to 'unsaved-task'", noIdTask.id === "unsaved-task");

const withIdTask = normalizeTaskForScheduling({ id: "explicit-id" });
assert("Explicit ID is preserved", withIdTask.id === "explicit-id");

// Repeated normalization of same input → same ID (replay-safe)
const replay1 = normalizeTaskForScheduling({ metadata: { estimatedDuration: 60 } });
const replay2 = normalizeTaskForScheduling({ metadata: { estimatedDuration: 60 } });
assert("Repeated normalization produces identical ID (replay-safe)", replay1.id === replay2.id);

// --- C. Non-Null Constraint Arrays ---
console.log("\n  [Non-Null Constraint Arrays]");

const noConstraintTask = normalizeTaskForScheduling({ id: "nc1" });
assert("hardConstraints always defined (non-null)", Array.isArray(noConstraintTask.hardConstraints));
assert("softConstraints always defined (non-null)", Array.isArray(noConstraintTask.softConstraints));
assert("hardConstraints defaults to empty array", noConstraintTask.hardConstraints.length === 0);
assert("softConstraints defaults to empty array", noConstraintTask.softConstraints.length === 0);

// No optional chaining needed — directly iterate (would throw at runtime if undefined)
let constraintIterOk = true;
try {
  for (const _hc of noConstraintTask.hardConstraints) { void _hc; }
  for (const _sc of noConstraintTask.softConstraints) { void _sc; }
} catch {
  constraintIterOk = false;
}
assert("constraint arrays are directly iterable without optional chaining", constraintIterOk);

// --- D. Non-Finite Score Rejection ---
console.log("\n  [Non-Finite Score Rejection]");

const basePlacementValid: any = {
  taskId: "fin1",
  dayOfWeek: 1,
  temporalWindow: createTemporalWindow(600, 660),
  placementScore: 0.8,
  confidence: 0.9,
  stabilityScore: 0.8,
  placementType: "optimal",
  penaltiesApplied: [],
  boostsApplied: [],
  blockingReasons: [],
  reasoning: ["valid_fallback_placement"]
};
const finTask = normalizeTaskForScheduling({ id: "fin1", metadata: { estimatedDuration: 60 } });

const nanScorePlacement = { ...basePlacementValid, placementScore: NaN };
const vNaN = validateCandidatePlacement(nanScorePlacement, finTask, defaultContext);
assert("NaN placementScore rejected with NON_FINITE_SCORE", !vNaN.valid && vNaN.errors.some(e => e.code === "NON_FINITE_SCORE"));

const infScorePlacement = { ...basePlacementValid, placementScore: Infinity };
const vInf = validateCandidatePlacement(infScorePlacement, finTask, defaultContext);
assert("Infinity placementScore rejected with NON_FINITE_SCORE", !vInf.valid && vInf.errors.some(e => e.code === "NON_FINITE_SCORE"));

const nanConfidencePlacement = { ...basePlacementValid, confidence: NaN };
const vNaNConf = validateCandidatePlacement(nanConfidencePlacement, finTask, defaultContext);
assert("NaN confidence rejected with NON_FINITE_CONFIDENCE", !vNaNConf.valid && vNaNConf.errors.some(e => e.code === "NON_FINITE_CONFIDENCE"));

const negInfStabilityPlacement = { ...basePlacementValid, stabilityScore: -Infinity };
const vNegInfStab = validateCandidatePlacement(negInfStabilityPlacement, finTask, defaultContext);
assert("−Infinity stabilityScore rejected with NON_FINITE_STABILITY", !vNegInfStab.valid && vNegInfStab.errors.some(e => e.code === "NON_FINITE_STABILITY"));

console.log(`\n${"═".repeat(55)}`);
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES DETECTED in Hardening Regression Tests.");
  process.exit(1);
} else {
  console.log("✅ All Final Phase 2A Hardening invariants satisfied.");
}
