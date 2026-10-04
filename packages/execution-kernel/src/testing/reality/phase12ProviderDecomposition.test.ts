import test from "node:test";
import assert from "node:assert/strict";

import { GoogleCalendarProvider } from "../../orchestration/external/providers/GoogleCalendarProvider";
import { SpotifyMediaProvider } from "../../orchestration/external/providers/SpotifyMediaProvider";
import { GitHubProvider } from "../../orchestration/external/providers/GitHubProvider";
import { WeatherProvider } from "../../orchestration/external/providers/WeatherProvider";
import { ModularProviderRouter } from "../../orchestration/external/core/ModularProviderRouter";

test("PHASE 12: External Capability / Provider Decomposition Suite", async (suite) => {
  const testUserId = "test-user-prov-phase12-" + Date.now();
  const baseContext = { userId: testUserId, timeoutMs: 5000 };

  await suite.test("PROV-01: Discrete Provider Modules (Google Calendar, Spotify, GitHub, Weather)", async () => {
    const gcal = new GoogleCalendarProvider();
    const spotify = new SpotifyMediaProvider();
    const github = new GitHubProvider();
    const weather = new WeatherProvider();

    assert.equal(gcal.providerId, "google_calendar");
    assert.equal(spotify.providerId, "spotify");
    assert.equal(github.providerId, "github");
    assert.equal(weather.providerId, "weather");

    // Test Google Calendar creation
    const gcalRes = await gcal.execute(
      "calendar.event.create",
      { title: "Quarterly Planning", startTime: "2026-10-05T10:00:00Z" },
      baseContext
    );
    assert.equal(gcalRes.success, true);
    assert.equal(gcalRes.lifecycleState, "CONFIRMED_EXTERNAL_COMMIT");
    assert.ok((gcalRes.data as any).eventId);

    // Test Spotify playback
    const spotRes = await spotify.execute(
      "wellness.media.playback_control",
      { action: "play" },
      baseContext
    );
    assert.equal(spotRes.success, true);
    assert.equal(spotRes.lifecycleState, "CONFIRMED_EXTERNAL_COMMIT");
    assert.equal((spotRes.data as any).isPlaying, true);

    // Test GitHub issue creation
    const gitRes = await github.execute(
      "productivity.repo.issue_create",
      { repo: "OVERFORGE/life-os", title: "Verify Phase 12 Decomposition" },
      baseContext
    );
    assert.equal(gitRes.success, true);
    assert.equal(gitRes.lifecycleState, "CONFIRMED_EXTERNAL_COMMIT");
    assert.equal((gitRes.data as any).issueNumber, 142);

    // Test Weather query
    const weathRes = await weather.execute(
      "environment.weather.current",
      { location: "London" },
      baseContext
    );
    assert.equal(weathRes.success, true);
    assert.equal(weathRes.lifecycleState, "CONFIRMED_EXTERNAL_COMMIT");
    assert.equal((weathRes.data as any).condition, "Clear");
  });

  await suite.test("PROV-02: Canonical Lifecycle States & Timeout Safety (UNKNOWN_EXTERNAL_STATE)", async () => {
    const gcal = new GoogleCalendarProvider();

    // Case A: Simulated Network Timeout -> UNKNOWN_EXTERNAL_STATE
    const timeoutRes = await gcal.execute(
      "calendar.event.create",
      { title: "Test Timeout Event", simulateTimeout: true },
      baseContext
    );
    assert.equal(timeoutRes.success, false, "Timeout must NEVER be treated as success");
    assert.equal(timeoutRes.lifecycleState, "UNKNOWN_EXTERNAL_STATE");
    assert.equal(timeoutRes.reconciliationRequired, true, "Timeout requires reconciliation");

    // Case B: Simulated 401 Auth Error -> EXTERNAL_REJECTED (No retries)
    const authRes = await gcal.execute(
      "calendar.event.create",
      { title: "Auth Test Event", simulateAuthError: true },
      baseContext
    );
    assert.equal(authRes.success, false);
    assert.equal(authRes.lifecycleState, "EXTERNAL_REJECTED");
    assert.ok(authRes.error?.includes("AUTH_REQUIRED"));
  });

  await suite.test("PROV-03: Pre-Network Payload Validation Gate", async () => {
    const github = new GitHubProvider();

    // Missing repo parameter -> Validation fails before network
    const invalidRes = await github.execute(
      "productivity.repo.issue_create",
      { title: "Issue without repo" }, // Missing repo
      baseContext
    );

    assert.equal(invalidRes.success, false);
    assert.equal(invalidRes.lifecycleState, "EXTERNAL_REJECTED");
    assert.ok(invalidRes.error?.includes("Validation failed"));
  });

  await suite.test("PROV-04: Modular Provider Router Determinism", async () => {
    const router = ModularProviderRouter.getInstance();

    const supportedUrns = router.getAllSupportedURNs();
    assert.ok(supportedUrns.length >= 10);

    // Test calendar route
    const calRes = await router.executeCapability(
      "calendar.event.create",
      { title: "Router Test Event" },
      baseContext
    );
    assert.equal(calRes.success, true);
    assert.equal(calRes.providerId, "google_calendar");

    // Test media route
    const mediaRes = await router.executeCapability(
      "wellness.media.playback_control",
      { command: "pause" },
      baseContext
    );
    assert.equal(mediaRes.success, true);
    assert.equal(mediaRes.providerId, "spotify");

    // Test unsupported URN -> Rejected safely
    const unsuppRes = await router.executeCapability(
      "unknown.unregistered.capability",
      {},
      baseContext
    );
    assert.equal(unsuppRes.success, false);
    assert.equal(unsuppRes.lifecycleState, "EXTERNAL_REJECTED");
  });

  await suite.test("PROV-05: Context Isolation Across Providers", async () => {
    const router = ModularProviderRouter.getInstance();

    const spotifyProvider = router.getProvider("spotify");
    const gcalProvider = router.getProvider("google_calendar");

    assert.notEqual(spotifyProvider, undefined);
    assert.notEqual(gcalProvider, undefined);
    assert.notEqual(spotifyProvider?.providerId, gcalProvider?.providerId);
    assert.deepEqual(
      spotifyProvider?.supportedURNs.some(u => gcalProvider?.supportedURNs.includes(u)),
      false,
      "Provider capabilities must be strictly isolated with zero overlap"
    );
  });
});
