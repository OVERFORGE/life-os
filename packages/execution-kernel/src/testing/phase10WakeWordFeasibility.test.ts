import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WakeWordEngineFactory,
  WakeWordConfig,
  WakeWordDetectionEvent,
} from "../index";

test("Phase 10: Provider-Independent Factory instantiates IWakeWordEngine for 'Hey Aven'", async () => {
  const config: WakeWordConfig = {
    provider: "MOCK_LOCAL",
    keyword: "Hey Aven",
    sampleRateHz: 16000,
    sensitivity: 0.5,
  };

  const engine = WakeWordEngineFactory.createEngine(config);
  await engine.initialize(config);

  assert.equal(engine.provider, "MOCK_LOCAL");
  assert.equal(engine.isListening(), false);

  let detectedEvent: WakeWordDetectionEvent | null = null;
  await engine.startListening((event) => {
    detectedEvent = event;
  });

  assert.equal(engine.isListening(), true);

  // 1. Silent / Background frame must NOT trigger
  const silentFrame = new Int16Array(512); // All zeros
  const silentResult = engine.processAudioFrame(silentFrame);
  assert.equal(silentResult.detected, false);
  assert.equal(detectedEvent, null);

  // 2. High-energy frame simulating "Hey Aven" activation
  const loudFrame = new Int16Array(512);
  loudFrame.fill(28000); // Exceeds 25000 threshold
  const loudResult = engine.processAudioFrame(loudFrame);

  assert.equal(loudResult.detected, true);
  assert.equal(loudResult.keyword, "Hey Aven");
  assert.ok(detectedEvent);
  assert.equal((detectedEvent as any)?.keyword, "Hey Aven");
  assert.equal((detectedEvent as any)?.provider, "MOCK_LOCAL");

  await engine.stopListening();
  assert.equal(engine.isListening(), false);
  await engine.dispose();
});

test("Phase 10: Wake Word Engine also supports single-word phrase 'Aven'", async () => {
  const config: WakeWordConfig = {
    provider: "MOCK_LOCAL",
    keyword: "Aven",
    sampleRateHz: 16000,
  };

  const engine = WakeWordEngineFactory.createEngine(config);
  await engine.initialize(config);

  let detectedKeyword = "";
  await engine.startListening((e) => {
    detectedKeyword = e.keyword;
  });

  const loudFrame = new Int16Array(512);
  loudFrame.fill(30000);
  engine.processAudioFrame(loudFrame);

  assert.equal(detectedKeyword, "Aven");
  await engine.dispose();
});
