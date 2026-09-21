import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env") });

import { AuthoritativeEntityResolver } from "../orchestration/context/AuthoritativeEntityResolver";
import { SemanticIntentInterpreter } from "../orchestration/semantic/SemanticIntentInterpreter";
import { Supervisor } from "../orchestration/supervisor/Supervisor";

describe("PHASE 6: Authoritative Entity Resolution & Zero-Tolerance Ambiguity", () => {
  const userId = new mongoose.Types.ObjectId().toString();

  before(async () => {
    if (process.env.MONGODB_URI && mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
  });

  after(async () => {
    if (mongoose.connection.readyState === 1) {
      const { Task } = await import("@/server/db/models/Task");
      await Task.deleteMany({ userId: new mongoose.Types.ObjectId(userId) });
    }
  });

  it("TEST 1: Single Candidate Resolution without ambiguity", async () => {
    const resolver = AuthoritativeEntityResolver.getInstance();
    const knownTasks = [
      { id: "task_pitch_101", title: "Finalize Pitch Deck" },
      { id: "task_grocery_102", title: "Buy groceries" },
    ];

    const outcome = await resolver.resolveTask(userId, "pitch deck", "pending", knownTasks);
    assert.equal(outcome.status, "RESOLVED");
    if (outcome.status === "RESOLVED") {
      assert.equal(outcome.entityId, "task_pitch_101");
      assert.equal(outcome.title, "Finalize Pitch Deck");
    }
  });

  it("TEST 2: Multiple Candidate Ambiguity strictly triggers CLARIFICATION and halts execution", async () => {
    const resolver = AuthoritativeEntityResolver.getInstance();
    const knownTasks = [
      { id: "task_pres_01", title: "Board Presentation Slides" },
      { id: "task_pres_02", title: "Investor Presentation Pitch" },
    ];

    const outcome = await resolver.resolveTask(userId, "presentation", "pending", knownTasks);
    assert.equal(outcome.status, "AMBIGUOUS");
    if (outcome.status === "AMBIGUOUS") {
      assert.equal(outcome.candidateIds.length, 2);
      assert.ok(outcome.candidateTitles.includes("Board Presentation Slides"));
      assert.ok(outcome.candidateTitles.includes("Investor Presentation Pitch"));
      assert.ok(outcome.clarificationQuestion.includes("Which one did you mean?"));
    }
  });

  it("TEST 3: Zero Candidates strictly triggers NOT_FOUND clarification", async () => {
    const resolver = AuthoritativeEntityResolver.getInstance();
    const knownTasks = [
      { id: "task_gym_01", title: "Leg day workout" },
    ];

    const outcome = await resolver.resolveTask(userId, "tax audit", "pending", knownTasks);
    assert.equal(outcome.status, "NOT_FOUND");
    if (outcome.status === "NOT_FOUND") {
      assert.ok(outcome.clarificationQuestion.includes("tax audit"));
    }
  });

  it("TEST 4: Exact title match takes precedence over ambiguous substring", async () => {
    const resolver = AuthoritativeEntityResolver.getInstance();
    const knownTasks = [
      { id: "task_exact", title: "Review Contract" },
      { id: "task_other", title: "Review Contract Notes" },
    ];

    const outcome = await resolver.resolveTask(userId, "Review Contract", "pending", knownTasks);
    assert.equal(outcome.status, "RESOLVED");
    if (outcome.status === "RESOLVED") {
      assert.equal(outcome.entityId, "task_exact");
    }
  });

  it("TEST 5: End-to-End Supervisor Clarification Interception with ZERO Mutations", async () => {
    const supervisor = Supervisor.getInstance();
    const knownTasks = [
      { id: "task_alpha", title: "Prepare Q3 Financial Review" },
      { id: "task_beta", title: "Prepare Q4 Financial Review" },
    ];

    // User says "I completed the financial review" -> ambiguous between Q3 and Q4!
    const result = await supervisor.processRequest({
      userId,
      message: "I completed the financial review, mark it done",
      knownTasks,
    });

    // Invariant: 0 actions executed when entity is ambiguous
    assert.equal(result.actionsExecuted, 0);
    assert.equal(result.terminationReason, "AWAITING_CLARIFICATION");
    assert.ok(
      result.response.includes("Q3 Financial Review") ||
      result.response.includes("Q4 Financial Review") ||
      result.response.includes("multiple tasks") ||
      result.response.includes("Which one")
    );
  });
});
