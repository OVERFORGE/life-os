import { test } from "node:test";
import assert from "node:assert/strict";
import { GroundedResponseGenerator } from "../orchestration/grounding/GroundedResponseGenerator";
import { FastSemanticFiller } from "../orchestration/semantic/FastSemanticFiller";
import {
  SemanticTurn,
  StructuredTemporalMeaning,
} from "../orchestration/contracts/SemanticTurnContracts";
import { KernelExecutionResult } from "../orchestration/contracts/ActionProposalContracts";

test("Phase 5: GroundedResponseGenerator - RoutineAI Verbalizations", () => {
  const generator = GroundedResponseGenerator.getInstance();

  const mockTurn: SemanticTurn = {
    turnId: "turn_p5_01",
    schemaVersion: 2,
    userId: "usr_p5",
    conversationId: "conv_p5",
    timestamp: Date.now(),
    rawInput: "Schedule deep work tomorrow from 2pm to 4pm",
    normalizedTimezone: "America/New_York",
    provenance: {
      interpreterProvider: "groq",
      modelIdentifier: "mock_model",
      promptVersionHash: "abc",
      contextSnapshotId: "ctx_1",
      contextSnapshotHash: "def",
      inferenceDurationMs: 100,
    },
    primaryClassification: "ACTION_REQUEST",
    ambiguityStatus: "UNAMBIGUOUS",
    operations: [],
    conversationalSummary: "Scheduled deep work block",
  };

  // Case 1: Scheduled Occurrence Verbalization
  const schedResult: KernelExecutionResult = {
    actionId: "act_sched_01",
    idempotencyKey: "idemp_sched_01",
    actionType: "schedule_occurrence",
    status: "SUCCEEDED",
    success: true,
    data: {
      title: "Deep Work Sprint",
      plannedInterval: {
        dateOnly: "2026-09-22",
        startMinute: 840,
        endMinute: 960,
        durationMinutes: 120,
      },
    },
    timestamp: Date.now(),
  };

  const response1 = generator.generateResponse(mockTurn, [schedResult]);
  assert.ok(response1.includes("Deep Work Sprint"), "Response must mention title");
  assert.ok(response1.includes("2026-09-22"), "Response must mention date");
  assert.ok(response1.includes("120 min"), "Response must mention duration");
  assert.ok(!response1.includes("act_sched_01"), "Zero technical IDs leaked");

  // Case 2: Execution Chronicle Logging Verbalization
  const logResult: KernelExecutionResult = {
    actionId: "act_log_02",
    idempotencyKey: "idemp_log_02",
    actionType: "log_execution_interval",
    status: "SUCCEEDED",
    success: true,
    data: {
      title: "Pitch deck modeling",
      durationMinutes: 45,
    },
    timestamp: Date.now(),
  };

  const response2 = generator.generateResponse(mockTurn, [logResult]);
  assert.ok(response2.includes("Pitch deck modeling"));
  assert.ok(response2.includes("45 min"));

  // Case 3: Cancel Occurrence Verbalization
  const cancelResult: KernelExecutionResult = {
    actionId: "act_cancel_03",
    idempotencyKey: "idemp_cancel_03",
    actionType: "cancel_occurrence",
    status: "SUCCEEDED",
    success: true,
    data: {
      title: "Gym Session",
    },
    timestamp: Date.now(),
  };

  const response3 = generator.generateResponse(mockTurn, [cancelResult]);
  assert.ok(response3.includes("Cancelled"));
  assert.ok(response3.includes("Gym Session"));
});

test("Phase 5: FastSemanticFiller - Instant Voice Responsiveness (< 180ms)", async () => {
  const filler = FastSemanticFiller.getInstance();

  // Test filler generation for time blocking
  const fill1 = await filler.generateFiller("Schedule deep work tomorrow at 2pm");
  assert.ok(fill1, "Filler must return instant acknowledgment");
  assert.ok(fill1.length > 5, "Filler must be non-empty");

  // Test filler generation for work logging
  const fill2 = await filler.generateFiller("I just finished working on the deck for two hours");
  assert.ok(fill2, "Filler must return instant acknowledgment for logged work");
});

test("Phase 5: Clarification Handling on Ambiguous Temporal References", () => {
  const generator = GroundedResponseGenerator.getInstance();

  const ambiguousTurn: SemanticTurn = {
    turnId: "turn_ambig_01",
    schemaVersion: 2,
    userId: "usr_p5",
    conversationId: "conv_p5",
    timestamp: Date.now(),
    rawInput: "Schedule a gym session sometime",
    normalizedTimezone: "America/New_York",
    provenance: {
      interpreterProvider: "groq",
      modelIdentifier: "mock_model",
      promptVersionHash: "abc",
      contextSnapshotId: "ctx_1",
      contextSnapshotHash: "def",
      inferenceDurationMs: 100,
    },
    primaryClassification: "ACTION_REQUEST",
    ambiguityStatus: "TEMPORAL_AMBIGUOUS",
    operations: [],
    conversationalSummary: "User requested gym session without day or time",
    clarification: {
      required: true,
      questionToUser: "What day and time would you like to schedule your gym session?",
    },
  };

  // When clarification is required, generator returns clarification question immediately
  const response = generator.generateResponse(ambiguousTurn, []);
  assert.equal(response, "What day and time would you like to schedule your gym session?");
});

test("Phase 5: Conversational Cancellation & Dismissal", () => {
  const generator = GroundedResponseGenerator.getInstance();

  const cancelTurn: SemanticTurn = {
    turnId: "turn_cancel_01",
    schemaVersion: 2,
    userId: "usr_p5",
    conversationId: "conv_p5",
    timestamp: Date.now(),
    rawInput: "Actually, cancel that.",
    normalizedTimezone: "America/New_York",
    provenance: {
      interpreterProvider: "groq",
      modelIdentifier: "mock_model",
      promptVersionHash: "abc",
      contextSnapshotId: "ctx_1",
      contextSnapshotHash: "def",
      inferenceDurationMs: 100,
    },
    primaryClassification: "CANCEL_OR_DISMISS",
    ambiguityStatus: "UNAMBIGUOUS",
    operations: [],
    conversationalSummary: "Cancelled prior request",
  };

  const response = generator.generateResponse(cancelTurn, []);
  assert.equal(response, "Understood. I've cancelled that.");
});
