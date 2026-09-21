import { test } from "node:test";
import assert from "node:assert/strict";
import { SemanticIntentInterpreter } from "../orchestration/semantic/SemanticIntentInterpreter";
import { resolveTemporalExpression } from "../orchestration/semantic/temporalResolver";
import { NutritionEstimator } from "../nutrition/nutritionEstimator";
import { isOperationExecutable } from "../orchestration/contracts";

const TEST_USER_ID = "usr_phase3_test";
const TEST_TIMEZONE = "America/New_York";
// Fixed reference timestamp: Monday, Sept 21, 2026 14:00:00 UTC (10:00 AM EDT)
const FIXED_REF_TIME = new Date("2026-09-21T14:00:00Z").getTime();

test("Phase 3: Deterministic Temporal Resolver", () => {
  // 1. Tomorrow afternoon
  const t1 = resolveTemporalExpression("tomorrow afternoon", TEST_TIMEZONE, FIXED_REF_TIME);
  assert.equal(t1.dateOnly, "2026-09-22");
  assert.equal(t1.timeOnly, "14:00");
  assert.ok(t1.isoTimestamp.includes("2026-09-22"));

  // 2. Tonight
  const t2 = resolveTemporalExpression("tonight", TEST_TIMEZONE, FIXED_REF_TIME);
  assert.equal(t2.dateOnly, "2026-09-21");
  assert.equal(t2.timeOnly, "20:00");

  // 3. Next Friday at 3pm
  const t3 = resolveTemporalExpression("next friday at 3pm", TEST_TIMEZONE, FIXED_REF_TIME);
  assert.equal(t3.timeOnly, "15:00");
  assert.ok(t3.dateOnly > "2026-09-21");

  // 4. Relative offset "in 2 hours"
  const t4 = resolveTemporalExpression("in 2 hours", TEST_TIMEZONE, FIXED_REF_TIME);
  const diffHours = (new Date(t4.isoTimestamp).getTime() - FIXED_REF_TIME) / (1000 * 3600);
  assert.equal(diffHours, 2);

  // 5. Explicit ISO date
  const t5 = resolveTemporalExpression("2026-10-15", TEST_TIMEZONE, FIXED_REF_TIME);
  assert.equal(t5.dateOnly, "2026-10-15");
});

test("Phase 3: Pre-Kernel Nutrition Estimator", async () => {
  const estimator = NutritionEstimator.getInstance();

  // Test meal decomposition
  const result = await estimator.estimateMeal("2 scrambled eggs and 1 slice of toast");
  assert.ok(result.items.length >= 2, "Must decompose into at least 2 food items");
  assert.ok(result.totalCalories > 150, "Calories must be positive and realistic");
  assert.ok(result.totalProtein > 8, "Protein must be positive and realistic");

  // Check egg macros
  const eggItem = result.items.find((i) => i.name.includes("egg"));
  assert.ok(eggItem, "Egg item must be present");
  assert.equal(eggItem.quantity, 2);
  assert.ok(eggItem.calories >= 100);

  // Check toast macros
  const toastItem = result.items.find((i) => i.name.includes("toast") || i.name.includes("bread"));
  assert.ok(toastItem, "Toast item must be present");
  assert.ok(toastItem.carbs > 5);
});

test("Phase 3: Canonical Colloquial Semantic Interpretation", async () => {
  const interpreter = SemanticIntentInterpreter.getInstance();
  const baseCtx = {
    userId: TEST_USER_ID,
    timezone: TEST_TIMEZONE,
    referenceTimeMs: FIXED_REF_TIME,
  };

  // Case 1: Colloquial task creation with lead-in and relative time
  const turn1 = await interpreter.interpret(
    "Hey Aven, can you add a task to call Mom tomorrow afternoon?",
    baseCtx
  );
  assert.equal(turn1.primaryClassification, "ACTION_REQUEST");
  assert.equal(turn1.ambiguityStatus, "UNAMBIGUOUS");
  assert.equal(turn1.operations.length, 1);
  const op1 = turn1.operations[0];
  assert.equal(op1.domain, "productivity");
  assert.equal(op1.actionType, "create_task");
  assert.ok(op1.payload.title.toLowerCase().includes("mom"));
  assert.equal(op1.payload.dueDate, "2026-09-22");
  assert.equal(isOperationExecutable(op1).executable, true);

  // Case 2: Implicit operational request
  const turn2 = await interpreter.interpret(
    "Tomorrow I need to get the presentation deck finished.",
    baseCtx
  );
  assert.equal(turn2.primaryClassification, "ACTION_REQUEST");
  assert.equal(turn2.operations.length, 1);
  const op2 = turn2.operations[0];
  assert.equal(op2.actionType, "create_task");
  assert.ok(op2.payload.title.toLowerCase().includes("deck") || op2.payload.title.toLowerCase().includes("presentation"));
  assert.equal(op2.payload.dueDate, "2026-09-22");
  assert.equal(isOperationExecutable(op2).executable, true);

  // Case 3: Colloquial meal log
  const turn3 = await interpreter.interpret(
    "I had two eggs and toast for breakfast.",
    baseCtx
  );
  assert.equal(turn3.primaryClassification, "ACTION_REQUEST");
  assert.equal(turn3.operations.length, 1);
  const op3 = turn3.operations[0];
  assert.equal(op3.domain, "health");
  assert.equal(op3.actionType, "log_meal");
  assert.ok(op3.payload.items?.length >= 2, "Items must be enriched pre-kernel");
  assert.ok(op3.payload.totalCalories > 150);
  assert.equal(isOperationExecutable(op3).executable, true);

  // Case 4: Colloquial mental state / somatic report
  const turn4 = await interpreter.interpret(
    "I'm feeling completely exhausted today, energy is at zero.",
    baseCtx
  );
  assert.ok(turn4.primaryClassification === "ACTION_REQUEST" || turn4.primaryClassification === "STATE_OBSERVATION");
  assert.equal(turn4.operations.length, 1);
  const op4 = turn4.operations[0];
  assert.equal(op4.domain, "wellness");
  assert.equal(op4.actionType, "record_mental_estimate");
  assert.ok(turn4.affectiveEvidence?.reportedFatigue, "Reported fatigue must be true");
  assert.ok(turn4.affectiveEvidence?.energy?.value !== undefined && turn4.affectiveEvidence.energy.value <= 2);
  assert.equal(isOperationExecutable(op4).executable, true);

  // Case 5: Completion with contextual entity reference resolution
  const turn5 = await interpreter.interpret(
    "I finished the pitch deck, mark it done.",
    {
      ...baseCtx,
      knownTasks: [
        { id: "task_pitch_deck_101", title: "Complete Q3 Pitch Deck" },
        { id: "task_other_202", title: "Review Server Logs" },
      ],
    }
  );
  assert.equal(turn5.operations.length, 1);
  const op5 = turn5.operations[0];
  assert.equal(op5.actionType, "complete_task");
  assert.equal(op5.payload.taskId, "task_pitch_deck_101", "Contextual entity resolution must map to known task");
  assert.equal(op5.targetReference?.resolvedEntityId, "task_pitch_deck_101");
  assert.equal(isOperationExecutable(op5).executable, true);
});

test("Phase 3: Compound Multi-Domain Semantic Interpretation", async () => {
  const interpreter = SemanticIntentInterpreter.getInstance();
  const baseCtx = {
    userId: TEST_USER_ID,
    timezone: TEST_TIMEZONE,
    referenceTimeMs: FIXED_REF_TIME,
  };

  // Compound Turn: Meal + Somatic State + Task Creation
  const compoundTurn = await interpreter.interpret(
    "I had a protein shake after the gym, I'm exhausted, and remind me to finish the deck tomorrow.",
    baseCtx
  );

  assert.equal(compoundTurn.primaryClassification, "ACTION_REQUEST");
  assert.ok(compoundTurn.operations.length >= 2, "Must extract multiple operations for compound turn");

  const mealOp = compoundTurn.operations.find((o) => o.actionType === "log_meal");
  assert.ok(mealOp, "Must extract log_meal operation");
  assert.ok(mealOp.payload.description.toLowerCase().includes("shake") || mealOp.payload.description.toLowerCase().includes("protein"));

  const mentalOp = compoundTurn.operations.find((o) => o.actionType === "record_mental_estimate");
  assert.ok(mentalOp, "Must extract record_mental_estimate operation");

  const taskOp = compoundTurn.operations.find((o) => o.actionType === "create_task");
  assert.ok(taskOp, "Must extract create_task operation");
  assert.ok(taskOp.payload.title.toLowerCase().includes("deck"));
  assert.equal(taskOp.payload.dueDate, "2026-09-22");

  // Verify all operations pass deterministic policy gate
  for (const op of compoundTurn.operations) {
    assert.equal(isOperationExecutable(op).executable, true);
  }
});

test("Phase 3: Negation, Cancellation & Casual Banter", async () => {
  const interpreter = SemanticIntentInterpreter.getInstance();
  const baseCtx = {
    userId: TEST_USER_ID,
    timezone: TEST_TIMEZONE,
    referenceTimeMs: FIXED_REF_TIME,
  };

  // Negation / Cancellation
  const cancelTurn = await interpreter.interpret("Actually, don't add that task.", baseCtx);
  assert.equal(cancelTurn.primaryClassification, "CANCEL_OR_DISMISS");
  assert.equal(cancelTurn.operations.length, 0, "No operations must be proposed on cancellation");

  // Casual Dialogue
  const chatTurn = await interpreter.interpret("Hello Aven, how's it going today?", baseCtx);
  assert.equal(chatTurn.primaryClassification, "CASUAL_DIALOGUE");
  assert.equal(chatTurn.operations.length, 0, "No state operations on casual chat");
});

test("Phase 3: Provenance & Replay Integrity", async () => {
  const interpreter = SemanticIntentInterpreter.getInstance();
  const turn = await interpreter.interpret("Read 15 pages tonight", {
    userId: TEST_USER_ID,
    timezone: TEST_TIMEZONE,
    referenceTimeMs: FIXED_REF_TIME,
  });

  assert.ok(turn.turnId.startsWith("turn_"), "Valid turnId");
  assert.equal(turn.schemaVersion, 2, "Schema version 2");
  assert.ok(turn.provenance.promptVersionHash.length === 64, "SHA-256 prompt hash present");
  assert.ok(turn.provenance.inferenceDurationMs >= 0, "Duration tracked");
  assert.ok(turn.provenance.modelIdentifier, "Model identifier present");
});
