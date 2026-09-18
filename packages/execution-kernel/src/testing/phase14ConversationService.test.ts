import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConversationService } from "../services/ConversationService";

describe("Phase 14: Web Conversation Service & Supervisor Integration", () => {
  const service = ConversationService.getInstance();
  const testUserId = "user_phase14_test";

  it("TC-WEB-01: ConversationService singleton returns expected instance", () => {
    const s1 = ConversationService.getInstance();
    const s2 = ConversationService.getInstance();
    assert.strictEqual(s1, s2, "ConversationService must be a singleton");
  });

  it("TC-WEB-02: Fast Path request through executeUserRequest returns streaming Web Response with Fast Path headers", async () => {
    const input = {
      userId: testUserId,
      conversationId: "conv_fast_01",
      message: "Create task Buy groceries tomorrow",
    };

    const response = await service.executeUserRequest(input);

    assert.ok(response instanceof Response, "executeUserRequest must return a Web standard Response object");
    assert.strictEqual(response.headers.get("x-lifeos-route"), "FAST_PATH");
    assert.ok(Number(response.headers.get("x-lifeos-actions-count")) >= 1, "At least 1 action executed");

    // Read the stream
    const reader = response.body?.getReader();
    assert.ok(reader, "ReadableStream body must be readable");

    let fullText = "";
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value);
    }

    assert.ok(fullText.length > 0, "Stream must output response text");
    assert.match(fullText, /Buy groceries/i, "Response text must reference the created task");
    assert.doesNotMatch(fullText, /ExecutionNode|DAG|repairPropagation/i, "Zero DAG terminology leaked");
  });

  it("TC-WEB-03: Single-domain request routes cleanly to single specialist without DAG leaks", async () => {
    const input = {
      userId: testUserId,
      conversationId: "conv_single_01",
      message: "Review my pending tasks and priorities for this sprint",
    };

    const result = await service.executeUserRequestV3(input);

    assert.strictEqual(result.routingDecision.strategy, "SINGLE_SPECIALIST");
    assert.strictEqual(result.routingDecision.selectedSpecialists?.[0], "productivity");
    assert.ok(result.response.length > 0, "Response must not be empty");
    assert.doesNotMatch(result.response, /ExecutionNode|DAG|criticalPath/i, "Zero internal DAG jargon");
  });

  it("TC-WEB-04: Complex multi-domain request orchestrates parallel specialists and synthesizes outcome", async () => {
    const input = {
      userId: testUserId,
      conversationId: "conv_multi_01",
      message: "I am feeling exhausted and stressed, have 3 urgent deadlines, and missed my workout for 4 days",
    };

    const result = await service.executeUserRequestV3(input);

    assert.strictEqual(result.routingDecision.strategy, "MULTI_AGENT");
    assert.ok(result.routingDecision.selectedSpecialists!.length >= 2, "Multiple specialists must be selected");
    assert.ok(result.durationMs >= 0, "Execution duration must be non-negative");
    assert.ok(
      result.terminationReason === "GOAL_SATISFIED" || result.terminationReason === "SUBJECTIVE_GOAL_ADDRESSED",
      `Valid termination reason, got: ${result.terminationReason}`
    );
    assert.ok(result.response.length > 0, "Synthesized response must be returned to user");
  });
});
