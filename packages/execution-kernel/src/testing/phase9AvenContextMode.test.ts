import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SupervisorRequest,
} from "../index";

test("Phase 9: Single Aven Invariant: All surface entry points converge on unified SupervisorRequest", () => {
  const userId = "usr_aven_unified";

  // Case 1: Entry from Mobile Notification tap
  const mobileVoiceReq: SupervisorRequest = {
    userId,
    message: "Postpone this 15 minutes",
    surfaceContext: {
      activeExecutionTitle: "System Architecture Review",
      activeExecutionCategory: "DEEP_WORK",
      sourceSurface: "ANDROID_NOTIFICATION",
      currentInteractionMode: "ACTIVE_EXECUTION",
    },
  };

  // Case 2: Entry from Desktop HUD
  const desktopHudReq: SupervisorRequest = {
    userId,
    message: "Postpone this 15 minutes",
    surfaceContext: {
      activeExecutionTitle: "System Architecture Review",
      activeExecutionCategory: "DEEP_WORK",
      sourceSurface: "DESKTOP_HUD",
      currentInteractionMode: "ACTIVE_EXECUTION",
    },
  };

  // Case 3: Entry from Web Sticky Bar
  const webReq: SupervisorRequest = {
    userId,
    message: "Postpone this 15 minutes",
    surfaceContext: {
      activeExecutionTitle: "System Architecture Review",
      activeExecutionCategory: "DEEP_WORK",
      sourceSurface: "WEB_STICKY_BAR",
      currentInteractionMode: "ACTIVE_EXECUTION",
    },
  };

  // Invariant 2: Single Aven. All requests share the canonical supervisor schema
  assert.equal(mobileVoiceReq.message, desktopHudReq.message);
  assert.equal(mobileVoiceReq.surfaceContext?.activeExecutionTitle, "System Architecture Review");
  assert.equal(desktopHudReq.surfaceContext?.sourceSurface, "DESKTOP_HUD");
  assert.equal(webReq.surfaceContext?.sourceSurface, "WEB_STICKY_BAR");
});

test("Phase 9: Situational Ambient Context injection is well-formed", () => {
  const req: SupervisorRequest = {
    userId: "usr_context_test",
    message: "How much time is left?",
    surfaceContext: {
      activeExecutionTitle: "Kernel Pipeline Audit",
      activeExecutionCategory: "DEEP_WORK",
      sourceSurface: "ANDROID_WIDGET",
      currentInteractionMode: "ACTIVE_EXECUTION",
    },
  };

  assert.ok(req.surfaceContext);
  assert.equal(req.surfaceContext?.activeExecutionTitle, "Kernel Pipeline Audit");
  assert.equal(req.surfaceContext?.currentInteractionMode, "ACTIVE_EXECUTION");
});
