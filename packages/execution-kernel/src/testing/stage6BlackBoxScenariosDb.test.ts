import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import { User } from "../../../../apps/web/server/db/models/User";
import { Task } from "../../../../apps/web/server/db/models/Task";
import { DailyLog } from "../../../../apps/web/server/db/models/DailyLog";
import { NutritionLog } from "../../../../apps/web/server/db/models/NutritionLog";
import { WorkoutSession } from "../../../../apps/web/server/db/models/WorkoutSession";
import { TemporalOccurrence } from "../../../../apps/web/server/db/models/TemporalOccurrence";
import { OutboxEventModel } from "../../../../apps/web/server/db/models/OutboxEventModel";
import { PersonalMemory } from "../../../../apps/web/server/db/models/PersonalMemory";
import { Goal } from "../../../../apps/web/features/goals/models/Goal";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { registerDefaultActionAdapters } from "../orchestration/kernel/DefaultActionAdapters";
import { ContextProjectionEngine } from "../orchestration/context/ContextProjectionEngine";
import { Supervisor } from "../orchestration/supervisor/Supervisor";
import { DynamicRouter } from "../orchestration/supervisor/DynamicRouter";
import { ScheduleSolver } from "../temporal/solver/ScheduleSolver";
import { SemanticIntentInterpreter } from "../orchestration/semantic/SemanticIntentInterpreter";
import { ConversationService } from "../services/ConversationService";
import { MemoryRepository } from "../memory/MemoryRepository";
import { setMockGroqChat, setMockGroqTextStream } from "../shared/groq";

describe("Stage 6.4: Black-Box End-to-End Scenarios A–E (DB-Backed)", () => {
  const prevRuntimeMode = process.env.LIFEOS_RUNTIME_MODE;

  before(async () => {
    process.env.LIFEOS_RUNTIME_MODE = "test";
    await connectIsolatedTestDB({ dbName: "life-os-stage6-4-blackbox" });
    registerDefaultActionAdapters(ActionAdapterRegistry.getInstance());
  });

  after(async () => {
    process.env.LIFEOS_RUNTIME_MODE = prevRuntimeMode;
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Task.deleteMany({}),
      DailyLog.deleteMany({}),
      NutritionLog.deleteMany({}),
      WorkoutSession.deleteMany({}),
      TemporalOccurrence.deleteMany({}),
      OutboxEventModel.deleteMany({}),
      PersonalMemory.deleteMany({}),
      Goal.deleteMany({}),
    ]);
    MemoryRepository.getInstance().clearInMemoryStore();
  });

  it("Scenario A: End-to-end ConversationService + Supervisor executes task creation & logs Outbox + headers", async () => {
    const user = await User.create({ name: "Scenario A User", email: "scenario_a@test.local" });
    const userId = String(user._id);

    const interpreter = SemanticIntentInterpreter.getInstance();
    interpreter.setMockChat(async () =>
      JSON.stringify({
        primaryClassification: "ACTION_REQUEST",
        ambiguityStatus: "UNAMBIGUOUS",
        conversationalSummary: "Created task Prepare Q4 Roadmap.",
        operations: [
          {
            domain: "productivity",
            actionType: "create_task",
            executionEligibility: "READY",
            payload: { title: "Prepare Q4 Roadmap", dueDate: "2026-11-28", priority: "high" },
          },
        ],
      })
    );
    setMockGroqChat(async () => "Done. Created task 'Prepare Q4 Roadmap' with high priority.");
    setMockGroqTextStream(async ({ onDelta }) => {
      const text = "Done. Created task 'Prepare Q4 Roadmap' with high priority.";
      if (onDelta) await onDelta(text);
      return text;
    });

    try {
      const response = await ConversationService.getInstance().executeUserRequest({
        userId,
        conversationId: "conv_scenario_a",
        message: "Add a high priority task to Prepare Q4 Roadmap for tomorrow",
      });

      assert.equal(response.status, 200);
      assert.ok(response.headers.get("x-lifeos-execution-id"), "Expected x-lifeos-execution-id header");
      assert.ok(response.headers.get("x-lifeos-route"), "Expected x-lifeos-route header");
      const body = await response.text();
      assert.doesNotMatch(body, /ExecutionNode|criticalPath|DAG/i);

      const created = await Task.findOne({ userId, title: "Prepare Q4 Roadmap" }).lean();
      assert.ok(created, "Task must be persisted in MongoDB");
      assert.equal((created as any).priority, "high");

      const outbox = await OutboxEventModel.find({ userId }).lean();
      assert.ok(outbox.length > 0, "Outbox event must be emitted atomically");
    } finally {
      interpreter.setMockChat(undefined);
      setMockGroqChat(undefined);
      setMockGroqTextStream(undefined);
    }
  });

  it("Scenario B: ContextProjectionEngine is epistemically honest on sparse user vs fully hydrated on dense 7-day user", async () => {
    const sparseUser = await User.create({ name: "Sparse", email: "sparse@test.local" });
    const denseUser = await User.create({ name: "Dense", email: "dense@test.local" });
    const sparseId = String(sparseUser._id);
    const denseId = String(denseUser._id);

    const kernel = KernelCapabilityService.getInstance();
    const engine = new ContextProjectionEngine();

    // 1. Sparse user — zero fabricated numeric defaults (D1)
    const sparseState = await kernel.readAuthoritativeState(sparseId);
    const sparseProd = engine.projectProductivity(sparseState);
    const sparseHealth = engine.projectHealth(sparseState);
    const sparseWellness = engine.projectWellness(sparseState);
    assert.equal(sparseProd.crossDomainSignals.cognitiveReadinessScore, null);
    assert.equal(sparseProd.crossDomainSignals.physicalEnergyLevel, "unknown");
    assert.equal(sparseHealth.biometricSummary.sleepDurationHours, null);
    assert.equal(sparseHealth.nutritionSummary.hydrationMl, null);
    assert.equal(sparseWellness.stressBand, "unknown");
    assert.equal(sparseHealth.dataStatus, "unknown");
    assert.ok(sparseHealth.missingDomains.length > 0);

    // 2. Dense user — 7 days of DailyLog, WorkoutSession, NutritionLog + PersonalMemory
    for (let i = 0; i < 7; i++) {
      const d = `2026-11-${String(20 + i).padStart(2, "0")}`;
      await DailyLog.create({
        userId: denseId,
        date: d,
        sleep: { hours: 7.5, quality: 8 },
        mental: { mood: 8, energy: 7, stress: 3 },
        signals: { hydrationMl: 2200 },
      });
    }
    await WorkoutSession.create({
      userId: denseId,
      date: new Date("2026-11-26T08:00:00Z"),
      dateOnly: "2026-11-26",
      workoutType: "strength",
      durationSeconds: 3300,
      status: "active",
    });
    await NutritionLog.create({
      userId: denseId,
      date: "2026-11-26",
      meals: [],
      dailyTotals: { calories: 2350, protein: 165, carbs: 220, fats: 70 },
    });
    await MemoryRepository.getInstance().save({
      id: "mem_dense_1",
      userId: denseId,
      content: "Prefers morning strength training before deep coding blocks.",
      summary: "Morning strength training preference",
      memoryType: "semantic_fact",
      domain: "health",
      confidence: 0.92,
      importance: 0.85,
      source: "explicit_user_statement",
      sourceConversationId: "conv_dense_b",
      status: "ACTIVE",
      validFrom: Date.now(),
      firstObservedAt: Date.now(),
      lastReinforcedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any);

    const denseState = await kernel.readAuthoritativeState(denseId);
    const denseHealth = engine.projectHealth(denseState);
    const denseWellness = engine.projectWellness(denseState);
    assert.equal(denseHealth.biometricSummary.sleepDurationHours, 7.5);
    assert.equal(denseHealth.nutritionSummary.hydrationMl, 2200);
    assert.equal(denseHealth.nutritionSummary.caloriesEstimate, 2350);
    assert.equal(denseWellness.sleepSummary.totalHours, 7.5);
    assert.notEqual(denseHealth.dataStatus, "unknown");
  });

  it("Scenario C: Goal-vs-Execution alignment grounds active Goals & Tasks without fabricating completion", async () => {
    const user = await User.create({ name: "Goal User", email: "goal_c@test.local" });
    const userId = String(user._id);

    const goal = await Goal.create({
      userId,
      title: "Run Half Marathon",
      status: "active",
      nature: "habitual_cadence",
      horizon: "3 Months",
      definitionOfDone: "Complete 21.1km race under 2h",
    });
    await Task.create({
      userId,
      title: "10km tempo run",
      dueDate: "2026-11-27",
      status: "pending",
      goalId: goal._id,
    });

    const kernel = KernelCapabilityService.getInstance();
    const state = await kernel.readAuthoritativeState(userId);
    const engine = new ContextProjectionEngine();
    const prod = engine.projectProductivity(state);
    assert.ok(prod.goals.some((g: any) => g.title === "Run Half Marathon"));
    assert.ok(prod.tasks.some((t: any) => t.title === "10km tempo run"));
    // Uncompleted task must remain pending, not fabricated as completed
    assert.equal(prod.tasks.find((t: any) => t.title === "10km tempo run")?.status, "pending");
  });

  it("Scenario D: Temporal feasibility allows open 3h slot and blocks impossible packed day", async () => {
    const user = await User.create({ name: "Schedule User", email: "sched_d@test.local" });
    const userId = String(user._id);
    const kernel = KernelCapabilityService.getInstance();

    // 1. Feasible 3h slot on 2026-11-28 (09:00 - 12:00)
    const feasibleProp = {
      id: "prop_d_ok",
      domain: "productivity" as const,
      actionType: "schedule_occurrence" as const,
      reversibility: "atomic_single_doc" as const,
      state: "APPROVED" as const,
      title: "Deep Architecture Work",
      rationale: "Open 3h morning slot",
      idempotencyKey: "d_ok_1",
      payload: {
        title: "Deep Architecture Work",
        dateOnly: "2026-11-28",
        startTime: "09:00",
        endTime: "12:00",
        timezone: "UTC",
        kind: "WORK_SESSION",
        rigidity: "ELASTIC",
      },
    };
    const valOk = await kernel.validateActionProposals(userId, [feasibleProp]);
    assert.equal(valOk.valid, true);
    const execOk = await kernel.executeAction(userId, feasibleProp);
    assert.equal(execOk.success, true);

    const savedOcc = await TemporalOccurrence.findOne({ userId, dateOnly: "2026-11-28" }).lean();
    assert.ok(savedOcc, "Feasible block must persist as TemporalOccurrence");

    // 2. Pack 2026-11-29 completely with an UNMOVABLE 14-hour block (08:00 - 22:00)
    await TemporalOccurrence.create({
      occurrenceId: `occ_packed_${Date.now()}`,
      userId,
      title: "All-Day Summit",
      kind: "HARD_EVENT",
      dateOnly: "2026-11-29",
      plannedInterval: {
        dateOnly: "2026-11-29",
        startMinute: 480,
        endMinute: 1320,
        durationMinutes: 840,
        startIsoUtc: "2026-11-29T08:00:00.000Z",
        endIsoUtc: "2026-11-29T22:00:00.000Z",
        timezone: "UTC",
        isMidnightCrossing: false,
      },
      locationContext: { category: "WORK_SITE" },
      rigidity: "UNMOVABLE",
      status: "SCHEDULED",
      overrideType: "NONE",
    });

    const packedOccurrences = await TemporalOccurrence.find({ userId, dateOnly: "2026-11-29" }).lean();
    const solver = ScheduleSolver.getInstance();
    const openCheck = solver.solvePlacement({
      dateOnly: "2026-11-28",
      idealStartMinute: 540,
      durationMinutes: 180,
      locationContext: { category: "WORK_SITE", requiresPhysicalTransit: false },
      existingOccurrences: [],
      allowLocalRepair: false,
    });
    assert.equal(openCheck.feasible, true, "Open 3h slot must be feasible");

    const packedCheck = solver.solvePlacement({
      dateOnly: "2026-11-29",
      idealStartMinute: 600,
      durationMinutes: 180,
      locationContext: { category: "WORK_SITE", requiresPhysicalTransit: false },
      existingOccurrences: packedOccurrences as any,
      allowLocalRepair: false,
    });
    assert.equal(packedCheck.feasible, false, "Overlapping UNMOVABLE block must fail feasibility check");
    assert.ok(packedCheck.reason?.includes("Collides with"));
  });

  it("Scenario E: >=12 unseen paraphrases route deterministically through SemanticTurn contracts with zero regex shortcuts", async () => {
    const router = new DynamicRouter();
    const paraphrases: Array<{
      utterance: string;
      turn: any;
      expectedStrategy: string;
    }> = [
      {
        utterance: "Knock out the tax prep item from my list",
        turn: {
          primaryClassification: "ACTION_REQUEST",
          ambiguityStatus: "UNAMBIGUOUS",
          operations: [{ domain: "productivity", actionType: "complete_task", executionEligibility: "READY", payload: { taskId: "t1" } }],
        },
        expectedStrategy: "FAST_PATH",
      },
      {
        utterance: "Put 78.2 kg on the scale for today",
        turn: {
          primaryClassification: "ACTION_REQUEST",
          ambiguityStatus: "UNAMBIGUOUS",
          operations: [{ domain: "health", actionType: "update_weight", executionEligibility: "READY", payload: { weight: 78.2 } }],
        },
        expectedStrategy: "FAST_PATH",
      },
      {
        utterance: "Chugged half a liter of water just now",
        turn: {
          primaryClassification: "ACTION_REQUEST",
          ambiguityStatus: "UNAMBIGUOUS",
          operations: [{ domain: "health", actionType: "log_water", executionEligibility: "READY", payload: { amountMl: 500 } }],
        },
        expectedStrategy: "FAST_PATH",
      },
      {
        utterance: "Book me a 45 min focus sprint after lunch",
        turn: {
          primaryClassification: "ACTION_REQUEST",
          ambiguityStatus: "UNAMBIGUOUS",
          operations: [{ domain: "productivity", actionType: "schedule_block", executionEligibility: "READY", payload: { title: "Focus Sprint" } }],
        },
        expectedStrategy: "FAST_PATH",
      },
      {
        utterance: "Slept terribly, around 4.5 hours",
        turn: {
          primaryClassification: "ACTION_REQUEST",
          ambiguityStatus: "UNAMBIGUOUS",
          operations: [{ domain: "health", actionType: "log_sleep", executionEligibility: "READY", payload: { hours: 4.5 } }],
        },
        expectedStrategy: "FAST_PATH",
      },
      {
        utterance: "Just finished a 40-minute kettlebell circuit",
        turn: {
          primaryClassification: "ACTION_REQUEST",
          ambiguityStatus: "UNAMBIGUOUS",
          operations: [{ domain: "health", actionType: "log_workout", executionEligibility: "READY", payload: { name: "Kettlebell", durationMinutes: 40 } }],
        },
        expectedStrategy: "FAST_PATH",
      },
      {
        utterance: "Good morning, just checking in",
        turn: {
          primaryClassification: "CASUAL_DIALOGUE",
          ambiguityStatus: "UNAMBIGUOUS",
          operations: [],
        },
        expectedStrategy: "CONVERSATIONAL_LLM",
      },
      {
        utterance: "Never mind, forget that",
        turn: {
          primaryClassification: "CANCEL_OR_DISMISS",
          ambiguityStatus: "UNAMBIGUOUS",
          operations: [],
        },
        expectedStrategy: "CONVERSATIONAL_LLM",
      },
      {
        utterance: "How did my sleep and training trend this week?",
        turn: {
          primaryClassification: "STATE_OBSERVATION",
          ambiguityStatus: "UNAMBIGUOUS",
          operations: [],
        },
        expectedStrategy: "CONVERSATIONAL_LLM",
      },
      {
        utterance: "Rebalance my deadlines while protecting my recovery",
        turn: {
          primaryClassification: "INFORMATION_QUERY",
          ambiguityStatus: "UNAMBIGUOUS",
          relevanceDomains: ["productivity", "wellness"],
          operations: [],
        },
        expectedStrategy: "MULTI_AGENT",
      },
      {
        utterance: "Find my open afternoon slot and schedule a review meeting there",
        turn: {
          primaryClassification: "PLANNING_REQUEST",
          ambiguityStatus: "UNAMBIGUOUS",
          operations: [
            { operationId: "s1", domain: "productivity", actionType: "read_calendar", executionEligibility: "READY", payload: {} },
            { operationId: "s2", domain: "productivity", actionType: "schedule_block", executionEligibility: "READY", dependencies: ["s1"], payload: { startMinute: "$ref:s1.slotStart" } },
          ],
        },
        expectedStrategy: "DYNAMIC_WORKFLOW",
      },
      {
        utterance: "Remember that I never take calls before 10am",
        turn: {
          primaryClassification: "ACTION_REQUEST",
          ambiguityStatus: "UNAMBIGUOUS",
          operations: [{ domain: "wellness", actionType: "save_memory", executionEligibility: "READY", payload: { content: "No calls before 10am" } }],
        },
        expectedStrategy: "FAST_PATH",
      },
    ];

    assert.ok(paraphrases.length >= 12);
    for (const item of paraphrases) {
      const decision = router.route(item.utterance, item.turn);
      assert.equal(
        decision.strategy,
        item.expectedStrategy,
        `Paraphrase "${item.utterance}" routed to ${decision.strategy}, expected ${item.expectedStrategy}`
      );
    }
  });
});
