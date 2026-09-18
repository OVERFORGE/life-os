import { SimulationRuntime } from "./runtime/simulationRuntime";

console.log("=========================================================");
console.log("  LIFEOS SIMULATION LAB — PHASE 2.3 DAILY LIFECYCLE VERIFY");
console.log("=========================================================");

const SEED = 888999;

// -------------------------------------------------------------
// Scenario 1: 3-Day Daily Lifecycle Execution & Metric Aggregation
// -------------------------------------------------------------
console.log("\n--- SCENARIO 1: 3-Day Continuous Run & Daily Summary Generation ---");

const runA = new SimulationRuntime({
  runUid: "RUN_LIFECYCLE_3DAY",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 3 },
}).run();

const runB = new SimulationRuntime({
  runUid: "RUN_LIFECYCLE_3DAY",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 3 },
}).run();

console.log(`Ticks Executed: ${runA.totalTicksExecuted}`);
console.log(`Final Virtual Day: ${runA.finalDay}, Final Minute: ${runA.finalMinute}`);
console.log(`Total Daily Summaries Collected: ${runA.dailySummaries.length}`);

if (runA.dailySummaries.length !== 3) {
  console.error(`❌ SUMMARY COUNT FAILURE: Expected 3 daily summaries, found ${runA.dailySummaries.length}`);
  process.exit(1);
}

for (const summary of runA.dailySummaries) {
  console.log(`\n  [Daily Summary Day ${summary.day}]`);
  console.log(`  - Focus Minutes:       ${summary.focusMinutes}`);
  console.log(`  - Completed Activities: ${summary.completedActivities}`);
  console.log(`  - Ending Energy:        ${summary.endingEnergy}%`);
  console.log(`  - Ending Stress:        ${summary.endingStress}%`);
  console.log(`  - Ending Fatigue:       ${summary.endingFatigue}%`);
  console.log(`  - Completed Tasks:      ${summary.completedTasks}`);
  console.log(`  - Unfinished Tasks:     ${summary.unfinishedTasks}`);

  if (summary.focusMinutes < 0 || summary.endingEnergy < 0) {
    console.error(`❌ METRIC BOUNDARY FAILURE: Negative metric values detected in summary for Day ${summary.day}`);
    process.exit(1);
  }
}

console.log("\n✅ SCENARIO 1 PASSED: 3 Daily Summaries computed and collected deterministically!");

// -------------------------------------------------------------
// Scenario 2: Replay Hash Determinism Verification
// -------------------------------------------------------------
console.log("\n--- SCENARIO 2: Replay Hash Determinism Verification ---");
console.log(`Pass A World Hash:  ${runA.finalWorldHash}`);
console.log(`Pass B World Hash:  ${runB.finalWorldHash}`);
console.log(`Pass A Replay Hash: ${runA.replayHash}`);
console.log(`Pass B Replay Hash: ${runB.replayHash}`);

if (runA.finalWorldHash !== runB.finalWorldHash) {
  console.error("❌ DETERMINISM FAILURE: World hashes do not match across runs!");
  process.exit(1);
}

if (runA.replayHash !== runB.replayHash) {
  console.error("❌ DETERMINISM FAILURE: Replay hashes do not match across runs!");
  process.exit(1);
}

// Compare daily summaries JSON content across passes
const summariesA = JSON.stringify(runA.dailySummaries);
const summariesB = JSON.stringify(runB.dailySummaries);

if (summariesA !== summariesB) {
  console.error("❌ SUMMARY DETERMINISM FAILURE: Daily summaries differ across runs!");
  process.exit(1);
}

console.log("✅ SCENARIO 2 PASSED: Daily summaries and replay hashes match byte-for-byte!");

console.log("\n=========================================================");
console.log("  ALL PHASE 2.3 DAILY LIFECYCLE VERIFICATIONS PASSED!");
console.log("=========================================================");
