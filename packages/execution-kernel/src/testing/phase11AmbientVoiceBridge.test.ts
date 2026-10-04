import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AmbientVoiceBridge,
  VoiceSessionState,
} from "../index";

test("Phase 11: Ambient Voice Bridge: Complete session lifecycle through Push-to-Talk", () => {
  const bridge = AmbientVoiceBridge.getInstance();
  bridge.endSession();

  const states: string[] = [];
  const unsubscribe = bridge.subscribe((state: VoiceSessionState) => {
    states.push(state.status);
  });

  assert.equal(bridge.getState().status, "IDLE");

  // 1. User presses push-to-talk button
  bridge.startSession("PUSH_TO_TALK");
  assert.equal(bridge.getState().status, "LISTENING");
  assert.equal(bridge.getState().triggerSource, "PUSH_TO_TALK");

  // 2. User stops speaking -> transcribing
  bridge.markProcessing();
  assert.equal(bridge.getState().status, "PROCESSING");

  // 3. Aven streams back response
  bridge.markResponding("Rescheduling your session by 15 minutes.");
  assert.equal(bridge.getState().status, "RESPONDING");
  assert.equal(bridge.getState().transcriptSnippet, "Rescheduling your session by 15 minutes.");

  // 4. Session ends -> returns to IDLE (Silence!)
  bridge.endSession();
  assert.equal(bridge.getState().status, "IDLE");

  assert.deepEqual(states, [
    "LISTENING",
    "PROCESSING",
    "RESPONDING",
    "IDLE",
  ]);

  unsubscribe();
});

test("Phase 11: Ambient Voice Bridge: Error handling flag", () => {
  const bridge = AmbientVoiceBridge.getInstance();
  bridge.endSession();

  bridge.startSession("NOTIFICATION_MIC");
  bridge.flagError("Microphone access denied");

  assert.equal(bridge.getState().status, "ERROR");
  assert.equal(bridge.getState().errorMessage, "Microphone access denied");

  bridge.endSession();
  assert.equal(bridge.getState().status, "IDLE");
});
