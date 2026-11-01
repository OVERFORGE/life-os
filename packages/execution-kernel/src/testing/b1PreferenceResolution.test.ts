/**
 * b1PreferenceResolution.test.ts
 *
 * Unit tests verifying Loop 2 (WP1) PreferenceResolutionHelper:
 * - Timezone resolution (explicit override, DB lookup fallback)
 * - 5-tier preference hierarchy integration
 * - Quiet hours calculation respecting local timezone
 */

import test from "node:test";
import assert from "node:assert/strict";
import { PreferenceResolutionHelper } from "../worldv2/PreferenceResolutionHelper";
import { PreferenceAuthorityManager } from "../user/PreferenceAuthorityManager";

test("LOOP 2 (WP1): Preference Authority & User Timezone Wiring", async (suite) => {
  const prefManager = PreferenceAuthorityManager.getInstance();

  await suite.test("PREF-01: Explicit timezone override takes precedence over fallback", async () => {
    const result = await PreferenceResolutionHelper.resolveUserTimezone("user_explicit_tz", "America/New_York");
    assert.equal(result.timezone, "America/New_York");
    assert.equal(result.isFallback, false);
  });

  await suite.test("PREF-02: Missing user / disconnected DB falls back to UTC with fallback flag", async () => {
    const result = await PreferenceResolutionHelper.resolveUserTimezone("user_no_tz_found");
    assert.equal(result.timezone, "UTC");
    assert.equal(result.isFallback, true);
  });

  await suite.test("PREF-03: PreferenceAuthorityManager overrides default wake/sleep minutes", async () => {
    const testUserId = `user_pref_test_${Date.now()}`;

    // Set an explicit soft preference for wake minute (07:30 = 450) and sleep minute (23:30 = 1410)
    await prefManager.setPreference(testUserId, {
      key: "wake_minute",
      value: 450,
      authority: "EXPLICIT_SOFT",
      confidence: 1.0,
      provenance: {
        source: "manual",
        sourceId: "user_settings_test",
        subsystem: "TestRunner",
        extractedAt: Date.now(),
      },
      lastReinforced: Date.now(),
    });

    await prefManager.setPreference(testUserId, {
      key: "sleep_minute",
      value: 1410,
      authority: "EXPLICIT_SOFT",
      confidence: 1.0,
      provenance: {
        source: "manual",
        sourceId: "user_settings_test",
        subsystem: "TestRunner",
        extractedAt: Date.now(),
      },
      lastReinforced: Date.now(),
    });

    const context = await PreferenceResolutionHelper.resolveUserContext(testUserId, "Asia/Kolkata");

    assert.equal(context.timezone, "Asia/Kolkata");
    assert.equal(context.isTimezoneFallback, false);
    assert.equal(context.wakeMinute, 450, "Wake minute should be 450 (07:30)");
    assert.equal(context.sleepMinute, 1410, "Sleep minute should be 1410 (23:30)");
    assert.equal(context.focusBlockThresholdMinutes, 90, "Default focus block threshold");
  });

  await suite.test("PREF-04: Quiet hours correctly evaluated in local timezone", () => {
    // 23:30 UTC = 05:00 next day in Asia/Kolkata (+5:30)
    // 05:00 is within 22:00 to 07:00 quiet hours!
    const testTimeUtc = new Date("2026-10-30T23:30:00Z").getTime();

    // In UTC, 23:30 is between 22:00 and 07:00 (quiet hours)
    assert.equal(PreferenceResolutionHelper.isQuietHours(testTimeUtc, "UTC", 22, 7), true);

    // In America/New_York (UTC-4), 23:30 UTC is 19:30 (7:30 PM) -> NOT quiet hours!
    assert.equal(PreferenceResolutionHelper.isQuietHours(testTimeUtc, "America/New_York", 22, 7), false);

    // In Asia/Kolkata (UTC+5:30), 23:30 UTC is 05:00 AM -> IS quiet hours!
    assert.equal(PreferenceResolutionHelper.isQuietHours(testTimeUtc, "Asia/Kolkata", 22, 7), true);
  });
});

