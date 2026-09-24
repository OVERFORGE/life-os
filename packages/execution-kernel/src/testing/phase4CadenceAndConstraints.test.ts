import { test } from "node:test";
import assert from "node:assert/strict";
import { CadenceLearningEngine } from "../temporal/cadence/CadenceLearningEngine";
import { ExecutionChronicleEntry } from "../temporal/contracts/TemporalContracts";
import { ScheduleSolver } from "../temporal/solver/ScheduleSolver";

test("Phase 4: Day-Segmented Cadence Learning (Monday ≠ Tuesday Independence)", () => {
  const learningEngine = CadenceLearningEngine.getInstance();
  const userId = "usr_cadence_test";

  // Simulate chronicles over 4 weeks:
  // User always goes to the Gym on Mondays at 07:00 UTC (420 min) for 60 min
  // User always does Deep Work on Tuesdays at 10:00 UTC (600 min) for 120 min
  const chronicles: ExecutionChronicleEntry[] = [];
  const baseMs = new Date("2026-09-01T00:00:00Z").getTime(); // Tuesday Sept 1, 2026

  // Generate 4 Mondays and 4 Tuesdays
  for (let week = 0; week < 4; week++) {
    // Tuesday: Sept 1, Sept 8, Sept 15, Sept 22
    const tuesdayDate = new Date("2026-09-01T10:00:00Z");
    tuesdayDate.setUTCDate(tuesdayDate.getUTCDate() + week * 7);
    chronicles.push({
      chronicleId: `chron_tue_${week}`,
      userId,
      entityType: "task",
      title: "Deep Work Sprint",
      startedAtMs: tuesdayDate.getTime(),
      endedAtMs: tuesdayDate.getTime() + 120 * 60 * 1000,
      durationMinutes: 120,
      interruptionsCount: 0,
      source: "web_manual",
      createdAt: tuesdayDate.getTime(),
    });

    // Monday: Sept 7, Sept 14, Sept 21, Sept 28
    const mondayDate = new Date("2026-09-07T07:00:00Z");
    mondayDate.setUTCDate(mondayDate.getUTCDate() + week * 7);
    chronicles.push({
      chronicleId: `chron_mon_${week}`,
      userId,
      entityType: "workout",
      title: "Morning Gym",
      startedAtMs: mondayDate.getTime(),
      endedAtMs: mondayDate.getTime() + 60 * 60 * 1000,
      durationMinutes: 60,
      interruptionsCount: 0,
      source: "web_manual",
      createdAt: mondayDate.getTime(),
    });
  }

  const profiles = learningEngine.deriveDayCadenceProfiles(userId, chronicles, "UTC");

  // Monday is dayOfWeek = 1
  const mondayProfile = profiles.get(1)!;
  assert.equal(mondayProfile.dayOfWeek, 1);
  assert.ok(mondayProfile.sampleCount >= 4, "Monday must have at least 4 samples");
  const mondayGym = mondayProfile.routines.find((r) => r.category === "GYM");
  assert.ok(mondayGym, "Monday must learn Gym routine");
  assert.equal(mondayGym.targetStartMinute, 420, "Monday Gym target start must be 07:00 (420 min)");
  assert.equal(mondayGym.durationMinutes, 60, "Monday Gym duration must be 60 min");

  // Tuesday is dayOfWeek = 2
  const tuesdayProfile = profiles.get(2)!;
  assert.equal(tuesdayProfile.dayOfWeek, 2);
  assert.ok(tuesdayProfile.sampleCount >= 4, "Tuesday must have at least 4 samples");
  const tuesdayFocus = tuesdayProfile.routines.find((r) => r.category === "FOCUS");
  assert.ok(tuesdayFocus, "Tuesday must learn Deep Work Focus routine");
  assert.equal(tuesdayFocus.targetStartMinute, 600, "Tuesday Focus start must be 10:00 (600 min)");
  assert.equal(tuesdayFocus.durationMinutes, 120, "Tuesday Focus duration must be 120 min");

  // Verify Independence: Monday must NOT have Focus, Tuesday must NOT have Gym!
  assert.equal(
    mondayProfile.routines.some((r) => r.category === "FOCUS"),
    false,
    "Monday routine must NOT be polluted by Tuesday focus session"
  );
  assert.equal(
    tuesdayProfile.routines.some((r) => r.category === "GYM"),
    false,
    "Tuesday routine must NOT be polluted by Monday gym session"
  );
});

test("Phase 4: Recency Decay Weighting (21-Day Half-Life tau)", () => {
  const engine = CadenceLearningEngine.getInstance();
  const refTime = new Date("2026-09-24T12:00:00Z").getTime();

  // Fresh observation (today): weight should be approximately 1.0
  const freshWeight = engine.computeRecencyWeight(refTime, refTime);
  assert.equal(freshWeight, 1.0);

  // Observation 21 days ago: weight should be ~0.50 (half-life)
  const age21DaysMs = refTime - 21 * 24 * 3600 * 1000;
  const weight21Days = engine.computeRecencyWeight(age21DaysMs, refTime);
  assert.ok(Math.abs(weight21Days - 0.5) < 0.02, `21-day old observation weight must be ~0.50, got ${weight21Days}`);

  // Observation 42 days ago: weight should be ~0.25 (two half-lives)
  const age42DaysMs = refTime - 42 * 24 * 3600 * 1000;
  const weight42Days = engine.computeRecencyWeight(age42DaysMs, refTime);
  assert.ok(Math.abs(weight42Days - 0.25) < 0.02, `42-day old observation weight must be ~0.25, got ${weight42Days}`);
});

test("Phase 4: Operational Constraints Integration (Incident & Sabbatical Mode)", () => {
  const solver = ScheduleSolver.getInstance();

  // Case 1: Active Incident with suppressWorkouts = true blocks workout scheduling
  const workoutBlocked = solver.solvePlacement({
    dateOnly: "2026-09-25",
    idealStartMinute: 420, // 07:00
    durationMinutes: 60,
    activityType: "workout",
    locationContext: { category: "GYM", label: "Downtown Gym" },
    existingOccurrences: [],
    operationalConstraints: {
      suppressWorkouts: true,
    },
    isUserExplicitOverride: false,
  });

  assert.equal(workoutBlocked.feasible, false, "Workout must be blocked by active incident constraint");
  assert.ok(workoutBlocked.reason?.includes("[INCIDENT_CONSTRAINT_ACTIVE]"));

  // Case 2: Explicit User Override permanently outranks active incident constraint (Guardrail 9)
  const userOverride = solver.solvePlacement({
    dateOnly: "2026-09-25",
    idealStartMinute: 420,
    durationMinutes: 60,
    activityType: "workout",
    locationContext: { category: "GYM", label: "Downtown Gym" },
    existingOccurrences: [],
    operationalConstraints: {
      suppressWorkouts: true,
    },
    isUserExplicitOverride: true, // User says "I feel fine, schedule it anyway"
  });

  assert.equal(userOverride.feasible, true, "Explicit user override must outrank operational constraint");

  // Case 3: Sabbatical Mode freezes intensive work sessions without penalty
  const sabbaticalWork = solver.solvePlacement({
    dateOnly: "2026-09-25",
    idealStartMinute: 600,
    durationMinutes: 180,
    activityType: "work_session",
    existingOccurrences: [],
    operationalConstraints: {
      activeContextMode: "sabbatical",
    },
    isUserExplicitOverride: false,
  });

  assert.equal(sabbaticalWork.feasible, false, "Intensive work must be frozen during sabbatical mode");
  assert.ok(sabbaticalWork.reason?.includes("[SABBATICAL_MODE_ACTIVE]"));
});
