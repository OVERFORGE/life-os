import test from "node:test";
import assert from "node:assert/strict";
import { resolveTemporalExpression } from "../orchestration/semantic/temporalResolver";

test("Timezone-aware relative offset resolution: 'in 2 mins' in Asia/Kolkata", () => {
  // Reference time: 2026-10-05T00:13:00.000Z
  // In Asia/Kolkata (+05:30), this is 2026-10-05 05:43:00
  const refTime = new Date("2026-10-05T00:13:00.000Z").getTime();
  const timezone = "Asia/Kolkata";

  const resolved = resolveTemporalExpression("in 2 mins", timezone, refTime);

  // In 2 minutes from 05:43:00 is 05:45:00
  assert.equal(resolved.dateOnly, "2026-10-05");
  assert.equal(resolved.timeOnly, "05:45");
  assert.equal(resolved.isoTimestamp, "2026-10-05T00:15:00.000Z");
  assert.equal(resolved.timezone, "Asia/Kolkata");
});

test("Timezone-aware relative offset resolution: 'in 1 hour' in America/New_York", () => {
  // Reference time: 2026-10-05T18:30:00.000Z
  // In America/New_York (EDT, UTC-4), this is 2026-10-05 14:30:00
  const refTime = new Date("2026-10-05T18:30:00.000Z").getTime();
  const timezone = "America/New_York";

  const resolved = resolveTemporalExpression("in 1 hour", timezone, refTime);

  // 1 hour later: 15:30:00 EDT = 19:30:00 UTC
  assert.equal(resolved.dateOnly, "2026-10-05");
  assert.equal(resolved.timeOnly, "15:30");
  assert.equal(resolved.isoTimestamp, "2026-10-05T19:30:00.000Z");
});

test("Timezone-aware relative offset across midnight boundary", () => {
  // Reference time: 23:55 local time
  // UTC: 2026-10-05T18:25:00.000Z in Asia/Kolkata (+5:30) is 2026-10-05 23:55:00
  const refTime = new Date("2026-10-05T18:25:00.000Z").getTime();
  const timezone = "Asia/Kolkata";

  const resolved = resolveTemporalExpression("in 10 mins", timezone, refTime);

  // 10 minutes later is next day 00:05:00
  assert.equal(resolved.dateOnly, "2026-10-06");
  assert.equal(resolved.timeOnly, "00:05");
  assert.equal(resolved.isoTimestamp, "2026-10-05T18:35:00.000Z");
});
