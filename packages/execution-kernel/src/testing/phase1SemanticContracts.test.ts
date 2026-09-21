import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SemanticTurn,
  SemanticOperation,
  isOperationExecutable,
  CreateTaskPayload,
  LogMealPayload,
  RecordMentalStatePayload,
  ProposeGoalPayload,
} from "../orchestration/contracts";

test("Phase 1: Canonical SemanticTurn Contract & Replay Serialization", () => {
  const turn: SemanticTurn = {
    turnId: "turn_replay_test_001",
    schemaVersion: 2,
    userId: "usr_alex_chen",
    conversationId: "conv_test_123",
    timestamp: 1789999000000,
    rawInput: "I had two eggs and toast for breakfast and I'm exhausted, keep today light.",
    normalizedTimezone: "America/New_York",
    provenance: {
      interpreterProvider: "groq",
      modelIdentifier: "openai/gpt-oss-120b",
      promptVersionHash: "sha256_e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      contextSnapshotId: "ctx_snap_001",
      contextSnapshotHash: "sha256_ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
      inferenceDurationMs: 245,
    },
    primaryClassification: "ACTION_REQUEST",
    ambiguityStatus: "UNAMBIGUOUS",
    operations: [
      {
        operationId: "op_01",
        domain: "health",
        actionType: "log_meal",
        riskClass: "LOW_REVERSIBLE",
        payload: {
          description: "2 eggs and toast",
          mealType: "breakfast",
          items: [
            { name: "eggs", quantity: 2, calories: 140, protein: 12, carbs: 1, fats: 10 },
            { name: "toast", quantity: 1, calories: 80, protein: 3, carbs: 15, fats: 1 },
          ],
          totalCalories: 220,
          enrichmentSource: "ai_nutrition_estimator",
        } as LogMealPayload,
        dependencies: [],
        executionEligibility: "READY",
      },
      {
        operationId: "op_02",
        domain: "wellness",
        actionType: "record_mental_estimate",
        riskClass: "LOW_REVERSIBLE",
        payload: {
          date: "2026-09-21",
          energy: 2,
          stress: 7,
          verbatimEvidence: "exhausted",
        } as RecordMentalStatePayload,
        dependencies: [],
        executionEligibility: "READY",
      },
    ],
    affectiveEvidence: {
      energy: { value: 2, confidence: 0.95 },
      stress: { value: 7, confidence: 0.9 },
      reportedFatigue: true,
      somaticSymptoms: ["exhaustion"],
      rawVerbatim: "I'm exhausted",
    },
    conversationalSummary: "User logged breakfast of 2 eggs and toast, reported low energy (2/10).",
  };

  // 1. Assert required fields
  assert.equal(turn.schemaVersion, 2);
  assert.equal(turn.operations.length, 2);
  assert.equal(turn.provenance.modelIdentifier, "openai/gpt-oss-120b");

  // 2. Test bit-exact JSON serialization for deterministic replay
  const serialized = JSON.stringify(turn);
  const deserialized: SemanticTurn = JSON.parse(serialized);

  assert.equal(deserialized.turnId, turn.turnId);
  assert.equal(deserialized.provenance.promptVersionHash, turn.provenance.promptVersionHash);
  assert.equal(deserialized.operations[0].actionType, "log_meal");
  assert.equal(deserialized.operations[1].actionType, "record_mental_estimate");
});

test("Phase 1: Deterministic Policy Gate (Replaces 0.80 LLM Confidence)", () => {
  // Case A: Missing required title for create_task must be rejected deterministically
  const invalidTaskOp: SemanticOperation = {
    operationId: "op_task_invalid",
    domain: "productivity",
    actionType: "create_task",
    riskClass: "LOW_REVERSIBLE",
    payload: { title: "" } as CreateTaskPayload,
    dependencies: [],
    executionEligibility: "READY",
  };
  const taskCheck = isOperationExecutable(invalidTaskOp);
  assert.equal(taskCheck.executable, false);
  assert.ok(taskCheck.reason?.includes("Task title is required"));

  // Case B: Ambiguous candidate entities must be rejected deterministically
  const ambiguousEntityOp: SemanticOperation = {
    operationId: "op_complete_ambiguous",
    domain: "productivity",
    actionType: "complete_task",
    riskClass: "LOW_REVERSIBLE",
    targetReference: {
      referenceId: "ref_01",
      rawExpression: "the presentation",
      entityType: "task",
      resolutionStrategy: "AMBIGUOUS_CANDIDATES",
      candidateIds: ["task_board_pres", "task_pitch_pres"],
    },
    payload: {},
    dependencies: [],
    executionEligibility: "READY",
  };
  const entityCheck = isOperationExecutable(ambiguousEntityOp);
  assert.equal(entityCheck.executable, false);
  assert.ok(entityCheck.reason?.includes("ambiguous (multiple candidates matched)"));

  // Case C: Ambiguous temporal expressions must be rejected deterministically
  const ambiguousTimeOp: SemanticOperation = {
    operationId: "op_task_vague_time",
    domain: "productivity",
    actionType: "create_task",
    riskClass: "LOW_REVERSIBLE",
    temporal: {
      rawExpression: "sometime later",
      type: "TIME_OF_DAY_RANGE",
      timezone: "America/New_York",
      isAmbiguous: true,
    },
    payload: { title: "Review contract" } as CreateTaskPayload,
    dependencies: [],
    executionEligibility: "READY",
  };
  const timeCheck = isOperationExecutable(ambiguousTimeOp);
  assert.equal(timeCheck.executable, false);
  assert.ok(timeCheck.reason?.includes("Temporal timeframe is ambiguous"));

  // Case D: Valid, complete operation must pass
  const validOp: SemanticOperation = {
    operationId: "op_valid_01",
    domain: "productivity",
    actionType: "create_task",
    riskClass: "LOW_REVERSIBLE",
    temporal: {
      rawExpression: "tomorrow at 3pm",
      type: "POINT_IN_TIME",
      resolvedDate: "2026-09-22",
      resolvedTime: "15:00",
      timezone: "America/New_York",
      isAmbiguous: false,
    },
    payload: {
      title: "Call accountant",
      dueDate: "2026-09-22",
      dueTime: "15:00",
    } as CreateTaskPayload,
    dependencies: [],
    executionEligibility: "READY",
  };
  const validCheck = isOperationExecutable(validOp);
  assert.equal(validCheck.executable, true);
});
