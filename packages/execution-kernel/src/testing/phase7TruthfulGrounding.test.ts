import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GroundedResponseGenerator } from "../orchestration/grounding/GroundedResponseGenerator";
import { SemanticTurn } from "../orchestration/contracts/SemanticTurnContracts";
import { KernelExecutionResult } from "../orchestration/contracts/ActionProposalContracts";

describe("PHASE 7: Grounded Execution & Truthful Response Generation", () => {
  const generator = GroundedResponseGenerator.getInstance();

  const baseTurn: SemanticTurn = {
    turnId: "turn_001",
    schemaVersion: 2,
    userId: "user_test_001",
    conversationId: "conv_001",
    timestamp: Date.now(),
    rawInput: "I had two eggs and finished the pitch deck",
    normalizedTimezone: "UTC",
    primaryClassification: "ACTION_REQUEST",
    ambiguityStatus: "UNAMBIGUOUS",
    operations: [],
    conversationalSummary: "Logged meal and completed task",
    provenance: {
      interpreterProvider: "groq",
      modelIdentifier: "openai/gpt-oss-120b",
      promptVersionHash: "test_hash",
      contextSnapshotId: "snap_001",
      contextSnapshotHash: "snap_hash",
      inferenceDurationMs: 120,
    },
  };

  it("TEST 1: Truthfully formats successful compound multi-domain operations", () => {
    const results: KernelExecutionResult[] = [
      {
        actionId: "act_meal_1",
        idempotencyKey: "idem_1",
        actionType: "log_meal",
        status: "SUCCEEDED",
        success: true,
        data: { description: "two eggs and toast", dailyTotals: { calories: 340 } },
        timestamp: Date.now(),
      },
      {
        actionId: "act_task_2",
        idempotencyKey: "idem_2",
        actionType: "complete_task",
        status: "SUCCEEDED",
        success: true,
        data: { taskTitle: "Finish Pitch Deck" },
        timestamp: Date.now(),
      },
    ];

    const response = generator.generateResponse(baseTurn, results);
    assert.ok(response.includes("Logged two eggs and toast (340 kcal)"));
    assert.ok(response.includes('Marked "Finish Pitch Deck" as complete'));
  });

  it("TEST 2: FAULT INJECTION — Truthfully reports failures and NEVER falsely claims success", () => {
    const results: KernelExecutionResult[] = [
      {
        actionId: "act_fail_1",
        idempotencyKey: "idem_fail",
        actionType: "complete_task",
        status: "FAILED",
        success: false,
        error: "[KERNEL_DATABASE_DISCONNECTED] MongoDB is unreachable",
        timestamp: Date.now(),
      },
    ];

    const response = generator.generateResponse(baseTurn, results);
    // Invariant: Must NOT claim task was marked complete
    assert.ok(!response.includes("Marked"));
    assert.ok(!response.includes("Done"));
    assert.ok(response.includes("I couldn't complete complete task: [KERNEL_DATABASE_DISCONNECTED] MongoDB is unreachable"));
  });

  it("TEST 3: PARTIAL COMPOUND FAILURE — Reports successes and failures accurately", () => {
    const results: KernelExecutionResult[] = [
      {
        actionId: "act_meal_ok",
        idempotencyKey: "idem_ok",
        actionType: "log_meal",
        status: "SUCCEEDED",
        success: true,
        data: { description: "protein shake", dailyTotals: { calories: 250 } },
        timestamp: Date.now(),
      },
      {
        actionId: "act_task_err",
        idempotencyKey: "idem_err",
        actionType: "complete_task",
        status: "FAILED",
        success: false,
        error: "Task ID not found in database",
        timestamp: Date.now(),
      },
    ];

    const response = generator.generateResponse(baseTurn, results);
    assert.ok(response.includes("Logged protein shake (250 kcal)"));
    assert.ok(response.includes("However, I couldn't complete complete task: Task ID not found in database"));
  });

  it("TEST 4: Clarification intercept returns question directly", () => {
    const turnWithClarification: SemanticTurn = {
      ...baseTurn,
      ambiguityStatus: "ENTITY_AMBIGUOUS",
      clarification: {
        required: true,
        questionToUser: 'I found multiple tasks matching "presentation". Which one did you mean?',
      },
    };

    const response = generator.generateResponse(turnWithClarification, []);
    assert.equal(response, 'I found multiple tasks matching "presentation". Which one did you mean?');
  });

  it("TEST 5: Cancellation turn returns cancellation confirmation", () => {
    const cancelTurn: SemanticTurn = {
      ...baseTurn,
      primaryClassification: "CANCEL_OR_DISMISS",
    };

    const response = generator.generateResponse(cancelTurn, []);
    assert.equal(response, "Understood. I've cancelled that.");
  });
});
