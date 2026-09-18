import { SimulationRuntime } from "./runtime/simulationRuntime";
import { ReplayHasher } from "./execution/services/replayHasher";

console.log("=========================================================");
console.log("  LIFEOS SIMULATION LAB — PHASE 2.1 MULTI-DAY VERIFICATION ");
console.log("=========================================================");

const SEED = 999888;

// -------------------------------------------------------------
// Test Scenario 1: 1-Day Simulation (Backward Compatibility)
// -------------------------------------------------------------
console.log("\n--- SCENARIO 1: 1-Day Simulation Test (Backward Compatibility) ---");
const run1A = new SimulationRuntime({
  runUid: "RUN_1DAY_001",
  seed: SEED,
  startDay: 1,
  startMinute: 480, // 08:00
  terminationPolicy: { targetDays: 1 },
}).run();

const run1B = new SimulationRuntime({
  runUid: "RUN_1DAY_001",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 1 },
}).run();

console.log(`Ticks Executed: ${run1A.totalTicksExecuted}`);
console.log(`Final Virtual Day: ${run1A.finalDay}, Final Minute: ${run1A.finalMinute}`);
console.log(`Pass 1 Replay Hash: ${run1A.replayHash}`);
console.log(`Pass 2 Replay Hash: ${run1B.replayHash}`);

if (run1A.replayHash !== run1B.replayHash) {
  console.error("❌ 1-DAY DETERMINISM FAILURE: Replay hashes do not match!");
  process.exit(1);
}
console.log("✅ SCENARIO 1 PASSED: 1-Day execution backward compatibility verified!");

// -------------------------------------------------------------
// Test Scenario 2: 3-Day Simulation (Day Rollover & Continuity)
// -------------------------------------------------------------
console.log("\n--- SCENARIO 2: 3-Day Simulation Test (Multi-Day Rollover & World Continuity) ---");
const run3A = new SimulationRuntime({
  runUid: "RUN_3DAY_001",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 3 },
}).run();

const run3B = new SimulationRuntime({
  runUid: "RUN_3DAY_001",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 3 },
}).run();

console.log(`Ticks Executed: ${run3A.totalTicksExecuted}`);
console.log(`Start Day: ${run3A.startDay} -> Final Day: ${run3A.finalDay}, Final Minute: ${run3A.finalMinute}`);
console.log(`Completed Activities: ${run3A.finalWorldState.completedActivitiesCount}`);
console.log(`Total Focus Minutes: ${run3A.finalWorldState.totalFocusMinutes}`);
console.log(`Active Task Progress: ${run3A.finalWorldState.activeTaskProgress}%`);
console.log(`Pass 1 Replay Hash: ${run3A.replayHash}`);
console.log(`Pass 2 Replay Hash: ${run3B.replayHash}`);

if (run3A.finalDay !== 4) {
  console.error(`❌ DAY ROLLOVER FAILURE: Expected Day 4 after 3 full days, got Day ${run3A.finalDay}`);
  process.exit(1);
}

if (run3A.finalWorldState.completedActivitiesCount === 0) {
  console.error("❌ WORLD CONTINUITY FAILURE: Completed activities counter reset to 0!");
  process.exit(1);
}

if (run3A.replayHash !== run3B.replayHash) {
  console.error("❌ 3-DAY DETERMINISM FAILURE: Replay hashes do not match!");
  process.exit(1);
}
console.log("✅ SCENARIO 2 PASSED: 3-Day rollover, world continuity & determinism verified!");

// -------------------------------------------------------------
// Test Scenario 3: 30-Day Simulation (Long-Duration Stability)
// -------------------------------------------------------------
console.log("\n--- SCENARIO 3: 30-Day Simulation Test (Long-Duration Stability) ---");
const run30A = new SimulationRuntime({
  runUid: "RUN_30DAY_001",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 30 },
}).run();

const run30B = new SimulationRuntime({
  runUid: "RUN_30DAY_001",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 30 },
}).run();

console.log(`Ticks Executed: ${run30A.totalTicksExecuted}`);
console.log(`Start Day: ${run30A.startDay} -> Final Day: ${run30A.finalDay}`);
console.log(`Completed Activities Across 30 Days: ${run30A.finalWorldState.completedActivitiesCount}`);
console.log(`Total Focus Minutes Across 30 Days: ${run30A.finalWorldState.totalFocusMinutes}`);
console.log(`Pass 1 Replay Hash: ${run30A.replayHash}`);
console.log(`Pass 2 Replay Hash: ${run30B.replayHash}`);

if (run30A.finalDay !== 31) {
  console.error(`❌ LONG-DURATION FAILURE: Expected Day 31 after 30 full days, got Day ${run30A.finalDay}`);
  process.exit(1);
}

if (run30A.replayHash !== run30B.replayHash) {
  console.error("❌ 30-DAY DETERMINISM FAILURE: Replay hashes do not match!");
  process.exit(1);
}
console.log("✅ SCENARIO 3 PASSED: 30-Day long-duration stability & determinism verified!");

console.log("\n=========================================================");
console.log("  ALL PHASE 2.1 MULTI-DAY VERIFICATIONS PASSED CLEANLY!");
console.log("=========================================================");
