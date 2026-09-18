import { test } from "node:test";
import assert from "node:assert/strict";
import { MockLLMProvider } from "./fixtures/mockLLMProvider";
import { createMockKernelSnapshot, createMockGraphSnapshot } from "./fixtures/mockWorldState";
import { createMockConversationState } from "./fixtures/mockConversations";
import { TestHarness } from "./harness";

test("Phase 0 Sanity: MockLLMProvider routes prompts deterministically", async () => {
  const mockLLM = new MockLLMProvider([
    { pattern: /thesis/i, response: { intent: "create_task", target: "Thesis Chapter 1" } },
    { pattern: "hello", response: "Hello there!" },
  ], "Default fallback");

  const res1 = await mockLLM.chat("Can you help with my thesis?", "System: You are an assistant.");
  const parsed1 = JSON.parse(res1);
  assert.equal(parsed1.intent, "create_task");
  assert.equal(parsed1.target, "Thesis Chapter 1");

  const res2 = await mockLLM.chat("hello world", "System");
  assert.equal(res2, "Hello there!");

  const res3 = await mockLLM.chat("unmatched query", "System");
  assert.equal(res3, "Default fallback");
});

test("Phase 0 Sanity: Mock fixtures instantiate with valid structures", () => {
  const kernelSnapshot = createMockKernelSnapshot();
  assert.ok(kernelSnapshot.metadata.snapshotId);
  assert.equal(kernelSnapshot.subsystems.lifeState.state, "Recovery");

  const graphSnapshot = createMockGraphSnapshot();
  assert.equal(graphSnapshot.graphVersion, 1);
  assert.ok(graphSnapshot.readyNodes.length > 0);

  const conv = createMockConversationState();
  assert.equal(conv.conversation?.conversationId, "conv_test_001");
  assert.equal(conv.stm?.activeEntity?.name, "Complete Thesis Chapter 1");
});

test("Phase 0 Sanity: TestHarness assertRejects works", async () => {
  await TestHarness.assertRejects(async () => {
    throw new Error("Target validation failure");
  }, "validation failure");
});
