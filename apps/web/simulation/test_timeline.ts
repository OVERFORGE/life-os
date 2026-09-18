import { SimulationRuntime } from "./runtime/simulationRuntime";
import {
  TimelineEventType,
  DayCompletedPayload,
} from "./runtime/contracts/timelineContracts";

console.log("=========================================================");
console.log("  LIFEOS SIMULATION LAB — PHASE 2.4 TIMELINE SYSTEM VERIFY");
console.log("=========================================================");

const SEED = 654321;

// -------------------------------------------------------------
// Scenario 1: 1-Day Simulation Timeline Verification
// -------------------------------------------------------------
console.log("\n--- SCENARIO 1: 1-Day Simulation Timeline Event Verification ---");

const run1 = new SimulationRuntime({
  runUid: "RUN_TIMELINE_1DAY",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 1 },
}).run();

console.log(`Ticks Executed: ${run1.totalTicksExecuted}`);
console.log(`Timeline Version: ${run1.timeline.metadata.timelineVersion}`);
console.log(`Total Timeline Events: ${run1.timeline.metadata.totalEvents}`);
console.log(`Timeline Hash: ${run1.timelineHash}`);

const events = run1.timeline.events;
const startEvt = events.find((e) => e.type === TimelineEventType.SIMULATION_STARTED);
const finishEvt = events.find((e) => e.type === TimelineEventType.SIMULATION_FINISHED);
const tickEvts = events.filter((e) => e.type === TimelineEventType.TICK_EXECUTED);
const snapEvts = events.filter((e) => e.type === TimelineEventType.SNAPSHOT_CREATED);

if (!startEvt || !finishEvt) {
  console.error("❌ TIMELINE ERROR: Missing SIMULATION_STARTED or SIMULATION_FINISHED event!");
  process.exit(1);
}

if (tickEvts.length !== 480) {
  console.error(`❌ TIMELINE ERROR: Expected 480 TICK_EXECUTED events, found ${tickEvts.length}`);
  process.exit(1);
}

if (snapEvts.length !== 480) {
  console.error(`❌ TIMELINE ERROR: Expected 480 SNAPSHOT_CREATED events, found ${snapEvts.length}`);
  process.exit(1);
}

// Verify monotonic sequence ordering and eventId formatting
for (let i = 0; i < events.length; i++) {
  const expectedSeq = i + 1;
  const expectedId = `TLE_RUN_TIMELINE_1DAY_s${expectedSeq.toString().padStart(6, "0")}`;
  if (events[i].sequence !== expectedSeq || events[i].eventId !== expectedId) {
    console.error(`❌ SEQUENCE ERROR: Event index ${i} has seq ${events[i].sequence} (expected ${expectedSeq}) / ID ${events[i].eventId}`);
    process.exit(1);
  }
}

console.log("✅ SCENARIO 1 PASSED: 1-Day timeline events, monotonic sequence & eventId format verified!");

// -------------------------------------------------------------
// Scenario 2: 3-Day Multi-Day Timeline Verification
// -------------------------------------------------------------
console.log("\n--- SCENARIO 2: 3-Day Multi-Day Timeline Event Verification ---");

const run3 = new SimulationRuntime({
  runUid: "RUN_TIMELINE_3DAY",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 3 },
}).run();

console.log(`Ticks Executed: ${run3.totalTicksExecuted}`);
console.log(`Total Timeline Events: ${run3.timeline.metadata.totalEvents}`);
console.log(`Timeline Hash: ${run3.timelineHash}`);

const dayCompletedEvts = run3.timeline.events.filter((e) => e.type === TimelineEventType.DAY_COMPLETED);
console.log(`DAY_COMPLETED Events Count: ${dayCompletedEvts.length}`);

if (dayCompletedEvts.length !== 3) {
  console.error(`❌ TIMELINE ERROR: Expected 3 DAY_COMPLETED events, found ${dayCompletedEvts.length}`);
  process.exit(1);
}

for (const evt of dayCompletedEvts) {
  const payload = evt.payload as DayCompletedPayload;
  console.log(`  - Sequence ${evt.sequence} (${evt.eventId}): Day ${payload.day} completed (Focus Mins: ${payload.focusMinutes})`);
}

console.log("✅ SCENARIO 2 PASSED: 3-Day timeline day completed events verified!");

// -------------------------------------------------------------
// Scenario 3: Deterministic Replay & Timeline Hash Verification
// -------------------------------------------------------------
console.log("\n--- SCENARIO 3: Deterministic Replay & Timeline Hash Verification ---");

const runPassA = new SimulationRuntime({
  runUid: "RUN_TIMELINE_REPLAY",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 1 },
}).run();

const runPassB = new SimulationRuntime({
  runUid: "RUN_TIMELINE_REPLAY",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 1 },
}).run();

console.log(`Pass A World Hash:    ${runPassA.finalWorldHash}`);
console.log(`Pass B World Hash:    ${runPassB.finalWorldHash}`);
console.log(`Pass A Replay Hash:   ${runPassA.replayHash}`);
console.log(`Pass B Replay Hash:   ${runPassB.replayHash}`);
console.log(`Pass A Timeline Hash: ${runPassA.timelineHash}`);
console.log(`Pass B Timeline Hash: ${runPassB.timelineHash}`);

if (runPassA.finalWorldHash !== runPassB.finalWorldHash) {
  console.error("❌ DETERMINISM FAILURE: World hashes do not match!");
  process.exit(1);
}

if (runPassA.replayHash !== runPassB.replayHash) {
  console.error("❌ DETERMINISM FAILURE: Replay hashes do not match!");
  process.exit(1);
}

if (runPassA.timelineHash !== runPassB.timelineHash) {
  console.error("❌ DETERMINISM FAILURE: Timeline hashes do not match!");
  process.exit(1);
}

const jsonA = JSON.stringify(runPassA.timeline);
const jsonB = JSON.stringify(runPassB.timeline);

if (jsonA !== jsonB) {
  console.error("❌ DETERMINISM FAILURE: Timeline JSON payloads differ!");
  process.exit(1);
}

console.log("✅ SCENARIO 3 PASSED: Timeline JSON, World Hash, Replay Hash & Timeline Hash match byte-for-byte!");

console.log("\n=========================================================");
console.log("  ALL PHASE 2.4 TIMELINE SYSTEM VERIFICATIONS PASSED!");
console.log("=========================================================");
