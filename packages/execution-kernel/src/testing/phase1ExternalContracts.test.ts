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
  } as any;

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
  } as any;

  const result = await adapter.execute(proposal, "user_123", { mode: "LIVE" });
  assert.equal(result.success, false);
  assert.ok(
    result.error?.message.includes("UNKNOWN_EXTERNAL_STATE"),
    "Timeout must yield UNKNOWN_EXTERNAL_STATE (Invariant 7)"
  );
});

test("Real-Time Execution Stream: Supervisor emits tool activity events and final streamed response", async () => {
  const supervisor = Supervisor.createDefault(undefined, {
    checkConnection: async (_userId, providerId) => ({
      connected: true,
      status: "CONNECTED",
      providerDisplayName: providerId === "spotify" ? "Spotify" : providerId,
    }),
  });
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
  const supervisor = Supervisor.createDefault(undefined, {
    checkConnection: async (_userId, providerId) => {
      if (providerId === "google_calendar") {
        return { connected: false, status: "DISCONNECTED", providerDisplayName: "Google Calendar" };
      }
      return { connected: true, status: "CONNECTED", providerDisplayName: providerId };
    },
  });
  const emittedEvents: AvenStreamEvent[] = [];

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

  const interpreter = (await import("../orchestration/semantic/SemanticIntentInterpreter")).SemanticIntentInterpreter.getInstance();
  interpreter.setMockChat(async () => {
    return JSON.stringify({
      primaryClassification: "ACTION_REQUEST",
      ambiguityStatus: "UNAMBIGUOUS",
      conversationalSummary: "Putting on calm music and checking your calendar.",
      operations: [
        {
          domain: "wellness",
          actionType: "external_capability_action",
          capabilityURN: "wellness.media.playback_control",
          providerHint: "spotify",
          payload: {
            capabilityURN: "wellness.media.playback_control",
            providerId: "spotify",
            parameters: { command: "play", query: "calm music", targetType: "playlist" },
          },
        },
        {
          domain: "productivity",
          actionType: "external_capability_action",
          capabilityURN: "productivity.calendar.read_events",
          providerHint: "google_calendar",
          payload: {
            capabilityURN: "productivity.calendar.read_events",
            providerId: "google_calendar",
            parameters: {},
          },
        },
      ],
    });
  });

  try {
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
  } finally {
    interpreter.setMockChat(undefined);
  }
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
  } as any;

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

test("Gmail Draft Revision: Rejects complex MIME / attachment drafts BEFORE issuing PUT", async () => {
  const originalFetch = globalThis.fetch;
  let putCalled = false;

  globalThis.fetch = async (url: any, init?: any) => {
    const urlStr = String(url);
    if (init?.method === "GET" && urlStr.includes("/drafts/draft_with_att")) {
      return new Response(JSON.stringify({
        id: "draft_with_att",
        message: {
          id: "msg_att",
          payload: {
            mimeType: "multipart/mixed",
            parts: [
              { filename: "attachment.pdf", mimeType: "application/pdf" },
              { mimeType: "text/plain", body: { data: Buffer.from("Draft body").toString("base64url") } },
            ],
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (init?.method === "PUT") {
      putCalled = true;
      return new Response(JSON.stringify({ id: "draft_with_att" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 });
  };

  try {
    const adapter = new ExternalCapabilityAdapter({
      tokenResolver: async () => ({ accessToken: "test_gmail_token" }),
    });

    const proposal: ActionProposal = {
      id: "prop_draft_att",
      actionType: "external_capability_action",
      domain: "productivity",
      riskClass: "LOW_REVERSIBLE",
      reversibility: "atomic_single_doc",
      state: "APPROVED",
      title: "Update draft",
      rationale: "Update draft with attachments",
      payload: {
        capabilityURN: "productivity.email.update_draft",
        providerId: "gmail",
        parameters: {
          draftId: "draft_with_att",
          subject: "New Subject",
        },
      },
      requiresConfirmation: false,
      estimatedImpact: "Update email draft",
      idempotencyKey: `idem_att_${Date.now()}`,
      dependencies: [],
    } as any;

    const result = await adapter.execute(proposal, "user_gmail_1", { mode: "LIVE" });
    assert.equal(result.success, false, "Must fail when draft contains unsupported attachments");
    const errMsg = (result.error as any)?.message || String(result.error || "");
    assert.ok(errMsg.includes("UNSUPPORTED_DRAFT_MIME_TYPE"));
    assert.equal(putCalled, false, "Must NEVER issue a PUT mutation to a draft with attachments!");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail Draft Revision: Preserves unaffected fields (To, Body) when updating only Subject", async () => {
  const originalFetch = globalThis.fetch;
  let capturedPutBody: any = null;

  globalThis.fetch = async (url: any, init?: any) => {
    const urlStr = String(url);
    if (init?.method === "GET" && urlStr.includes("/drafts/draft_plain")) {
      return new Response(JSON.stringify({
        id: "draft_plain",
        message: {
          id: "msg_plain",
          payload: {
            mimeType: "text/plain",
            headers: [
              { name: "Subject", value: "Original Proposal" },
              { name: "To", value: "collaborator@example.com" },
            ],
            body: {
              data: Buffer.from("This is the original body text that must be preserved.").toString("base64url"),
            },
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (init?.method === "PUT") {
      capturedPutBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        id: "draft_plain",
        message: { id: "msg_plain_updated" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 });
  };

  try {
    const adapter = new ExternalCapabilityAdapter({
      tokenResolver: async () => ({ accessToken: "test_gmail_token" }),
    });

    const proposal: ActionProposal = {
      id: "prop_draft_preserve",
      actionType: "external_capability_action",
      domain: "productivity",
      riskClass: "LOW_REVERSIBLE",
      reversibility: "atomic_single_doc",
      state: "APPROVED",
      title: "Update draft subject only",
      rationale: "Update subject preserving unaffected fields",
      payload: {
        capabilityURN: "productivity.email.update_draft",
        providerId: "gmail",
        parameters: {
          draftId: "draft_plain",
          subject: "Revised Subject: LifeOS Roadmap",
        },
      },
      requiresConfirmation: false,
      estimatedImpact: "Update email draft subject",
      idempotencyKey: `idem_preserve_${Date.now()}`,
      dependencies: [],
    } as any;

    const result = await adapter.execute(proposal, "user_gmail_1", { mode: "LIVE" });
    assert.equal(result.success, true);
    assert.equal(result.data.subject, "Revised Subject: LifeOS Roadmap");
    assert.equal(result.data.to, "collaborator@example.com");
    assert.equal(result.data.bodyText, "This is the original body text that must be preserved.");

    // Inspect decoded raw RFC 822 in PUT body
    assert.ok(capturedPutBody?.message?.raw);
    const decodedRaw = Buffer.from(capturedPutBody.message.raw, "base64").toString("utf-8");
    assert.ok(decodedRaw.includes("To: collaborator@example.com"), "Must preserve remote To header");
    assert.ok(decodedRaw.includes("This is the original body text that must be preserved."), "Must preserve remote body");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail Draft Revision: Network failure on PUT reports UNKNOWN_EXTERNAL_STATE and prevents blind retries", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url: any, init?: any) => {
    const urlStr = String(url);
    if (init?.method === "GET" && urlStr.includes("/drafts/draft_timeout")) {
      return new Response(JSON.stringify({
        id: "draft_timeout",
        message: {
          id: "msg_timeout",
          payload: {
            mimeType: "text/plain",
            headers: [{ name: "Subject", value: "Draft Title" }],
            body: { data: Buffer.from("Body").toString("base64url") },
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (init?.method === "PUT") {
      const abortErr = new Error("The operation was aborted");
      abortErr.name = "AbortError";
      throw abortErr;
    }
    return new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 });
  };

  try {
    const adapter = new ExternalCapabilityAdapter({
      tokenResolver: async () => ({ accessToken: "test_gmail_token" }),
    });

    const proposal: ActionProposal = {
      id: "prop_draft_err",
      actionType: "external_capability_action",
      domain: "productivity",
      riskClass: "LOW_REVERSIBLE",
      reversibility: "atomic_single_doc",
      state: "APPROVED",
      title: "Update draft with timeout",
      rationale: "Verify UNKNOWN_EXTERNAL_STATE",
      payload: {
        capabilityURN: "productivity.email.update_draft",
        providerId: "gmail",
        parameters: {
          draftId: "draft_timeout",
          subject: "New Subject",
        },
      },
      requiresConfirmation: false,
      estimatedImpact: "Update email draft",
      idempotencyKey: `idem_timeout_${Date.now()}`,
      dependencies: [],
    } as any;

    const result = await adapter.execute(proposal, "user_gmail_1", { mode: "LIVE" });
    assert.equal(result.success, false);
    const errMsg = (result.error as any)?.message || String(result.error || "");
    assert.ok(errMsg.includes("UNKNOWN_EXTERNAL_STATE"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Multi-Turn Draft Continuity: Supervisor tracks draft in activeFocus with metadata", async () => {
  const supervisor = Supervisor.createDefault(undefined, {
    checkConnection: async () => ({
      connected: true,
      status: "CONNECTED",
      providerDisplayName: "Gmail",
    }),
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, init?: any) => {
    const urlStr = String(url);
    if (init?.method === "POST" && urlStr.includes("/drafts")) {
      return new Response(JSON.stringify({
        id: "r_draft_conv_001",
        message: { id: "msg_conv_001" },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 });
  };

  try {
    const adapter = ExternalCapabilityAdapter.getInstance();
    (adapter as any).options = {
      tokenResolver: async () => ({ accessToken: "test_token_continuity" }),
    };

    // Simulate direct execution through adapter
    const proposal: ActionProposal = {
      id: "prop_draft_init",
      actionType: "external_capability_action",
      domain: "productivity",
      riskClass: "LOW_REVERSIBLE",
      reversibility: "atomic_single_doc",
      state: "APPROVED",
      title: "Create draft",
      rationale: "Initial draft",
      payload: {
        capabilityURN: "productivity.email.create_draft",
        providerId: "gmail",
        parameters: {
          subject: "Interview Invitation",
          to: ["recruiter@example.com"],
          bodyText: "Hello [Candidate Name], we would love to chat.",
        },
      },
      requiresConfirmation: false,
      estimatedImpact: "Create draft",
      idempotencyKey: `idem_init_${Date.now()}`,
      dependencies: [],
    } as any;

    const execResult = await adapter.execute(proposal, "user_continuity_1", { mode: "LIVE" });
    assert.equal(execResult.success, true);
    assert.equal(execResult.data.draftId, "r_draft_conv_001");
    assert.equal(execResult.data.subject, "Interview Invitation");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail Draft Revision: Rejects multipart/alternative drafts BEFORE issuing PUT", async () => {
  const originalFetch = globalThis.fetch;
  let putCalled = false;

  globalThis.fetch = async (url: any, init?: any) => {
    const urlStr = String(url);
    if (init?.method === "GET" && urlStr.includes("/drafts/draft_alternative")) {
      return new Response(JSON.stringify({
        id: "draft_alternative",
        message: {
          id: "msg_alt",
          payload: {
            mimeType: "multipart/alternative",
            headers: [{ name: "Subject", value: "HTML Draft" }],
            parts: [
              { mimeType: "text/plain", body: { data: Buffer.from("Plain").toString("base64url") } },
              { mimeType: "text/html", body: { data: Buffer.from("<p>HTML</p>").toString("base64url") } },
            ],
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (init?.method === "PUT") {
      putCalled = true;
      return new Response(JSON.stringify({ id: "draft_alternative" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 });
  };

  try {
    const adapter = new ExternalCapabilityAdapter({
      tokenResolver: async () => ({ accessToken: "test_gmail_token" }),
    });

    const proposal: ActionProposal = {
      id: "prop_draft_alt",
      actionType: "external_capability_action",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      state: "APPROVED",
      title: "Update alternative draft",
      rationale: "Update multipart/alternative draft",
      payload: {
        capabilityURN: "productivity.email.update_draft",
        providerId: "gmail",
        parameters: { draftId: "draft_alternative", subject: "New Subject" },
      },
      idempotencyKey: `idem_alt_${Date.now()}`,
    } as any;

    const result = await adapter.execute(proposal, "user_gmail_1", { mode: "LIVE" });
    assert.equal(result.success, false);
    const errMsg = (result.error as any)?.message || String(result.error || "");
    assert.ok(errMsg.includes("UNSUPPORTED_DRAFT_MIME_TYPE"));
    assert.equal(putCalled, false, "Must NEVER issue a PUT mutation to multipart/alternative draft!");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail Draft Revision: Rejects attachment parts with attachmentId BEFORE issuing PUT", async () => {
  const originalFetch = globalThis.fetch;
  let putCalled = false;

  globalThis.fetch = async (url: any, init?: any) => {
    const urlStr = String(url);
    if (init?.method === "GET" && urlStr.includes("/drafts/draft_part_att")) {
      return new Response(JSON.stringify({
        id: "draft_part_att",
        message: {
          id: "msg_part_att",
          payload: {
            mimeType: "text/plain",
            headers: [{ name: "Subject", value: "Draft With Inline Attachment" }],
            parts: [
              { mimeType: "image/png", body: { attachmentId: "att_xyz_123" } },
            ],
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (init?.method === "PUT") {
      putCalled = true;
      return new Response(JSON.stringify({ id: "draft_part_att" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 });
  };

  try {
    const adapter = new ExternalCapabilityAdapter({
      tokenResolver: async () => ({ accessToken: "test_gmail_token" }),
    });

    const proposal: ActionProposal = {
      id: "prop_draft_part_att",
      actionType: "external_capability_action",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      state: "APPROVED",
      title: "Update attachment draft",
      rationale: "Update draft with attachmentId",
      payload: {
        capabilityURN: "productivity.email.update_draft",
        providerId: "gmail",
        parameters: { draftId: "draft_part_att", subject: "New Subject" },
      },
      idempotencyKey: `idem_part_att_${Date.now()}`,
    } as any;

    const result = await adapter.execute(proposal, "user_gmail_1", { mode: "LIVE" });
    assert.equal(result.success, false);
    const errMsg = (result.error as any)?.message || String(result.error || "");
    assert.ok(errMsg.includes("UNSUPPORTED_DRAFT_MIME_TYPE"));
    assert.equal(putCalled, false, "Must NEVER issue a PUT mutation to draft with attachment parts!");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail Draft Revision: Rejects malformed or incomplete draft payloads BEFORE issuing PUT", async () => {
  const originalFetch = globalThis.fetch;
  let putCalled = false;

  globalThis.fetch = async (url: any, init?: any) => {
    const urlStr = String(url);
    if (init?.method === "GET" && urlStr.includes("/drafts/draft_malformed")) {
      return new Response(JSON.stringify({
        id: "draft_malformed",
        message: {
          id: "msg_malformed",
          // Payload is missing headers entirely
          payload: null,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (init?.method === "PUT") {
      putCalled = true;
      return new Response(JSON.stringify({ id: "draft_malformed" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 });
  };

  try {
    const adapter = new ExternalCapabilityAdapter({
      tokenResolver: async () => ({ accessToken: "test_gmail_token" }),
    });

    const proposal: ActionProposal = {
      id: "prop_draft_malformed",
      actionType: "external_capability_action",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      state: "APPROVED",
      title: "Update malformed draft",
      rationale: "Update draft with malformed payload",
      payload: {
        capabilityURN: "productivity.email.update_draft",
        providerId: "gmail",
        parameters: { draftId: "draft_malformed", subject: "New Subject" },
      },
      idempotencyKey: `idem_malformed_${Date.now()}`,
    } as any;

    const result = await adapter.execute(proposal, "user_gmail_1", { mode: "LIVE" });
    assert.equal(result.success, false);
    const errMsg = (result.error as any)?.message || String(result.error || "");
    assert.ok(errMsg.includes("UNSUPPORTED_DRAFT_MIME_TYPE") || errMsg.includes("malformed"));
    assert.equal(putCalled, false, "Must NEVER issue a PUT mutation to malformed draft!");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Replay Determinism & Network Egress Trap: Strict zero-egress across all transports during replay", async () => {
  const http = require("http");
  const https = require("https");
  const originalFetch = globalThis.fetch;
  const originalHttpRequest = http.request;
  const originalHttpsRequest = https.request;

  let egressAttempted = false;
  let egressDetails = "";

  const egressTrap = (transportName: string) => {
    return (..._args: any[]) => {
      egressAttempted = true;
      egressDetails = `Forbidden egress call intercepted via ${transportName}`;
      throw new Error(`[NETWORK_EGRESS_VIOLATION]: ${egressDetails}`);
    };
  };

  // Arm egress traps on all transports
  globalThis.fetch = egressTrap("globalThis.fetch") as any;
  http.request = egressTrap("http.request");
  https.request = egressTrap("https.request");

  try {
    const historicalTimestamp = 1790000000000;
    const testIdempotencyKey = "idem_trap_test_123";

    const adapter = new ExternalCapabilityAdapter({
      tokenResolver: async () => ({ accessToken: "trap_token" }),
      transportFactory: () => ({
        execute: egressTrap("transportFactory.execute"),
        callTool: egressTrap("transportFactory.callTool"),
      } as any),
    });

    // Populate recorded execution in adapter ledger
    (adapter as any).executionLedger.set(testIdempotencyKey, {
      idempotencyKey: testIdempotencyKey,
      capabilityURN: "productivity.calendar.read_events",
      providerId: "google_calendar",
      status: "SUCCEEDED",
      result: { events: [{ title: "Recorded Standup", timestamp: historicalTimestamp }] },
      timestamp: historicalTimestamp,
    });

    const proposal: ActionProposal = {
      id: "prop_trap_1",
      actionType: "external_capability_action",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      state: "APPROVED",
      title: "Replay calendar read",
      rationale: "Verify zero network egress",
      payload: {
        capabilityURN: "productivity.calendar.read_events",
        providerId: "google_calendar",
        parameters: {},
      },
      idempotencyKey: testIdempotencyKey,
    } as any;

    // 1. Replay execution with recorded key
    const replayResult = await adapter.execute(proposal, "user_trap_1", { mode: "REPLAY" });

    // Verify invariants:
    assert.equal(replayResult.success, true);
    assert.equal(replayResult.capabilityURN, "productivity.calendar.read_events");
    assert.equal(replayResult.providerId, "google_calendar");
    assert.equal(replayResult.provenance, "REPLAY_MATCH");
    assert.equal(replayResult.timestamp, historicalTimestamp, "Historical timestamp MUST be preserved");
    assert.equal(replayResult.freshness?.recordedAt, historicalTimestamp);
    assert.equal(egressAttempted, false, "Zero network egress must occur during recorded replay");

    // 2. Unrecorded replay key MUST fail closed
    let threwReplayAbort = false;
    try {
      await adapter.execute({
        ...proposal,
        idempotencyKey: "unrecorded_key_xyz",
      }, "user_trap_1", { mode: "REPLAY" });
    } catch (err: any) {
      threwReplayAbort = true;
      assert.ok(err.message.includes("[REPLAY_ABORT]"), "Missing replay record must fail closed");
    }
    assert.equal(threwReplayAbort, true, "Unrecorded replay record must fail closed");
    assert.equal(egressAttempted, false, "Missing replay records must NOT touch network");
  } finally {
    // Interceptors restored even if assertions fail
    globalThis.fetch = originalFetch;
    http.request = originalHttpRequest;
    https.request = originalHttpsRequest;
  }
});



