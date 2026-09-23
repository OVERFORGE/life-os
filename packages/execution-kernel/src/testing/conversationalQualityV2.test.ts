import test from "node:test";
import assert from "node:assert/strict";
import { SemanticIntentInterpreter } from "../orchestration/semantic/SemanticIntentInterpreter";
import { Supervisor } from "../orchestration/supervisor/Supervisor";

test("V2 Semantic Conversational Quality Suite", async (t) => {
  const interpreter = SemanticIntentInterpreter.getInstance();

  await t.test("Gratitude and praise must be classified as CASUAL_DIALOGUE with 0 operations", async () => {
    const turn = await interpreter.interpret("You're a life saviour. Thank you so much", {
      userId: "test_user_gratitude",
      timezone: "UTC",
      recentHistory: [
        { role: "user", content: "Can you just mark that task off? I am done with that." },
        { role: "assistant", content: "Marked \"Boil the milk\" as complete." },
      ],
    });

    assert.equal(turn.primaryClassification, "CASUAL_DIALOGUE", "Gratitude must be CASUAL_DIALOGUE");
    assert.equal(turn.operations.length, 0, "Gratitude must have 0 operations (no re-execution)");
  });

  await t.test("Conversational sign-off with incidental schedule mention must be CASUAL_DIALOGUE with 0 operations", async () => {
    const turn = await interpreter.interpret(
      "Well i have a meeting tomorrow and let's have the convo tomorrow now that's it for today",
      {
        userId: "test_user_signoff",
        timezone: "UTC",
        recentHistory: [
          { role: "user", content: "Can you tell me a poem?" },
          { role: "assistant", content: "The woods are lovely, dark and deep..." },
        ],
      }
    );

    assert.equal(turn.primaryClassification, "CASUAL_DIALOGUE", "Sign-off must be CASUAL_DIALOGUE");
    assert.equal(turn.operations.length, 0, "Sign-off must NOT create a task for incidental meeting mention");
  });

  await t.test("Acoustic vocative variation 'Hey vin, what's up' is understood as CASUAL_DIALOGUE greeting", async () => {
    const turn = await interpreter.interpret("Hey vin , what's up", {
      userId: "test_user_vocative",
      timezone: "UTC",
    });

    assert.equal(turn.primaryClassification, "CASUAL_DIALOGUE", "Greeting with misheard vocative must be CASUAL_DIALOGUE");
    assert.equal(turn.operations.length, 0, "Greeting must have 0 operations");
  });

  await t.test("Explicit task creation triggers ACTION_REQUEST with create_task", async () => {
    const turn = await interpreter.interpret("create a new task for me today that is to boil the milk at 5pm", {
      userId: "test_user_create",
      timezone: "UTC",
    });

    assert.equal(turn.primaryClassification, "ACTION_REQUEST", "Task command must be ACTION_REQUEST");
    assert.ok(turn.operations.length > 0, "Must contain at least 1 operation");
    assert.equal(turn.operations[0].actionType, "create_task", "Action type must be create_task");
  });

  await t.test("Supervisor emits model-driven semantic filler as Chunk 0 for action requests", async () => {
    const supervisor = Supervisor.createDefault();
    const chunks: string[] = [];

    const result = await supervisor.processRequest({
      userId: "test_user_filler",
      userName: "Daksh",
      message: "create a new task for me today that is to boil the milk at 5pm",
      onChunk: (chunk: string) => {
        chunks.push(chunk);
      },
    });

    assert.ok(chunks.length >= 1, "Must emit at least 1 chunk");
    // Verify first chunk is a natural semantic filler
    const firstChunk = chunks[0];
    const isNaturalFiller =
      firstChunk.includes("schedule that") ||
      firstChunk.includes("adding that") ||
      firstChunk.includes("agenda") ||
      firstChunk.includes("creating that") ||
      firstChunk.includes("Taking care of that") ||
      firstChunk.includes("setting that up") ||
      firstChunk.includes("setting up") ||
      firstChunk.includes("On it") ||
      firstChunk.includes("Right away");
    assert.ok(isNaturalFiller, `First chunk should be a semantic filler, got: "${firstChunk}"`);
  });
});
