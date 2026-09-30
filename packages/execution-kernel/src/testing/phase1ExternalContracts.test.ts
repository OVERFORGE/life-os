import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ProviderRegistry,
  CapabilityPresentationRegistry,
  ExternalCapabilityAdapter,
  ITransportClient,
  TransportRequest,
  TransportResponse,
  ExternalCapabilityPayload,
  Supervisor,
} from "../orchestration";
import { ActionProposal } from "../orchestration/contracts/ActionProposalContracts";
import { AvenStreamEvent } from "../orchestration/contracts/AvenStreamContracts";

// Mock transport client for deterministic tests
class MockTransportClient implements ITransportClient {
  constructor(
    public readonly transportType: "LOCAL_STDIO" | "STREAMABLE_HTTP" | "SSE" | "NATIVE_BRIDGE" = "STREAMABLE_HTTP",
    private responseGenerator?: (req: TransportRequest) => Promise<TransportResponse>
  ) {}

  networkCallCount = 0;

  async execute(request: TransportRequest): Promise<TransportResponse> {
    this.networkCallCount++;
    if (this.responseGenerator) {
      return await this.responseGenerator(request);
    }
    return {
      success: true,
      data: { status: "ok", executedCapability: request.capabilityURN },
      durationMs: 25,
    };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}

test("MCP V2: ProviderRegistry catalogs core providers deterministically", () => {
  const registry = ProviderRegistry.getInstance();
  const all = registry.getAll();

  assert.ok(all.length >= 6, "At least 6 providers must be registered");

  const calendar = registry.get("google_calendar");
  assert.ok(calendar, "Google Calendar must exist");
  assert.equal(calendar?.displayName, "Google Calendar");
  assert.ok(calendar?.advertisedCapabilities.includes("productivity.calendar.read_events"));
  assert.ok(calendar?.advertisedCapabilities.includes("productivity.calendar.create_event"));

  const spotify = registry.get("spotify");
  assert.ok(spotify, "Spotify must exist");
  assert.equal(spotify?.displayName, "Spotify");
  assert.ok(spotify?.advertisedCapabilities.includes("wellness.media.playback_control"));

  const github = registry.get("github");
  assert.ok(github, "GitHub must exist");
  assert.ok(github?.advertisedCapabilities.includes("productivity.git.list_prs"));

  const gmail = registry.get("gmail");
  assert.ok(gmail, "Gmail must exist");
  assert.ok(gmail?.advertisedCapabilities.includes("productivity.email.send_message"));

  // Reverse index check
  const calendarProviders = registry.findProvidersForCapability("productivity.calendar.read_events");
  assert.ok(calendarProviders.includes("google_calendar"));
});

test("MCP V2: CapabilityPresentationRegistry provides calm, non-technical translations with zero emojis", () => {
  const registry = CapabilityPresentationRegistry.getInstance();

  const calendarPres = registry.get("productivity.calendar.read_events");
  assert.equal(calendarPres.displayName, "Calendar Events");
  assert.equal(calendarPres.iconName, "Calendar");
  assert.equal(calendarPres.actionLabel, "Checking calendar");
  assert.equal(calendarPres.progressPhrase, "Looking at your schedule...");
  assert.equal(calendarPres.completedPhrase, "Schedule checked");

  // Invariant Audit: Zero emojis in any human strings
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.ok(!emojiRegex.test(calendarPres.displayName), "No emojis in displayName");
  assert.ok(!emojiRegex.test(calendarPres.actionLabel), "No emojis in actionLabel");
  assert.ok(!emojiRegex.test(calendarPres.progressPhrase), "No emojis in progressPhrase");
  assert.ok(!emojiRegex.test(calendarPres.completedPhrase), "No emojis in completedPhrase");

  const spotifyPres = registry.get("wellness.media.playback_control");
  assert.equal(spotifyPres.displayName, "Music");
  assert.equal(spotifyPres.iconName, "Music");
  assert.equal(spotifyPres.actionLabel, "Controlling music");

  const mailPres = registry.get("productivity.email.send_message");
  assert.equal(mailPres.iconName, "Mail");
  assert.equal(mailPres.actionLabel, "Sending email");
});

test("MCP V2: ExternalCapabilityAdapter executes safely and respects replay protection", async () => {
  const mockTransport = new MockTransportClient();
  const adapter = new ExternalCapabilityAdapter({
    transportFactory: () => mockTransport,
    tokenResolver: async () => ({ accessToken: "test_token_123" }),
  });

  const payload: ExternalCapabilityPayload<"productivity.calendar.read_events"> = {
    capabilityURN: "productivity.calendar.read_events",
    providerId: "google_calendar",
    parameters: { timeMin: "2026-09-26T00:00:00Z", timeMax: "2026-09-26T23:59:59Z" },
  };

  const proposal: ActionProposal = {
    id: "prop_ext_1",
    actionType: "external_capability_action",
    domain: "productivity",
    riskClass: "READ_ONLY",
    reversibility: "atomic_single_doc",
    state: "APPROVED",
    title: "Read calendar",
    rationale: "Checking tomorrow schedule",
    payload,
    requiresConfirmation: false,
    estimatedImpact: "Read calendar events",
    idempotencyKey: "idem_ext_1",
    dependencies: [],
  };

  // 1. Live execution
  const liveResult = await adapter.execute(proposal, "user_123", { mode: "LIVE" });
  assert.ok(liveResult.success, "Live execution should succeed");
  assert.equal(mockTransport.networkCallCount, 1, "Should make 1 network call in LIVE mode");

  // 2. Replay execution with snapshot
  const replayResult = await adapter.execute(proposal, "user_123", {
    mode: "REPLAY",
    replaySnapshot: {
      success: true,
      data: { events: [{ title: "Morning Sync", time: "10:00" }] },
    },
  });
  assert.ok(replayResult.success, "Replay execution should succeed");
  assert.equal(
    mockTransport.networkCallCount,
    1,
    "Zero network calls must be made during REPLAY mode (Invariant 10)"
  );
  assert.equal(replayResult.data.events[0].title, "Morning Sync");
});

test("MCP V2: ExternalCapabilityAdapter throws UNKNOWN_EXTERNAL_STATE on timeout", async () => {
  const timeoutTransport = new MockTransportClient("STREAMABLE_HTTP", async () => {
    // Hang until abort
    await new Promise((res) => setTimeout(res, 500));
    return { success: true, data: {} };
  });

  const adapter = new ExternalCapabilityAdapter({
    transportFactory: () => timeoutTransport,
    tokenResolver: async () => ({ accessToken: "test_token_123" }),
  });

  const payload: ExternalCapabilityPayload<"productivity.calendar.read_events"> = {
    capabilityURN: "productivity.calendar.read_events",
    providerId: "google_calendar",
    parameters: { timeMin: "2026-09-26T00:00:00Z", timeMax: "2026-09-26T23:59:59Z" },
    policy: {
      timeoutMs: 50, // 50ms timeout
      retryLimit: 0,
      retryBackoffMs: 10,
      idempotencyWindowSeconds: 60,
      rateLimitTier: "NORMAL",
      failureClassification: "UNKNOWN_EXTERNAL_STATE",
    },
  };

  const proposal: ActionProposal = {
    id: "prop_ext_timeout",
    actionType: "external_capability_action",
    domain: "productivity",
    riskClass: "READ_ONLY",
    reversibility: "atomic_single_doc",
    state: "APPROVED",
    title: "Read calendar timeout test",
    rationale: "Timeout testing",
    payload,
    requiresConfirmation: false,
    estimatedImpact: "Timeout test",
    idempotencyKey: "idem_ext_timeout",
    dependencies: [],
  };

  const result = await adapter.execute(proposal, "user_123", { mode: "LIVE" });
  assert.equal(result.success, false);
  assert.ok(
    result.error?.message.includes("UNKNOWN_EXTERNAL_STATE"),
    "Timeout must yield UNKNOWN_EXTERNAL_STATE (Invariant 7)"
  );
});

test("Real-Time Execution Stream: Supervisor emits tool activity events and final streamed response", async () => {
  const supervisor = Supervisor.createDefault();
  const emittedEvents: AvenStreamEvent[] = [];

  const response = await supervisor.processRequest({
    userId: "test_user_spotify",
    message: "Play some focus music",
    onEvent: (event) => {
      emittedEvents.push(event);
    },
  });

  assert.ok(response.response.length > 0);

  // Check event sequence
  const statusEvents = emittedEvents.filter((e) => e.type === "status");
  assert.ok(statusEvents.some((e) => (e as any).status === "understanding"));

  const toolEvents = emittedEvents.filter((e) => e.type === "tool_activity");
  assert.ok(toolEvents.length > 0, "Must emit tool activity event for Spotify");
  const spotifyTool = toolEvents[0] as any;
  assert.equal(spotifyTool.providerDisplayName, "Spotify");
  assert.equal(spotifyTool.iconName, "Music");

  const deltaEvents = emittedEvents.filter((e) => e.type === "assistant_delta");
  assert.ok(deltaEvents.length > 0, "Must emit assistant delta stream");
});

test("Missing Connection UX: Disconnected provider produces human guidance and inline connect prompt", async () => {
  const supervisor = Supervisor.createDefault();
  const emittedEvents: AvenStreamEvent[] = [];

  // Override checkProviderConnection to report disconnected for test_user_disconnected
  (supervisor as any).checkProviderConnection = async (userId: string, providerId: string) => {
    if (providerId === "google_calendar") {
      return { connected: false, providerDisplayName: "Google Calendar" };
    }
    return { connected: true, providerDisplayName: providerId };
  };

  const response = await supervisor.processRequest({
    userId: "test_user_disconnected",
    message: "Schedule a meeting with Alex tomorrow at 3",
    onEvent: (event) => {
      emittedEvents.push(event);
    },
  });

  // Verify response is human-readable and doesn't leak raw errors
  assert.ok(
    response.response.includes("Google Calendar isn't connected yet"),
    `Response was: "${response.response}"`
  );
  assert.ok(!response.response.includes("AUTH_NOT_CONFIGURED"));
  assert.ok(!response.response.includes("MCP_SERVER_UNAVAILABLE"));

  // Verify missing_connection event
  const missingEvents = emittedEvents.filter((e) => e.type === "missing_connection");
  assert.equal(missingEvents.length, 1);
  const missingEv = missingEvents[0] as any;
  assert.equal(missingEv.providerId, "google_calendar");
  assert.equal(missingEv.providerDisplayName, "Google Calendar");
  assert.equal(missingEv.connectUrl, "/settings/connections");

  // Verify pending operation continuation registered
  assert.ok(response.pendingOperation, "Must register pending operation for continuation");
  assert.equal(response.pendingOperation.state, "AWAITING_CLARIFICATION");
});

test("Multi-Tool Execution UX: Compound request emits multiple tool activity cards", async () => {
  const supervisor = Supervisor.createDefault();
  const emittedEvents: AvenStreamEvent[] = [];

  // Ensure providers are connected
  (supervisor as any).checkProviderConnection = async (userId: string, providerId: string) => {
    return { connected: true, providerDisplayName: providerId === "spotify" ? "Spotify" : "Google Calendar" };
  };

  const response = await supervisor.processRequest({
    userId: "test_user_multitool",
    message: "I'm stressed. Put on some calm music and tell me what I have left today.",
    onEvent: (event) => {
      emittedEvents.push(event);
    },
  });

  assert.ok(response.response.length > 0);

  const toolEvents = emittedEvents.filter((e) => e.type === "tool_activity");
  assert.ok(toolEvents.length >= 2, "Must emit tool activities for both Spotify and Calendar");

  const providers = toolEvents.map((t: any) => t.providerDisplayName);
  assert.ok(providers.includes("Spotify"), "Spotify activity must be present");
  assert.ok(providers.includes("Google Calendar"), "Google Calendar activity must be present");
});

test("Invariant 9: KernelCapabilityService NEVER fakes success when adapter returns failure", async () => {
  const { KernelCapabilityService } = await import("../orchestration/kernel/KernelCapabilityService");
  const { ActionAdapterRegistry } = await import("../orchestration/kernel/ActionAdapters");

  const customRegistry = new ActionAdapterRegistry();
  // Register a mock adapter that returns success: false
  customRegistry.register("external_capability_action", {
    validatePreconditions: async () => ({ valid: true }),
    execute: async () => ({
      success: false,
      status: "FAILED",
      error: { message: "No active Spotify player found. Please open Spotify on your phone, desktop, or web player first." },
      capabilityURN: "wellness.media.playback_control",
      providerId: "spotify",
    }),
    compensate: async () => ({ compensated: true }),
  });

  const kernel = new KernelCapabilityService(customRegistry);
  const proposal: ActionProposal = {
    id: "prop_spotify_test_inv9",
    planId: "plan_inv9",
    actionType: "external_capability_action" as any,
    domain: "wellness",
    riskClass: "LOW_ATOMIC",
    reversibility: "atomic_single_doc",
    state: "PROPOSED",
    title: "Play Taylor Swift",
    rationale: "Music playback",
    payload: {
      capabilityURN: "wellness.media.playback_control",
      providerId: "spotify",
      parameters: { command: "PLAY", query: "Taylor Swift" },
    },
    dependencies: [],
  };

  const validation = await kernel.validateActionProposals("test_user_inv9", [proposal]);
  assert.equal(validation.valid, true);

  const results = await kernel.executeActionBatch("test_user_inv9", validation.validDecisions);
  assert.equal(results.length, 1);
  assert.equal(results[0].success, false, "Result MUST NOT be marked success: true when adapter failed!");
  assert.equal(results[0].status, "FAILED");
  assert.ok(results[0].error?.includes("No active Spotify player found"));

  // Check audit store
  const audit = kernel.getAuditRecord(results[0].idempotencyKey);
  assert.equal(audit?.status, "FAILED", "Audit store must record FAILED status, never SUCCEEDED!");

  // Verify GroundedResponseGenerator truthful failure output
  const { GroundedResponseGenerator } = await import("../orchestration/grounding/GroundedResponseGenerator");
  const generator = GroundedResponseGenerator.getInstance();
  const semanticTurn = {
    turnId: "turn_inv9",
    operations: [
      {
        operationId: "op_inv9",
        actionType: "external_capability_action" as any,
        domain: "wellness" as any,
        riskClass: "LOW_ATOMIC" as any,
        executionEligibility: "IMMEDIATELY_EXECUTABLE" as any,
        dependencies: [],
        payload: proposal.payload,
      },
    ],
    conversationalSummary: "Play music",
  };

  const responseText = generator.generateResponse(semanticTurn as any, results);
  assert.ok(
    responseText.includes("no active playback device was found"),
    `Response was: "${responseText}" — must explain active playback device required`
  );
  assert.ok(
    !responseText.includes("Done: Completed ."),
    `Response was: "${responseText}" — must NOT produce "Done: Completed ."`
  );
});

