/**
 * Exhaustive Temporal Algebra Test Suite
 *
 * Tests the TemporalWindow interval algebra with:
 * - Half-open [s,e) semantics
 * - Midnight-crossing windows
 * - Containment, adjacency, distance
 * - Merge, subtract
 * - Full-day [0,1440)
 * - 1440 sentinel handling
 * - Symmetry, non-negative durations
 * - Randomized property tests
 *
 * Run: npx tsx test-temporal-algebra.ts
 */

import {
  createTemporalWindow, tryCreateTemporalWindow,
  splitWrappedWindow, minuteInWindow,
  calculateTemporalOverlap, temporalWindowsIntersect,
  temporalWindowContains, temporalWindowAdjacent,
  distanceBetweenTemporalWindows, mergeTemporalWindows,
  subtractTemporalWindows, formatTemporalWindow,
  TemporalWindow,
} from "./server/planner/utils/TemporalWindow";

let passed = 0, failed = 0;

function assert(label: string, actual: unknown, expected: unknown) {
  const eq = JSON.stringify(actual) === JSON.stringify(expected);
  if (eq) { console.log(`  ✅ ${label}`); passed++; }
  else    { console.error(`  ❌ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); failed++; }
}

function assertApprox(label: string, actual: number, expected: number, tol = 0.001) {
  if (Math.abs(actual - expected) <= tol) { console.log(`  ✅ ${label}: ${actual}`); passed++; }
  else { console.error(`  ❌ ${label}: expected ≈${expected}, got ${actual}`); failed++; }
}

function assertThrows(label: string, fn: () => void) {
  try { fn(); console.error(`  ❌ ${label}: expected throw, got none`); failed++; }
  catch { console.log(`  ✅ ${label}: threw as expected`); passed++; }
}

const W = (s: number, e: number) => createTemporalWindow(s, e);

// ── Construction & Validation ─────────────────────────────────────────────────
console.log("\n[Construction & Validation]");
assert("normal window duration",      W(60, 120).durationMinutes, 60);
assert("full-day duration",           W(0, 1440).durationMinutes, 1440);
assert("23:00→midnight duration",     W(1380, 1440).durationMinutes, 60);
assert("wrapped duration",            W(1380, 60).durationMinutes, 120);
assert("wrapsMidnight false normal",  W(60, 120).wrapsMidnight, false);
assert("wrapsMidnight true wrapped",  W(1380, 60).wrapsMidnight, true);
assert("wrapsMidnight false 1440",    W(1380, 1440).wrapsMidnight, false);

assertThrows("startMinute < 0",      () => W(-1, 60));
assertThrows("startMinute > 1439",   () => W(1440, 1440));
assertThrows("endMinute = 0",        () => W(0, 0));
assertThrows("endMinute > 1440",     () => W(0, 1441));
assertThrows("zero-duration same s=e",() => W(120, 120));

assert("tryCreate valid",   tryCreateTemporalWindow(60, 120)?.durationMinutes, 60);
assert("tryCreate invalid", tryCreateTemporalWindow(-1, 60), null);

// ── Half-Open Semantics ───────────────────────────────────────────────────────
console.log("\n[Half-Open Semantics: minuteInWindow]");
assert("60 in [60,120)",    minuteInWindow(60,  W(60, 120)), true);
assert("119 in [60,120)",   minuteInWindow(119, W(60, 120)), true);
assert("120 NOT in [60,120)",minuteInWindow(120, W(60, 120)), false); // KEY: half-open
assert("59 NOT in [60,120)",minuteInWindow(59,  W(60, 120)), false);
assert("0 in [0,1440)",     minuteInWindow(0,   W(0, 1440)), true);
assert("1439 in [0,1440)",  minuteInWindow(1439,W(0, 1440)), true);
assert("0 in wrapped [1380,60)",  minuteInWindow(0,    W(1380, 60)), true);
assert("59 in wrapped [1380,60)", minuteInWindow(59,   W(1380, 60)), true);
assert("60 NOT in wrapped [1380,60)", minuteInWindow(60,W(1380, 60)), false); // half-open
assert("1380 in wrapped",   minuteInWindow(1380, W(1380, 60)), true);
assert("1439 in wrapped",   minuteInWindow(1439, W(1380, 60)), true);

// ── Overlap (half-open: adjacent = 0 overlap) ─────────────────────────────────
console.log("\n[Overlap — Half-Open Semantics]");
assertApprox("normal overlap 60",        calculateTemporalOverlap(W(60,180), W(120,240)).overlapMinutes, 60);
assertApprox("adjacent NO overlap",      calculateTemporalOverlap(W(60,120), W(120,180)).overlapMinutes, 0); // CRITICAL
assertApprox("identical overlap",        calculateTemporalOverlap(W(60,120), W(60,120)).overlapMinutes, 60);
assertApprox("contained overlap",        calculateTemporalOverlap(W(60,300), W(120,180)).overlapMinutes, 60);
assertApprox("no overlap before",        calculateTemporalOverlap(W(60,120), W(180,240)).overlapMinutes, 0);
assertApprox("full day overlap",         calculateTemporalOverlap(W(0,1440), W(600,900)).overlapMinutes, 300);
assertApprox("1440 sentinel overlap",    calculateTemporalOverlap(W(1380,1440), W(1400,1440)).overlapMinutes, 40);
assertApprox("wrapped vs normal",        calculateTemporalOverlap(W(1380,60), W(0,120)).overlapMinutes, 60);
assertApprox("wrapped vs wrapped",       calculateTemporalOverlap(W(1380,60), W(1320,30)).overlapMinutes, 90);
assertApprox("wrap vs no-overlap zone",  calculateTemporalOverlap(W(1380,60), W(180,300)).overlapMinutes, 0);

// Symmetry property
console.log("\n[Symmetry]");
for (const [sa,ea,sb,eb] of [[60,120,90,150],[1380,60,0,120],[0,1440,600,900],[1320,30,1380,60]] as [number,number,number,number][]) {
  const ab = calculateTemporalOverlap(W(sa,ea), W(sb,eb)).overlapMinutes;
  const ba = calculateTemporalOverlap(W(sb,eb), W(sa,ea)).overlapMinutes;
  assertApprox(`symmetric [${sa},${ea}) vs [${sb},${eb})`, ab, ba);
}

// ── Containment ───────────────────────────────────────────────────────────────
console.log("\n[Containment]");
assert("outer contains inner",   temporalWindowContains(W(60,300), W(120,180)), true);
assert("inner not contain outer",temporalWindowContains(W(120,180), W(60,300)), false);
assert("same window contains",   temporalWindowContains(W(60,120), W(60,120)), true);
assert("full-day contains hour", temporalWindowContains(W(0,1440), W(600,660)), true);
assert("wrapped contains inner", temporalWindowContains(W(1380,120), W(0,60)), true);

// ── Adjacency ────────────────────────────────────────────────────────────────
console.log("\n[Adjacency — Half-Open]");
assert("[60,120) adj [120,180)",   temporalWindowAdjacent(W(60,120), W(120,180)), true); // endA=startB
assert("[120,180) adj [60,120)",   temporalWindowAdjacent(W(120,180), W(60,120)), true); // symmetric
assert("[60,120) not adj [180,240)",temporalWindowAdjacent(W(60,120), W(180,240)), false);
assert("midnight adj: [1380,1440) adj [0,60)", temporalWindowAdjacent(W(1380,1440), W(0,60)), true);

// ── Distance ─────────────────────────────────────────────────────────────────
console.log("\n[Distance]");
assertApprox("60 min gap",   distanceBetweenTemporalWindows(W(60,120), W(180,240)), 60);
assertApprox("0 for overlap",distanceBetweenTemporalWindows(W(60,180), W(120,240)), 0);
assertApprox("0 for adjacent",distanceBetweenTemporalWindows(W(60,120), W(120,180)), 0);

// ── Merge ────────────────────────────────────────────────────────────────────
console.log("\n[Merge]");
const m1 = mergeTemporalWindows(W(60,120), W(120,180));
assert("merged start", m1.startMinute, 60);
assert("merged end",   m1.endMinute,   180);
assert("merged dur",   m1.durationMinutes, 120);
assertThrows("merge non-adjacent", () => mergeTemporalWindows(W(60,120), W(240,300)));

// ── Subtract ─────────────────────────────────────────────────────────────────
console.log("\n[Subtract]");
const sub1 = subtractTemporalWindows(W(60,300), W(120,180));
assert("middle cut count", sub1.length, 2);
assert("left piece",  sub1[0].startMinute, 60);
assert("left end",    sub1[0].endMinute,   120);
assert("right piece", sub1[1].startMinute, 180);
assert("right end",   sub1[1].endMinute,   300);

const sub2 = subtractTemporalWindows(W(60,120), W(60,120));
assert("fully covered = empty", sub2.length, 0);

const sub3 = subtractTemporalWindows(W(60,300), W(0,60));
assert("no-overlap subtract unchanged", sub3.length, 1);
assert("unchanged start", sub3[0].startMinute, 60);

// No overlap after subtract invariant
const base = W(60, 300);
const cut  = W(120, 180);
const remainders = subtractTemporalWindows(base, cut);
for (const r of remainders) {
  const ov = calculateTemporalOverlap(r, cut).overlapMinutes;
  assertApprox("no overlap after subtract", ov, 0);
}

// ── Non-negative Duration Invariant ──────────────────────────────────────────
console.log("\n[Non-negative Duration]");
for (const [s,e] of [[0,60],[60,120],[1380,1440],[1380,60],[0,1440]] as [number,number][]) {
  assert(`duration >= 0 [${s},${e})`, W(s,e).durationMinutes >= 0, true);
}

// ── Format ────────────────────────────────────────────────────────────────────
console.log("\n[Format]");
assert("format full-day", formatTemporalWindow(W(0,1440)), "[00:00, 24:00)  24h");
assert("format hour",     formatTemporalWindow(W(60,120)), "[01:00, 02:00)  1h");

// ── Randomized Property Tests ─────────────────────────────────────────────────
console.log("\n[Randomized Property Tests (50 cases)]");
const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
let propPassed = 0, propFailed = 0;

for (let i = 0; i < 50; i++) {
  const sa = rng(0, 1380), ea = rng(sa + 1, Math.min(sa + 480, 1440));
  const sb = rng(0, 1380), eb = rng(sb + 1, Math.min(sb + 480, 1440));
  const a = tryCreateTemporalWindow(sa, ea);
  const b = tryCreateTemporalWindow(sb, eb);
  if (!a || !b) continue;

  // Symmetry
  const ab = calculateTemporalOverlap(a, b).overlapMinutes;
  const ba = calculateTemporalOverlap(b, a).overlapMinutes;
  if (Math.abs(ab - ba) > 0.001) { console.error(`  ❌ Symmetry failed: [${sa},${ea}) vs [${sb},${eb}): ${ab} != ${ba}`); propFailed++; }
  else propPassed++;

  // Non-negative overlap
  if (ab < 0) { console.error(`  ❌ Negative overlap: [${sa},${ea}) vs [${sb},${eb}): ${ab}`); propFailed++; }
  else propPassed++;

  // Non-negative duration after subtract
  const remainders = subtractTemporalWindows(a, b);
  for (const r of remainders) {
    if (r.durationMinutes < 0) { console.error(`  ❌ Negative duration after subtract`); propFailed++; }
    else propPassed++;
    const ov = calculateTemporalOverlap(r, b).overlapMinutes;
    if (ov > 0.001) { console.error(`  ❌ Overlap after subtract: ${ov}`); propFailed++; }
    else propPassed++;
  }
}

console.log(`  ✅ Random (linear): ${propPassed} checks, ❌ ${propFailed} failures`);
passed += propPassed; failed += propFailed;

// ── Section 4: Topology Safety Tests ─────────────────────────────────────────
console.log("\n[Topology Safety — Wrapped Merging]");
// [1380,60) + [60,120) -> [1380,120)
const tm1 = mergeTemporalWindows(W(1380, 60), W(60, 120));
assert("wrapped + non-wrapped right adj", tm1.startMinute, 1380);
assert("wrapped + non-wrapped right adj end", tm1.endMinute, 120);

// [1320,1380) + [1380,60) -> [1320,60)
const tm2 = mergeTemporalWindows(W(1320, 1380), W(1380, 60));
assert("non-wrapped left adj + wrapped", tm2.startMinute, 1320);
assert("non-wrapped left adj + wrapped end", tm2.endMinute, 60);

// midnight spanning unions: [1380, 1440) + [0, 60) -> [1380, 60)
const tm3 = mergeTemporalWindows(W(1380, 1440), W(0, 60));
assert("midnight spanning merge start", tm3.startMinute, 1380);
assert("midnight spanning merge end", tm3.endMinute, 60);

console.log("\n[Topology Safety — Circular Distance]");
assertApprox("circular wrap right", distanceBetweenTemporalWindows(W(1320, 1380), W(60, 120)), 120);
assertApprox("circular wrap left", distanceBetweenTemporalWindows(W(60, 120), W(1320, 1380)), 120);
assertApprox("linear still closer", distanceBetweenTemporalWindows(W(60, 120), W(180, 240)), 60);
assertApprox("midnight adjacent", distanceBetweenTemporalWindows(W(1380, 1440), W(0, 60)), 0);

console.log("\n[Topology Safety — Sleep/Wake Helper]");
import { createSleepWakeWindow } from "./server/planner/utils/TemporalWindow";
const sw1 = createSleepWakeWindow(1380, 420);
assert("sleep wrap start", sw1?.startMinute, 1380);
assert("sleep wrap end", sw1?.endMinute, 420);
assert("sleep wrap flag", sw1?.wrapsMidnight, true);

const sw2 = createSleepWakeWindow(0, 480);
assert("sleep no-wrap start", sw2?.startMinute, 0);
assert("sleep no-wrap end", sw2?.endMinute, 480);
assert("sleep no-wrap flag", sw2?.wrapsMidnight, false);

const sw3 = createSleepWakeWindow(1380, 1440);
assert("sleep to midnight start", sw3?.startMinute, 1380);
assert("sleep to midnight end", sw3?.endMinute, 1440);
assert("sleep to midnight flag", sw3?.wrapsMidnight, false);

assert("degenerate sleep/wake", createSleepWakeWindow(420, 420), null);

console.log("\n[Randomized Topology Tests (50 cases)]");
let topPassed = 0, topFailed = 0;
for (let i = 0; i < 50; i++) {
  // Generate random wrapped and normal windows
  const w1Start = rng(0, 1439);
  const w1Dur = rng(15, 480);
  const w1End = w1Start + w1Dur > 1440 ? (w1Start + w1Dur) % 1440 : w1Start + w1Dur;
  if (w1End === 0 || w1Start === w1End) continue;
  
  const w1 = tryCreateTemporalWindow(w1Start, w1End);
  
  const w2Start = w1End; // adjacent
  const w2Dur = rng(15, 480);
  const w2End = w2Start + w2Dur > 1440 ? (w2Start + w2Dur) % 1440 : w2Start + w2Dur;
  if (w2End === 0 || w2Start === w2End) continue;
  
  const w2 = tryCreateTemporalWindow(w2Start, w2End);
  
  if (!w1 || !w2) continue;

  try {
    const merged = mergeTemporalWindows(w1, w2);
    // Invariants
    if (!temporalWindowContains(merged, w1)) { console.error(`  ❌ Merged doesn't contain w1`); topFailed++; }
    else topPassed++;
    
    if (!temporalWindowContains(merged, w2)) { console.error(`  ❌ Merged doesn't contain w2`); topFailed++; }
    else topPassed++;
    
    if (merged.durationMinutes < w1.durationMinutes || merged.durationMinutes < w2.durationMinutes) {
      console.error(`  ❌ Merged duration shrunk`); topFailed++;
    } else topPassed++;
  } catch (e) {
    console.error(`  ❌ Merge failed unexpectedly: ${e}`); topFailed++;
  }
}
console.log(`  ✅ Random (topology): ${topPassed} checks, ❌ ${topFailed} failures`);
passed += topPassed; failed += topFailed;

// ── Result ────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(55)}`);
console.log(`Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) { console.error("FAILURES DETECTED — temporal algebra is NOT safe"); process.exit(1); }
else             { console.log("✅ All temporal algebra invariants satisfied"); }
