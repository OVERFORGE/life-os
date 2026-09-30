import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  Supervisor,
  ExternalCapabilityAdapter,
  SemanticIntentInterpreter,
} from "../orchestration";
import { ConversationManager } from "../kernel/ConversationManager";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://overforge:overforgedatabase@cluster0.s8cvx.mongodb.net/life-os";

test("Phase 15: Human-in-the-Loop (HITL) Security Gates, Approvals & Coreference", async (t) => {
  // 1. Database connection check
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  }
  assert.equal(mongoose.connection.readyState, 1, "MongoDB must be actively connected");

  const supervisor = Supervisor.getInstance();
  const interpreter = SemanticIntentInterpreter.getInstance();
  const userId = `test_user_hitl_${Date.now()}`;
  const conversationId = `test_conv_hitl_${Date.now()}`;

  t.after(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-HITL-01: Sensitive Scope Gate (D:\ drive access halts for confirmation)
  // ──────────────────────────────────────────────────────────────────────────
  await t.test("TC-HITL-01: Sensitive drive access halts for human approval", async () => {
    const events: any[] = [];
    const res = await supervisor.processRequest({
      userId,
      conversationId,
      message: "can you check my D drive and lmk how many folders are there",
      onEvent: (e) => events.push(e),
    });

    assert.equal(res.terminationReason, "AWAITING_CONFIRMATION", "Must halt for confirmation");
    assert.equal(res.actionsExecuted, 0, "Zero actions must be executed before approval");
    assert.ok(res.pendingOperation, "Must register pendingOperation in STM");
    assert.equal(res.pendingOperation.state, "AWAITING_CONFIRMATION");

    const confEvent = events.find((e) => e.type === "confirmation_required");
    assert.ok(confEvent, "Must emit confirmation_required stream event");
    assert.equal(confEvent.confirmLabel, "Allow");
    assert.equal(confEvent.cancelLabel, "Deny");
    assert.ok(confEvent.details?.Target, "Must provide target scope in details");

    // Persist turn state to simulate Web/Voice runtime
    await ConversationManager.getInstance().persist({
      conversationId,
      userId,
      userMessage: "can you check my D drive and lmk how many folders are there",
      assistantResponse: res.response,
      stmUpdates: res.stmUpdates || {},
      confirmation: confEvent,
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-HITL-02: Voice Call Affirmation ("yea") resumes and executes operation
  // ──────────────────────────────────────────────────────────────────────────
  await t.test("TC-HITL-02: Voice call affirmation ('yea') resumes and executes operation", async () => {
    const events: any[] = [];
    const res = await supervisor.processRequest({
      userId,
      conversationId,
      message: "yea",
      onEvent: (e) => events.push(e),
    });

    console.log("TC-HITL-02 RESULT:", {
      response: res.response,
      terminationReason: res.terminationReason,
      actionsExecuted: res.actionsExecuted,
      routingDecision: res.routingDecision,
    });

    assert.equal(res.workspaceStatus, "COMPLETED");
    assert.ok(res.actionsExecuted >= 1, "Must execute the approved capability action");
    assert.equal(res.stmUpdates?.pendingOperation, null, "Must clear pendingOperation from STM upon execution");
    assert.ok(
      res.response.toLowerCase().includes("d drive") || res.response.toLowerCase().includes("folder"),
      "Response must present truthful grounded folder information"
    );

    const toolEvents = events.filter((e) => e.type === "tool_activity");
    assert.ok(toolEvents.length >= 1, "Must emit tool_activity event for executed storage capability");

    // Persist completed turn
    await ConversationManager.getInstance().persist({
      conversationId,
      userId,
      userMessage: "yea",
      assistantResponse: res.response,
      stmUpdates: res.stmUpdates || {},
      toolActivities: toolEvents,
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-HITL-03: Conversational Coreference ("and what are they")
  // ──────────────────────────────────────────────────────────────────────────
  await t.test("TC-HITL-03: Conversational follow-up ('and what are they') resolves target path from history", async () => {
    const events: any[] = [];
    const res = await supervisor.processRequest({
      userId,
      conversationId,
      message: "and what are they",
      onEvent: (e) => events.push(e),
    });

    console.log("TC-HITL-03 RESULT:", {
      response: res.response,
      terminationReason: res.terminationReason,
      actionsExecuted: res.actionsExecuted,
      routingDecision: res.routingDecision,
    });

    assert.equal(res.workspaceStatus, "COMPLETED");
    assert.ok(res.actionsExecuted >= 1, "Must execute list_files for anaphoric follow-up");
    assert.ok(
      res.response.toLowerCase().includes("d drive") || res.response.toLowerCase().includes("found"),
      "Must list folders from D drive"
    );

    const toolEvents = events.filter((e) => e.type === "tool_activity");
    assert.ok(toolEvents.length >= 1, "Must emit tool_activity for follow-up query");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-HITL-04: User Deny / Cancellation ("no, cancel")
  // ──────────────────────────────────────────────────────────────────────────
  await t.test("TC-HITL-04: User cancellation cancels pending operation cleanly", async () => {
    const cancelConvId = `test_conv_cancel_${Date.now()}`;
    
    // Step 1: Request sensitive action
    const res1 = await supervisor.processRequest({
      userId,
      conversationId: cancelConvId,
      message: "can you check my D drive and lmk how many folders are there",
    });
    assert.equal(res1.terminationReason, "AWAITING_CONFIRMATION");

    await ConversationManager.getInstance().persist({
      conversationId: cancelConvId,
      userId,
      userMessage: "can you check my D drive and lmk how many folders are there",
      assistantResponse: res1.response,
      stmUpdates: res1.stmUpdates || {},
    });

    // Step 2: User says "no, cancel that"
    const res2 = await supervisor.processRequest({
      userId,
      conversationId: cancelConvId,
      message: "no, cancel that",
    });

    assert.equal(res2.actionsExecuted, 0, "Zero actions executed on cancel");
    assert.equal(res2.stmUpdates?.pendingOperation, null, "Pending operation must be cleared");
    assert.ok(
      res2.response.toLowerCase().includes("cancel") || res2.response.toLowerCase().includes("understood"),
      "Must acknowledge cancellation politely"
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TC-HITL-05: Real File Write to Desktop with HITL confirmation
  // ──────────────────────────────────────────────────────────────────────────
  await t.test("TC-HITL-05: Create python file on desktop requires confirmation and writes real file", async () => {
    const writeConvId = `test_conv_write_${Date.now()}`;
    const testFileName = `test_palindrome_${Date.now()}.py`;
    const events: any[] = [];

    // Step 1: Request creation of file on desktop
    const res1 = await supervisor.processRequest({
      userId,
      conversationId: writeConvId,
      message: `can you create a python file with code of palindrome on my desktop named ${testFileName}`,
      onEvent: (e) => events.push(e),
    });

    assert.equal(res1.terminationReason, "AWAITING_CONFIRMATION", "Must require confirmation for file write");
    assert.equal(res1.actionsExecuted, 0, "Zero actions executed before approval");
    assert.ok(
      res1.response.toLowerCase().includes("create") || res1.response.toLowerCase().includes("permission"),
      "Response must ask permission to create file, not inspect"
    );

    const confEvent = events.find((e) => e.type === "confirmation_required");
    assert.ok(confEvent, "Must emit confirmation_required event");
    assert.ok(
      confEvent.title.toLowerCase().includes("create") || confEvent.title.toLowerCase().includes("allow"),
      "Card title must reflect creation"
    );

    await ConversationManager.getInstance().persist({
      conversationId: writeConvId,
      userId,
      userMessage: `can you create a python file with code of palindrome on my desktop named ${testFileName}`,
      assistantResponse: res1.response,
      stmUpdates: res1.stmUpdates || {},
      confirmation: confEvent,
    });

    // Step 2: Confirm
    const res2 = await supervisor.processRequest({
      userId,
      conversationId: writeConvId,
      message: "Yes, confirm.",
    });

    assert.equal(res2.workspaceStatus, "COMPLETED");
    assert.equal(res2.actionsExecuted, 1, "Must execute write_file operation");
    assert.ok(
      res2.response.toLowerCase().includes("created") || res2.response.toLowerCase().includes("saved"),
      "Response must confirm file created"
    );

    // Verify file actually exists on host OS disk
    const fs = require("fs");
    const path = require("path");
    const os = require("os");
    const p1 = path.join(os.homedir(), "OneDrive", "Desktop", testFileName);
    const p2 = path.join(os.homedir(), "Desktop", testFileName);
    const exists = fs.existsSync(p1) || fs.existsSync(p2);
    assert.ok(exists, `File ${testFileName} must exist on desktop`);

    const createdPath = fs.existsSync(p1) ? p1 : p2;
    const content = fs.readFileSync(createdPath, "utf-8");
    assert.ok(content.toLowerCase().includes("palindrome"), "Created file must contain palindrome logic");

    // Clean up created test file
    try {
      fs.unlinkSync(createdPath);
    } catch (_) {}
  });
});
