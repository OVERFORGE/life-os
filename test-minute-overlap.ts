/**
 * Exhaustive property-based tests for calculateMinuteOverlap.
 *
 * Run: npx tsx test-minute-overlap.ts
 *
 * This utility is system-critical — every planner score depends on it.
 * A single bug corrupts the entire availability substrate.
 */

import { calculateMinuteOverlap } from "./server/planner/utils/calculateMinuteOverlap";

let passed = 0;
let failed = 0;

function assert(label: string, actual: number, expected: number) {
  if (Math.abs(actual - expected) < 0.001) {
    console.log(`  ✅ ${label}: ${actual}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}: expected ${expected}, got ${actual}`);
    failed++;
  }
}

// ── Normal (non-wrapped) Intervals ────────────────────────────────────────────
console.log("\n[Normal Intervals]");
assert("identical",       calculateMinuteOverlap(60,  120, 60,  120), 60);
assert("full containment",calculateMinuteOverlap(60,  300, 120, 180), 60);
assert("partial overlap", calculateMinuteOverlap(60,  180, 120, 240), 60);
assert("zero overlap",    calculateMinuteOverlap(60,  120, 180, 240), 0);
assert("exact touch (end=start)", calculateMinuteOverlap(60, 120, 120, 180), 0);
assert("adjacent (no overlap)", calculateMinuteOverlap(60, 119, 120, 180), 0);
assert("one-minute overlap", calculateMinuteOverlap(60, 121, 120, 180), 1);
assert("whole day",       calculateMinuteOverlap(0, 1439, 0, 1439), 1439);
assert("single point A",  calculateMinuteOverlap(60, 60, 60, 120), 0);  // zero-width interval
assert("single point no overlap", calculateMinuteOverlap(60, 60, 61, 120), 0);

// ── Midnight-Crossover (wrapped) ──────────────────────────────────────────────
console.log("\n[Midnight Crossover]");
// 23:00 → 01:00  vs  00:00 → 02:00  → overlap 00:00–01:00 = 60 min
assert("wrapped A vs normal B (60)",  calculateMinuteOverlap(1380, 60,  0,   120), 60);
// 22:00 → 02:00  vs  00:00 → 01:00  → B fully inside wrap → 60 min
assert("normal inside wrap",          calculateMinuteOverlap(1320, 120, 0,   60),  60);
// 23:30 → 00:30  vs  23:00 → 00:00  → overlap 23:30–00:00 = 30 min
assert("wrap vs late evening",        calculateMinuteOverlap(1410, 30,  1380, 1439), 29); // 1410→1439 = 29
// 22:00 → 02:00  vs  03:00 → 04:00  → no overlap
assert("wrap vs morning (no overlap)",calculateMinuteOverlap(1320, 120, 180, 240), 0);
// both wrapped
// A: 23:00→01:00 = [1380,1439]∪[0,60], B: 23:30→00:30 = [1410,1439]∪[0,30]
// [1380,1439]∩[1410,1439]=29, [0,60]∩[0,30]=30  → total=59
assert("wrapped vs wrapped contained",calculateMinuteOverlap(1380, 60,  1410, 30), 59);
// A: 23:00→01:00 = [1380,1439]∪[0,60], B: 22:00→00:30 = [1320,1439]∪[0,30]
// [1380,1439]∩[1320,1439]=59, [0,60]∩[0,30]=30  → total=89
assert("wrapped vs wrapped partial",  calculateMinuteOverlap(1380, 60,  1320, 30), 89);

// ── Edge Cases ────────────────────────────────────────────────────────────────
console.log("\n[Edge Cases]");
assert("00:00 start",   calculateMinuteOverlap(0,  60,  0,  30),  30);
assert("23:59 end",     calculateMinuteOverlap(1380, 1439, 1420, 1439), 19);
assert("starts at 1439",calculateMinuteOverlap(1439, 1439, 1438, 1439), 0);
assert("zero-length window start=end no wrap", calculateMinuteOverlap(120, 120, 100, 150), 0);
assert("full non-wrapped vs empty zone",       calculateMinuteOverlap(0, 1439, 720, 720), 0);

// ── Symmetry Property ─────────────────────────────────────────────────────────
console.log("\n[Symmetry: overlap(A,B) == overlap(B,A)]");
const cases: [number, number, number, number][] = [
  [60, 120, 90, 150],
  [1380, 60, 0, 120],
  [1320, 30, 1350, 60],
  [0, 1439, 600, 900],
];
for (const [sa, ea, sb, eb] of cases) {
  const ab = calculateMinuteOverlap(sa, ea, sb, eb);
  const ba = calculateMinuteOverlap(sb, eb, sa, ea);
  if (Math.abs(ab - ba) < 0.001) {
    console.log(`  ✅ symmetric(${sa}→${ea}, ${sb}→${eb}): ${ab}`);
    passed++;
  } else {
    console.error(`  ❌ asymmetric(${sa}→${ea}, ${sb}→${eb}): ab=${ab}, ba=${ba}`);
    failed++;
  }
}

// ── Result ────────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Tests passed: ${passed}   Failed: ${failed}`);
if (failed > 0) process.exit(1);
