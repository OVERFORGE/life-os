import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { SimulationRuntime } from "./runtime/simulationRuntime";
import { FileSnapshotStorage } from "./storage/engine/fileSnapshotStorage";

console.log("=========================================================");
console.log("  LIFEOS SIMULATION LAB — PHASE 2.2 SNAPSHOT STORAGE VERIFY");
console.log("=========================================================");

const SEED = 777666;
const TEST_SNAPSHOT_DIR = path.join(process.cwd(), "temp_test_snapshots");

// Cleanup previous test outputs if exist
if (fs.existsSync(TEST_SNAPSHOT_DIR)) {
  fs.rmSync(TEST_SNAPSHOT_DIR, { recursive: true, force: true });
}

function countFilesRecursive(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(fullPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

/**
 * Computes a SHA-256 digest over the entire directory tree's relative filenames and contents.
 */
function computeDirectoryTreeHash(rootDir: string): string {
  const getAllFiles = (dir: string, base: string = ""): string[] => {
    let results: string[] = [];
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of list) {
      const relPath = path.join(base, item.name);
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        results = results.concat(getAllFiles(fullPath, relPath));
      } else {
        results.push(relPath);
      }
    }
    return results;
  };

  const filePaths = getAllFiles(rootDir).sort();
  const hasher = createHash("sha256");

  for (const relPath of filePaths) {
    const content = fs.readFileSync(path.join(rootDir, relPath), "utf8");
    hasher.update(relPath, "utf8");
    hasher.update(":", "utf8");
    hasher.update(content, "utf8");
    hasher.update("\n", "utf8");
  }

  return hasher.digest("hex");
}

// -------------------------------------------------------------
// Scenario 1: 1-Day Run with FileSnapshotStorage Persistence
// -------------------------------------------------------------
console.log("\n--- SCENARIO 1: 1-Day Snapshot Persistence Test ---");
const storage1 = new FileSnapshotStorage(TEST_SNAPSHOT_DIR);

const run1 = new SimulationRuntime({
  runUid: "RUN_SNAP_1DAY",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 1 },
  snapshotStorage: storage1,
}).run();

const count1 = countFilesRecursive(path.join(TEST_SNAPSHOT_DIR, "RUN_SNAP_1DAY"));
console.log(`Ticks Executed: ${run1.totalTicksExecuted}`);
console.log(`Snapshot Files Written to Disk: ${count1}`);
console.log(`Replay Hash: ${run1.replayHash}`);

if (count1 !== 480) {
  console.error(`❌ PERSISTENCE FAILURE: Expected 480 snapshot files, found ${count1}`);
  process.exit(1);
}
console.log("✅ SCENARIO 1 PASSED: 480 canonical snapshots persisted cleanly to disk!");

// -------------------------------------------------------------
// Scenario 2: 3-Day Run with FileSnapshotStorage Persistence
// -------------------------------------------------------------
console.log("\n--- SCENARIO 2: 3-Day Multi-Day Snapshot Persistence Test ---");
const storage3 = new FileSnapshotStorage(TEST_SNAPSHOT_DIR);

const run3 = new SimulationRuntime({
  runUid: "RUN_SNAP_3DAY",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 3 },
  snapshotStorage: storage3,
}).run();

const count3 = countFilesRecursive(path.join(TEST_SNAPSHOT_DIR, "RUN_SNAP_3DAY"));
console.log(`Ticks Executed: ${run3.totalTicksExecuted}`);
console.log(`Snapshot Files Written to Disk Across 3 Days: ${count3}`);
console.log(`Replay Hash: ${run3.replayHash}`);

if (count3 !== 3360) {
  console.error(`❌ PERSISTENCE FAILURE: Expected 3,360 snapshot files, found ${count3}`);
  process.exit(1);
}
console.log("✅ SCENARIO 2 PASSED: 3,360 snapshots persisted cleanly across Day subfolders!");

// -------------------------------------------------------------
// Scenario 3: Entire Directory Tree Determinism Verification
// -------------------------------------------------------------
console.log("\n--- SCENARIO 3: Full Directory Tree Determinism Verification ---");
const dirPassA = path.join(TEST_SNAPSHOT_DIR, "PASS_A");
const dirPassB = path.join(TEST_SNAPSHOT_DIR, "PASS_B");

const runPassA = new SimulationRuntime({
  runUid: "RUN_DETERMINISM_TEST",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 1 },
  snapshotStorage: new FileSnapshotStorage(dirPassA),
}).run();

const runPassB = new SimulationRuntime({
  runUid: "RUN_DETERMINISM_TEST",
  seed: SEED,
  startDay: 1,
  startMinute: 480,
  terminationPolicy: { targetDays: 1 },
  snapshotStorage: new FileSnapshotStorage(dirPassB),
}).run();

const treeHashA = computeDirectoryTreeHash(path.join(dirPassA, "RUN_DETERMINISM_TEST"));
const treeHashB = computeDirectoryTreeHash(path.join(dirPassB, "RUN_DETERMINISM_TEST"));

console.log(`Pass A World Hash:        ${runPassA.finalWorldHash}`);
console.log(`Pass B World Hash:        ${runPassB.finalWorldHash}`);
console.log(`Pass A Replay Hash:       ${runPassA.replayHash}`);
console.log(`Pass B Replay Hash:       ${runPassB.replayHash}`);
console.log(`Pass A Directory Tree Hash: ${treeHashA}`);
console.log(`Pass B Directory Tree Hash: ${treeHashB}`);

if (runPassA.finalWorldHash !== runPassB.finalWorldHash) {
  console.error("❌ DETERMINISM FAILURE: World hashes do not match across identical runs!");
  process.exit(1);
}

if (runPassA.replayHash !== runPassB.replayHash) {
  console.error("❌ DETERMINISM FAILURE: Replay hashes do not match across identical runs!");
  process.exit(1);
}

if (treeHashA !== treeHashB) {
  console.error("❌ PERSISTENCE TREE DETERMINISM FAILURE: Directory tree hashes do not match!");
  process.exit(1);
}

console.log("✅ SCENARIO 3 PASSED: Full persisted snapshot directory tree matches byte-for-byte!");

// Cleanup temporary test directory
if (fs.existsSync(TEST_SNAPSHOT_DIR)) {
  fs.rmSync(TEST_SNAPSHOT_DIR, { recursive: true, force: true });
}

console.log("\n=========================================================");
console.log("  ALL PHASE 2.2 SNAPSHOT STORAGE VERIFICATIONS PASSED!");
console.log("=========================================================");
