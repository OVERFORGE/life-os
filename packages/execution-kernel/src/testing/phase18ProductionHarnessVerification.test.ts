/**
 * Phase 18: Production Harness Maturity Verification Suite (V2.2 Audit)
 * 
 * Independently verifies:
 * 1. Task Resolution Safety: Exact ID, Exact Title, Quoted Title, Ambiguous, Non-existent, Follow-up, Multi-clause.
 * 2. Provider Truthfulness & Pipeline Integrity: URN/provider propagation, provenance, fixture vs live, deep-link dispatch.
 * 3. Email Draft Continuity End-to-End: Create -> Focus -> Update Subject -> Update Body -> Use Name -> MIME Guard -> Timeout.
 * 4. Database Failure Handling: Mongoose states 0, 1, 2, 3, injected checker, persistence vs disconnection messages.
 * 5. Replay Determinism & Zero-Egress Network Isolation: Timestamp preservation, fail closed, egress trap.
 */

process.env.LIFEOS_ALLOW_TEST_MOCKS = "true";

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import mongoose from "mongoose";

import { FastPathExecutor } from "../orchestration/supervisor/FastPathExecutor";
import { SemanticIntentInterpreter } from "../orchestration/semantic/SemanticIntentInterpreter";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ExternalCapabilityAdapter } from "../orchestration/kernel/ExternalCapabilityAdapter";
import { GroundedResponseGenerator } from "../orchestration/grounding/GroundedResponseGenerator";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { ActionProposal, KernelExecutionResult } from "../orchestration/contracts/ActionProposalContracts";
import { SemanticTurn } from "../orchestration/contracts/SemanticTurnContracts";

describe("PHASE 18: Production Harness Maturity Verification (V2.2)", () => {
  const originalFetch = globalThis.fetch;
  const originalHttpRequest = http.request;
  const originalHttpsRequest = https.request;

  after(() => {
    globalThis.fetch = originalFetch;
    http.request = originalHttpRequest;
    https.request = originalHttpsRequest;
    SemanticIntentInterpreter.getInstance().setMockChat(undefined);
  });

  // =========================================================================
  // 1. TASK RESOLUTION SAFETY (Requirement 2)
  // =========================================================================
  describe("1. Task Resolution Safety & Zero-Mutation Invariant", () => {
    it("1.1: Exact task ID completes directly via FastPath", async () => {
      let executedTaskId: string | null = null;
      const customRegistry = new ActionAdapterRegistry();
      customRegistry.register("complete_task", {
        validatePreconditions: async () => ({ valid: true }),
        execute: async (prop) => {
          executedTaskId = prop.payload?.taskId;
          return { success: true, taskId: executedTaskId };
        },
        compensate: async () => ({ compensated: true }),
      });

      const kernel = new (KernelCapabilityService as any)(customRegistry);
      const fastPath = new FastPathExecutor(kernel);

      assert.equal(fastPath.canHandle("mark task task_clean_123 as completed"), true);
      const res = await fastPath.execute("mark task task_clean_123 as completed", "user_test", {
        knownTasks: [{ id: "task_clean_123", title: "Clean Room" }],
      });

      assert.equal(res.handled, true);
      assert.equal(executedTaskId, "task_clean_123");
      assert.ok(res.userResponse.includes("task_clean_123") || res.userResponse.includes("completed"));
    });

    it("1.2: Exact task title in knownTasks resolves cleanly", async () => {
      let executedTaskId: string | null = null;
      const customRegistry = new ActionAdapterRegistry();
      customRegistry.register("complete_task", {
        validatePreconditions: async () => ({ valid: true }),
        execute: async (prop) => {
          executedTaskId = prop.payload?.taskId;
          return { success: true, taskId: executedTaskId };
        },
        compensate: async () => ({ compensated: true }),
      });

      const kernel = new (KernelCapabilityService as any)(customRegistry);
      const fastPath = new FastPathExecutor(kernel);

      const known = [{ id: "t_pipe_99", title: "Fix leaking pipe" }];
      assert.equal(fastPath.canHandle("complete task 'Fix leaking pipe'"), true);
      const res = await fastPath.execute("complete task 'Fix leaking pipe'", "user_test", { knownTasks: known });

      assert.equal(res.handled, true);
      assert.equal(executedTaskId, "t_pipe_99", "Exact title must resolve to known task ID");
    });

    it("1.3: Quoted task title resolves cleanly", async () => {
      let executedTaskId: string | null = null;
      const customRegistry = new ActionAdapterRegistry();
      customRegistry.register("complete_task", {
        validatePreconditions: async () => ({ valid: true }),
        execute: async (prop) => {
          executedTaskId = prop.payload?.taskId;
          return { success: true, taskId: executedTaskId };
        },
        compensate: async () => ({ compensated: true }),
      });

      const kernel = new (KernelCapabilityService as any)(customRegistry);
      const fastPath = new FastPathExecutor(kernel);

      const known = [{ id: "t_doc_42", title: "Update Architecture Doc" }];
      assert.equal(fastPath.canHandle('complete task "Update Architecture Doc"'), true);
      const res = await fastPath.execute('complete task "Update Architecture Doc"', "user_test", { knownTasks: known });

      assert.equal(res.handled, true);
      assert.equal(executedTaskId, "t_doc_42");
    });

    it("1.4: Ambiguous task title triggers clarification and causes ZERO mutations", async () => {
      let mutationsCount = 0;
      const customRegistry = new ActionAdapterRegistry();
      customRegistry.register("complete_task", {
        validatePreconditions: async () => ({ valid: true }),
        execute: async () => {
          mutationsCount++;
          return { success: true };
        },
        compensate: async () => ({ compensated: true }),
      });

      const kernel = new (KernelCapabilityService as any)(customRegistry);
      const supervisor = Supervisor.createDefault(kernel);

      const knownTasks = [
        { id: "task_pr_1", title: "Review PR" },
        { id: "task_pr_2", title: "Review Architecture Doc" },
      ];

      const interpreter = SemanticIntentInterpreter.getInstance();
      interpreter.setMockChat(async () => {
        return JSON.stringify({
          primaryClassification: "ACTION_REQUEST",
          ambiguityStatus: "ENTITY_AMBIGUOUS",
          conversationalSummary: "Which task would you like to complete?",
          operations: [
            {
              domain: "productivity",
              actionType: "complete_task",
              targetReference: {
                rawExpression: "Review",
                semanticDescriptor: "Review",
                kind: "INDEFINITE",
              },
              payload: { title: "Review" },
            },
          ],
        });
      });

      try {
        const response = await supervisor.processRequest({
          userId: "user_ambiguous_test",
          message: "complete task Review",
          knownTasks,
        });

        assert.equal(response.actionsExecuted, 0, "Ambiguous request must execute ZERO mutations");
        assert.equal(mutationsCount, 0, "Zero mutations must be committed to database");
        assert.equal(response.terminationReason, "AWAITING_CLARIFICATION");
      } finally {
        interpreter.setMockChat(undefined);
      }
    });

    it("1.5: Non-existent task produces ZERO mutations", async () => {
      let mutationsCount = 0;
      const customRegistry = new ActionAdapterRegistry();
      customRegistry.register("complete_task", {
        validatePreconditions: async () => ({ valid: true }),
        execute: async () => {
          mutationsCount++;
          return { success: true };
        },
        compensate: async () => ({ compensated: true }),
      });

      const kernel = new (KernelCapabilityService as any)(customRegistry);
      const supervisor = Supervisor.createDefault(kernel);

      const interpreter = SemanticIntentInterpreter.getInstance();
      interpreter.setMockChat(async () => {
        return JSON.stringify({
          primaryClassification: "ACTION_REQUEST",
          ambiguityStatus: "ENTITY_AMBIGUOUS",
          conversationalSummary: "I couldn't find any task matching that title.",
          operations: [
            {
              domain: "productivity",
              actionType: "complete_task",
              targetReference: {
                rawExpression: "NonExistentGhostTask999",
                semanticDescriptor: "NonExistentGhostTask999",
                kind: "INDEFINITE",
              },
              payload: { title: "NonExistentGhostTask999" },
            },
          ],
        });
      });

      try {
        const response = await supervisor.processRequest({
          userId: "user_notfound_test",
          message: "complete task NonExistentGhostTask999",
          knownTasks: [{ id: "t1", title: "Existing Task" }],
        });

        assert.equal(response.actionsExecuted, 0, "Non-existent task must execute ZERO mutations");
        assert.equal(mutationsCount, 0);
      } finally {
        interpreter.setMockChat(undefined);
      }
    });

    it("1.6: Follow-up reference 'complete that task' resolves via activeFocus or causes ZERO mutations", async () => {
      let completedTaskId: string | null = null;
      const customRegistry = new ActionAdapterRegistry();
      customRegistry.register("complete_task", {
        validatePreconditions: async () => ({ valid: true }),
        execute: async (prop) => {
          completedTaskId = prop.payload?.taskId;
          return { success: true, taskId: completedTaskId };
        },
        compensate: async () => ({ compensated: true }),
      });

      const kernel = new (KernelCapabilityService as any)(customRegistry);
      const supervisor = Supervisor.createDefault(kernel);

      const interpreter = SemanticIntentInterpreter.getInstance();
      interpreter.setMockChat(async ({ messages }) => {
        const sysMsg = messages.find((m: any) => m.role === "system")?.content || "";
        if (sysMsg.includes("task_solar_101")) {
          return JSON.stringify({
            primaryClassification: "ACTION_REQUEST",
            ambiguityStatus: "UNAMBIGUOUS",
            conversationalSummary: "Marking that task as completed.",
            operations: [
              {
                domain: "productivity",
                actionType: "complete_task",
                targetReference: {
                  rawExpression: "that task",
                  resolvedEntityId: "task_solar_101",
                  kind: "CONTEXTUAL_ANAPHORIC",
                },
                payload: { taskId: "task_solar_101" },
              },
            ],
          });
        }
        return JSON.stringify({
          primaryClassification: "CASUAL_DIALOGUE",
          operations: [],
        });
      });

      try {
        // Part A: Without activeFocus in conversation context, follow-up reference cannot resolve -> ZERO mutations
        const respWithoutFocus = await supervisor.processRequest({
          userId: "user_followup_test",
          message: "complete that task",
          knownTasks: [{ id: "task_solar_101", title: "Install solar inverter" }],
        });
        assert.equal(respWithoutFocus.actionsExecuted, 0, "Without activeFocus, follow-up reference must cause ZERO mutations");

        // Part B: With activeFocus present, contextual pronoun resolves to activeFocus entity
        const respWithFocus = await supervisor.processRequest({
          userId: "user_followup_test",
          message: "complete that task",
          activeFocus: { entityType: "task", entityId: "task_solar_101", displayName: "Install solar inverter", domain: "productivity" },
          knownTasks: [{ id: "task_solar_101", title: "Install solar inverter" }],
        });
        assert.equal(respWithFocus.actionsExecuted, 1, "With activeFocus, follow-up reference resolves and executes");
        assert.equal(completedTaskId, "task_solar_101");
      } finally {
        interpreter.setMockChat(undefined);
      }
    });

    it("1.7: Multi-clause request containing task completion is rejected by FastPath", () => {
      const fastPath = new FastPathExecutor(KernelCapabilityService.getInstance());
      assert.equal(fastPath.canHandle("I finished task 123 and logged 500ml water"), false);
      assert.equal(fastPath.canHandle("can you complete task 123 and email daksh"), false);
      assert.equal(fastPath.canHandle("we completed task 123"), false);
    });
  });

  // =========================================================================
  // 2. PROVIDER TRUTHFULNESS & PIPELINE INTEGRITY (Requirement 3)
  // =========================================================================
  describe("2. Provider Truthfulness & Provenance Pipeline", () => {
    it("2.1: capabilityURN and providerId survive the entire pipeline", async () => {
      const adapter = ExternalCapabilityAdapter.getInstance();
      (adapter as any).options = {
        tokenResolver: async () => ({ accessToken: "test_token" }),
      };

      const proposal: ActionProposal = {
        id: "prop_pipeline_trace",
        actionType: "external_capability_action",
        domain: "productivity",
        reversibility: "atomic_single_doc",
        state: "APPROVED",
        title: "Trace test",
        rationale: "Trace capabilityURN & providerId",
        payload: {
          capabilityURN: "productivity.calendar.read_events",
          providerId: "google_calendar",
          parameters: {},
        },
        idempotencyKey: `idem_pipe_${Date.now()}`,
      } as any;

      globalThis.fetch = async () => {
        return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      };

      try {
        const kernel = KernelCapabilityService.getInstance();
        const execResult = await kernel.executeAction("user_pipeline", proposal);

        assert.equal(execResult.capabilityURN, "productivity.calendar.read_events", "capabilityURN must survive to top level");
        assert.equal(execResult.providerId, "google_calendar", "providerId must survive to top level");
        assert.equal(execResult.provenance, "LIVE_VERIFIED");
        assert.ok(execResult.freshness);
        assert.equal(typeof execResult.freshness.recordedAt, "number");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("2.2: Fixture preview estimates cannot be represented as confirmed provider facts", () => {
      const generator = GroundedResponseGenerator.getInstance();
      const mockTurn: SemanticTurn = {
        turnId: "turn_test",
        schemaVersion: 2,
        userId: "usr_1",
        conversationId: "conv_1",
        timestamp: Date.now(),
        rawInput: "book a ride to the station",
        normalizedTimezone: "UTC",
        provenance: {} as any,
        primaryClassification: "ACTION_REQUEST",
        ambiguityStatus: "UNAMBIGUOUS",
        conversationalSummary: "Book ride to station",
        operations: [],
      };

      const fixturePreviewResult: KernelExecutionResult = {
        actionId: "act_preview",
        idempotencyKey: "idem_preview",
        actionType: "external_capability_action",
        status: "SUCCEEDED",
        success: true,
        capabilityURN: "mobility.rides.request",
        providerId: "rapido_mobility",
        provenance: "FIXTURE_PREVIEW",
        data: {
          provider: "RAPIDO",
          rideTier: "Bike",
          pickup: "My Location",
          dropoff: "Phagwara Station",
          fareEstimate: "₹85 - ₹100",
          deepLinkUri: "https://rapido.bike/book?lat=31.2&lon=75.7",
        },
        timestamp: Date.now(),
      };

      const response = generator.generateResponse(mockTurn, [fixturePreviewResult]);
      assert.ok(!response.includes("Ride Confirmed"), "Must NOT claim Ride Confirmed for fixture previews");
      assert.ok(!response.includes("Driver Assigned"), "Must NOT fabricate driver assigned");
      assert.ok(response.includes("Ride Ready for Dispatch"), "Must truthfully report Ride Ready for Dispatch");
      assert.ok(response.includes("Open RAPIDO to Confirm & Dispatch"), "Must provide deep-link guidance");
    });

    it("2.3: Confirmed failure is distinguished from unknown external outcome", async () => {
      const adapter = new ExternalCapabilityAdapter({
        tokenResolver: async () => ({ accessToken: "test_token" }),
      });

      // Case A: Confirmed failure (HTTP 400 Bad Request)
      globalThis.fetch = async (url: any, init?: any) => {
        if (init?.method === "GET") {
          return new Response(JSON.stringify({
            id: "draft_400",
            message: { payload: { mimeType: "text/plain", headers: [] } },
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: { message: "Invalid argument: recipient address syntax error" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      };

      const proposalA: ActionProposal = {
        id: "prop_fail_400",
        actionType: "external_capability_action",
        domain: "productivity",
        reversibility: "atomic_single_doc",
        state: "APPROVED",
        title: "Confirmed fail",
        rationale: "400 error",
        payload: {
          capabilityURN: "productivity.email.update_draft",
          providerId: "gmail",
          parameters: { draftId: "draft_400", subject: "Valid Subj" },
        },
        idempotencyKey: `idem_400_${Date.now()}`,
      } as any;

      const resA = await adapter.execute(proposalA, "user_1", { mode: "LIVE" });
      assert.equal(resA.success, false);
      const errMsgA = (resA.error as any)?.message || String(resA.error || "");
      assert.ok(!errMsgA.includes("UNKNOWN_EXTERNAL_STATE"), "HTTP 400 is a confirmed remote rejection, not UNKNOWN_EXTERNAL_STATE");

      // Case B: Unknown outcome (Network timeout / AbortError on PUT)
      globalThis.fetch = async (url: any, init?: any) => {
        if (init?.method === "GET") {
          return new Response(JSON.stringify({
            id: "draft_timeout",
            message: { payload: { mimeType: "text/plain", headers: [] } },
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        const err = new Error("Connection timed out after socket hangup");
        err.name = "AbortError";
        throw err;
      };

      const proposalB: ActionProposal = {
        id: "prop_fail_timeout",
        actionType: "external_capability_action",
        domain: "productivity",
        reversibility: "atomic_single_doc",
        state: "APPROVED",
        title: "Timeout fail",
        rationale: "Timeout error",
        payload: {
          capabilityURN: "productivity.email.update_draft",
          providerId: "gmail",
          parameters: { draftId: "draft_timeout", subject: "Valid Subj" },
        },
        idempotencyKey: `idem_timeout_${Date.now()}`,
      } as any;

      const resB = await adapter.execute(proposalB, "user_1", { mode: "LIVE" });
      assert.equal(resB.success, false);
      const errMsgB = (resB.error as any)?.message || String(resB.error || "");
      assert.ok(errMsgB.includes("UNKNOWN_EXTERNAL_STATE"), "Network abort during mutation must be classified as UNKNOWN_EXTERNAL_STATE");
      assert.ok(errMsgB.includes("Do not retry blindly"), "Must warn against blind automatic retries");
    });

    it("2.4: Generic success fallbacks cannot conceal failed operations", () => {
      const generator = GroundedResponseGenerator.getInstance();
      const mockTurn: SemanticTurn = {
        turnId: "turn_fail",
        schemaVersion: 2,
        userId: "usr_1",
        conversationId: "conv_1",
        timestamp: Date.now(),
        rawInput: "update my calendar",
        normalizedTimezone: "UTC",
        provenance: {} as any,
        primaryClassification: "ACTION_REQUEST",
        ambiguityStatus: "UNAMBIGUOUS",
        conversationalSummary: "Update calendar event",
        operations: [],
      };

      const failedResult: KernelExecutionResult = {
        actionId: "act_failed_gen",
        idempotencyKey: "idem_fail_gen",
        actionType: "external_capability_action",
        status: "FAILED",
        success: false,
        capabilityURN: "productivity.calendar.create_event",
        providerId: "google_calendar",
        error: "Google Calendar service returned 503 Service Unavailable",
        timestamp: Date.now(),
      };

      const response = generator.generateResponse(mockTurn, [failedResult]);
      assert.ok(!response.includes("Done"), "Must NEVER say 'Done' when operation failed");
      assert.ok(/couldn't|failed|issue/i.test(response), "Must state failure truthfully");
      assert.ok(response.includes("Google Calendar"), "Must name provider accurately");
    });
  });

  // =========================================================================
  // 3. EMAIL DRAFT CONTINUITY & MIME SAFETY (Requirement 4)
  // =========================================================================
  describe("3. Email Draft Continuity & Safe Remote Revision", () => {
    it("3.1: Full sequence: Create -> Focus -> Update Subject -> Update Body -> Use Name", async () => {
      let remoteSubject = "Initial Subject";
      let remoteTo = "daksh@example.com";
      let remoteBody = "Hi [Candidate Name], please join us tomorrow.";

      globalThis.fetch = async (url: any, init?: any) => {
        const urlStr = String(url);
        if (init?.method === "GET" && urlStr.includes("/drafts/r_draft_seq_100")) {
          return new Response(JSON.stringify({
            id: "r_draft_seq_100",
            message: {
              id: "msg_seq_100",
              payload: {
                mimeType: "text/plain",
                headers: [
                  { name: "Subject", value: remoteSubject },
                  { name: "To", value: remoteTo },
                ],
                body: { data: Buffer.from(remoteBody).toString("base64url") },
              },
            },
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (init?.method === "PUT" && urlStr.includes("/drafts/r_draft_seq_100")) {
          const bodyJson = JSON.parse(init.body);
          const raw = Buffer.from(bodyJson.message.raw, "base64url").toString("utf-8");
          const lines = raw.split("\r\n");
          let inBody = false;
          let bodyLines: string[] = [];
          for (const l of lines) {
            if (inBody) {
              bodyLines.push(l);
            } else if (l === "") {
              inBody = true;
            } else {
              const colonIdx = l.indexOf(":");
              if (colonIdx !== -1) {
                const headerName = l.substring(0, colonIdx).trim().toLowerCase();
                let headerVal = l.substring(colonIdx + 1).trim();
                if (headerVal.startsWith("=?UTF-8?B?") && headerVal.endsWith("?=")) {
                  const b64 = headerVal.substring(10, headerVal.length - 2);
                  headerVal = Buffer.from(b64, "base64").toString("utf-8");
                }
                if (headerName === "subject") remoteSubject = headerVal;
                if (headerName === "to") remoteTo = headerVal;
              }
            }
          }
          remoteBody = bodyLines.join("\r\n");
          return new Response(JSON.stringify({
            id: "r_draft_seq_100",
            message: { id: "msg_seq_100" },
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 });
      };

      const adapter = ExternalCapabilityAdapter.getInstance();
      (adapter as any).options = {
        tokenResolver: async () => ({ accessToken: "test_gmail_token" }),
      };

      try {
        // Step 1: Update only subject
        const prop1: ActionProposal = {
          id: "prop_step_1",
          actionType: "external_capability_action",
          domain: "productivity",
          reversibility: "atomic_single_doc",
          state: "APPROVED",
          title: "Update Subject",
          rationale: "Update subject only",
          payload: {
            capabilityURN: "productivity.email.update_draft",
            providerId: "gmail",
            parameters: {
              draftId: "r_draft_seq_100",
              subject: "Updated: Interview with LifeOS",
            },
          },
          idempotencyKey: `idem_step1_${Date.now()}`,
        } as any;

        const res1 = await adapter.execute(prop1, "user_seq", { mode: "LIVE" });
        assert.equal(res1.success, true);
        assert.equal(remoteSubject, "Updated: Interview with LifeOS");
        assert.equal(remoteTo, "daksh@example.com", "Recipients must be preserved");
        assert.ok(remoteBody.includes("Hi [Candidate Name]"), "Body must be preserved when updating subject");

        // Step 2: Update body placeholder in follow-up turn
        const prop2: ActionProposal = {
          id: "prop_step_2",
          actionType: "external_capability_action",
          domain: "productivity",
          reversibility: "atomic_single_doc",
          state: "APPROVED",
          title: "Update Body",
          rationale: "Substitute Candidate Name",
          payload: {
            capabilityURN: "productivity.email.update_draft",
            providerId: "gmail",
            parameters: {
              draftId: "r_draft_seq_100",
              bodyText: "Hi Daksh, please join us tomorrow.",
            },
          },
          idempotencyKey: `idem_step2_${Date.now()}`,
        } as any;

        const res2 = await adapter.execute(prop2, "user_seq", { mode: "LIVE" });
        assert.equal(res2.success, true);
        assert.equal(remoteSubject, "Updated: Interview with LifeOS", "Subject must remain preserved");
        assert.equal(remoteTo, "daksh@example.com", "Recipient must remain preserved");
        assert.equal(remoteBody, "Hi Daksh, please join us tomorrow.");

        // Step 3: "Use my name" signs closing without setting user as recipient
        const prop3: ActionProposal = {
          id: "prop_step_3",
          actionType: "external_capability_action",
          domain: "productivity",
          reversibility: "atomic_single_doc",
          state: "APPROVED",
          title: "Sign with my name",
          rationale: "Append signature",
          payload: {
            capabilityURN: "productivity.email.update_draft",
            providerId: "gmail",
            parameters: {
              draftId: "r_draft_seq_100",
              bodyText: "Hi Daksh, please join us tomorrow.\n\nBest regards,\nAman",
            },
          },
          idempotencyKey: `idem_step3_${Date.now()}`,
        } as any;

        const res3 = await adapter.execute(prop3, "user_seq", { mode: "LIVE" });
        assert.equal(res3.success, true);
        assert.equal(remoteTo, "daksh@example.com", "Recipient must NEVER be changed to user's name");
        assert.ok(remoteBody.includes("Best regards,\nAman"), "Signature must be appended to body text");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("3.2: Rejects all unsupported MIME types with ZERO destructive PUT calls", async () => {
      let putCalled = false;

      const testMimePayload = async (payload: any) => {
        putCalled = false;
        globalThis.fetch = async (url: any, init?: any) => {
          if (init?.method === "GET") {
            return new Response(JSON.stringify({
              id: "draft_test_mime",
              message: { id: "msg_test_mime", payload },
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          if (init?.method === "PUT") {
            putCalled = true;
            return new Response(JSON.stringify({ id: "draft_test_mime" }), { status: 200 });
          }
          return new Response(JSON.stringify({ error: { message: "Not found" } }), { status: 404 });
        };

        const adapter = new ExternalCapabilityAdapter({
          tokenResolver: async () => ({ accessToken: "test_gmail_token" }),
        });

        const proposal: ActionProposal = {
          id: "prop_test_mime",
          actionType: "external_capability_action",
          domain: "productivity",
          reversibility: "atomic_single_doc",
          state: "APPROVED",
          title: "Test MIME",
          rationale: "Verify rejection",
          payload: {
            capabilityURN: "productivity.email.update_draft",
            providerId: "gmail",
            parameters: { draftId: "draft_test_mime", subject: "Should Fail" },
          },
          idempotencyKey: `idem_mime_${Date.now()}`,
        } as any;

        const res = await adapter.execute(proposal, "user_1", { mode: "LIVE" });
        assert.equal(res.success, false, "Must reject unsupported MIME payload");
        assert.equal(putCalled, false, "Must NEVER issue PUT mutation to unsafe MIME structure!");
      };

      try {
        // A: multipart/mixed
        await testMimePayload({
          mimeType: "multipart/mixed",
          headers: [{ name: "Subject", value: "Mixed" }],
          parts: [{ filename: "doc.pdf", mimeType: "application/pdf" }],
        });

        // B: multipart/alternative
        await testMimePayload({
          mimeType: "multipart/alternative",
          headers: [{ name: "Subject", value: "Alternative" }],
          parts: [{ mimeType: "text/plain" }, { mimeType: "text/html" }],
        });

        // C: Attachment part with attachmentId
        await testMimePayload({
          mimeType: "text/plain",
          headers: [{ name: "Subject", value: "Attachment Part" }],
          parts: [{ mimeType: "image/jpeg", body: { attachmentId: "att_123" } }],
        });

        // D: Malformed payload (null headers)
        await testMimePayload(null);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // 4. DATABASE FAILURE HANDLING (Requirement 5)
  // =========================================================================
  describe("4. Database Failure Handling & Non-Blocking Provider Checks", () => {
    it("4.1: MongoDB connected and provider configured returns CONNECTED", async () => {
      const supervisor = Supervisor.createDefault(undefined, {
        checkConnection: async () => ({
          connected: true,
          status: "CONNECTED",
          providerDisplayName: "Spotify",
        }),
      });

      const res = await (supervisor as any).checkProviderConnection("usr_1", "spotify");
      assert.equal(res.connected, true);
      assert.equal(res.status, "CONNECTED");
    });

    it("4.2: MongoDB connected and provider missing returns DISCONNECTED without DB error", async () => {
      const supervisor = Supervisor.createDefault(undefined, {
        checkConnection: async () => ({
          connected: false,
          status: "DISCONNECTED",
          providerDisplayName: "Google Calendar",
        }),
      });

      const res = await (supervisor as any).checkProviderConnection("usr_1", "google_calendar");
      assert.equal(res.connected, false);
      assert.equal(res.status, "DISCONNECTED");
    });

    it("4.3: MongoDB disconnected returns PERSISTENCE_UNAVAILABLE without hanging", async () => {
      const supervisor = Supervisor.createDefault();
      (supervisor as any).connectionChecker = undefined;

      const originalReadyState = mongoose.connection.readyState;
      Object.defineProperty(mongoose.connection, "readyState", {
        value: 0,
        configurable: true,
      });

      try {
        const res = await (supervisor as any).checkProviderConnection("usr_1", "gmail");
        assert.equal(res.connected, false);
        assert.equal(res.status, "PERSISTENCE_UNAVAILABLE");
        assert.ok(res.error?.includes("temporarily offline"));
      } finally {
        Object.defineProperty(mongoose.connection, "readyState", {
          value: originalReadyState,
          configurable: true,
        });
      }
    });

    it("4.4: MongoDB connecting (2) or disconnecting (3) returns PERSISTENCE_UNAVAILABLE", async () => {
      const supervisor = Supervisor.createDefault();
      (supervisor as any).connectionChecker = undefined;

      const originalReadyState = mongoose.connection.readyState;

      try {
        Object.defineProperty(mongoose.connection, "readyState", { value: 2, configurable: true });
        const resConnecting = await (supervisor as any).checkProviderConnection("usr_1", "gmail");
        assert.equal(resConnecting.status, "PERSISTENCE_UNAVAILABLE");

        Object.defineProperty(mongoose.connection, "readyState", { value: 3, configurable: true });
        const resDisconnecting = await (supervisor as any).checkProviderConnection("usr_1", "gmail");
        assert.equal(resDisconnecting.status, "PERSISTENCE_UNAVAILABLE");
      } finally {
        Object.defineProperty(mongoose.connection, "readyState", {
          value: originalReadyState,
          configurable: true,
        });
      }
    });

    it("4.5: Injected checker returning PERSISTENCE_UNAVAILABLE halts supervisor before mutation", async () => {
      let mutationTriggered = false;
      const customRegistry = new ActionAdapterRegistry();
      customRegistry.register("external_capability_action", {
        validatePreconditions: async () => ({ valid: true }),
        execute: async () => {
          mutationTriggered = true;
          return { success: true };
        },
        compensate: async () => ({ compensated: true }),
      });

      const kernel = new (KernelCapabilityService as any)(customRegistry);
      const supervisor = Supervisor.createDefault(kernel, {
        checkConnection: async () => ({
          connected: false,
          status: "PERSISTENCE_UNAVAILABLE",
          providerDisplayName: "Gmail",
          error: "Database cluster failover in progress",
        }),
      });

      const interpreter = SemanticIntentInterpreter.getInstance();
      interpreter.setMockChat(async () => {
        return JSON.stringify({
          primaryClassification: "ACTION_REQUEST",
          ambiguityStatus: "UNAMBIGUOUS",
          conversationalSummary: "Updating your draft.",
          operations: [
            {
              domain: "productivity",
              actionType: "external_capability_action",
              capabilityURN: "productivity.email.update_draft",
              providerHint: "gmail",
              payload: {
                capabilityURN: "productivity.email.update_draft",
                providerId: "gmail",
                parameters: { draftId: "draft_123", subject: "New Subj" },
              },
            },
          ],
        });
      });

      try {
        const response = await supervisor.processRequest({
          userId: "usr_db_failover",
          message: "update draft subject",
        });

        assert.equal(response.terminationReason, "PERSISTENCE_UNAVAILABLE");
        assert.equal(response.actionsExecuted, 0, "Zero actions must be executed when persistence is unavailable");
        assert.equal(mutationTriggered, false, "Execution must STOP BEFORE any external mutation when DB is offline");
        assert.ok(response.response.includes("Database service is temporarily unavailable"), "Must truthfully state DB unavailability");
        assert.ok(!response.response.includes("isn't connected yet"), "Must NEVER claim external provider is disconnected when DB fails!");
      } finally {
        interpreter.setMockChat(undefined);
      }
    });
  });

  // =========================================================================
  // 5. REPLAY DETERMINISM & NETWORK ISOLATION (Requirement 6)
  // =========================================================================
  describe("5. Replay Determinism & Strict Transport Egress Traps", () => {
    it("5.1: Historical timestamps and identifiers are preserved without network egress", async () => {
      let egressIntercepted = false;
      const trap = () => {
        egressIntercepted = true;
        throw new Error("[EGRESS_TRAP_TRIGGERED]: Live network call during replay is strictly forbidden!");
      };

      globalThis.fetch = trap as any;
      http.request = trap as any;
      https.request = trap as any;

      try {
        const adapter = new ExternalCapabilityAdapter({
          tokenResolver: async () => ({ accessToken: "replay_token" }),
          transportFactory: () => ({
            execute: trap,
            callTool: trap,
          } as any),
        });

        const historicalTimestamp = 1790500000000;
        const testKey = "idem_strict_replay_001";

        (adapter as any).executionLedger.set(testKey, {
          idempotencyKey: testKey,
          capabilityURN: "productivity.calendar.read_events",
          providerId: "google_calendar",
          status: "SUCCEEDED",
          result: { events: [{ title: "Morning Review", time: "09:00" }] },
          timestamp: historicalTimestamp,
        });

        const proposal: ActionProposal = {
          id: "prop_replay_verif",
          actionType: "external_capability_action",
          domain: "productivity",
          reversibility: "atomic_single_doc",
          state: "APPROVED",
          title: "Replay verification",
          rationale: "Historical replay",
          payload: {
            capabilityURN: "productivity.calendar.read_events",
            providerId: "google_calendar",
            parameters: {},
          },
          idempotencyKey: testKey,
        } as any;

        const result = await adapter.execute(proposal, "user_replay", { mode: "REPLAY" });

        assert.equal(result.success, true);
        assert.equal(result.capabilityURN, "productivity.calendar.read_events");
        assert.equal(result.providerId, "google_calendar");
        assert.equal(result.provenance, "REPLAY_MATCH");
        assert.equal(result.timestamp, historicalTimestamp, "Must preserve exact historical timestamp");
        assert.equal(result.freshness?.recordedAt, historicalTimestamp);
        assert.equal(egressIntercepted, false, "Must NEVER trigger network calls during replay");

        // Missing record must FAIL CLOSED
        let threwAbort = false;
        try {
          await adapter.execute({
            ...proposal,
            idempotencyKey: "missing_unrecorded_key",
          }, "user_replay", { mode: "REPLAY" });
        } catch (err: any) {
          threwAbort = true;
          assert.ok(err.message.includes("[REPLAY_ABORT]"), "Missing replay record must throw [REPLAY_ABORT]");
        }
        assert.equal(threwAbort, true, "Missing replay record must fail closed");
        assert.equal(egressIntercepted, false, "Failed replay check must NOT contact network");
      } finally {
        globalThis.fetch = originalFetch;
        http.request = originalHttpRequest;
        https.request = originalHttpsRequest;
      }
    });
  });
});
