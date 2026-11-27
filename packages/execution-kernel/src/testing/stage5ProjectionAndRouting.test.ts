import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { connectIsolatedTestDB, disconnectIsolatedTestDB } from "./helpers/testDbIsolation";
import {
  ContextProjectionEngine,
  FORBIDDEN_PRODUCTIVITY_FIELDS,
  FORBIDDEN_HEALTH_FIELDS,
  FORBIDDEN_WELLNESS_FIELDS,
} from "../orchestration/context/ContextProjectionEngine";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ProductivityAgent } from "../orchestration/specialists/ProductivityAgent";
import { HealthAgent } from "../orchestration/specialists/HealthAgent";
import { WellnessAgent } from "../orchestration/specialists/WellnessAgent";
import { SynthesisEngine } from "../orchestration/synthesis/SynthesisEngine";
import { DynamicRouter } from "../orchestration/supervisor/DynamicRouter";
import { MockLLMProvider } from "./fixtures/mockLLMProvider";
import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { DailyLog } from "../../../../apps/web/server/db/models/DailyLog";
import { NutritionLog } from "../../../../apps/web/server/db/models/NutritionLog";
import { WorkoutSession } from "../../../../apps/web/server/db/models/WorkoutSession";
import { CognitiveStateHistoryModel } from "../server/db/models/CognitiveStateHistoryModel";
import { Task } from "../../../../apps/web/server/db/models/Task";
import { Goal } from "../../../../apps/web/features/goals/models/Goal";
import { SemanticTurn } from "../orchestration/contracts/SemanticTurnContracts";

function makeSemanticTurn(overrides: Partial<SemanticTurn> = {}): SemanticTurn {
  return {
    turnId: "turn_5_5",
    schemaVersion: 2,
    userId: "u_5_5",
    conversationId: "conv_5_5",
    timestamp: Date.now(),
    rawInput: "How is my recovery and workload?",
    normalizedTimezone: "UTC",
    provenance: {
      interpreterProvider: "groq",
      modelIdentifier: "test-model",
      promptVersionHash: "hash",
      contextSnapshotId: "snap",
      contextSnapshotHash: "chash",
      inferenceDurationMs: 10,
    },
    primaryClassification: "INFORMATION_QUERY",
    ambiguityStatus: "UNAMBIGUOUS",
    operations: [],
    conversationalSummary: "Status check",
    ...overrides,
  };
}

describe("Stage 5 Increment 5.5: ContextProjectionEngine Truthful Hydration & Multi-Agent Alignment", () => {
  before(async () => {
    await connectIsolatedTestDB({ dbName: "life-os-stage5-5-test" });
    await Promise.all([
      DailyLog.syncIndexes(),
      NutritionLog.syncIndexes(),
      WorkoutSession.syncIndexes(),
      CognitiveStateHistoryModel.syncIndexes(),
      Task.syncIndexes(),
      Goal.syncIndexes(),
    ]);
  });

  after(async () => {
    await disconnectIsolatedTestDB({ dropDatabase: true });
  });

  beforeEach(async () => {
    await Promise.all([
      DailyLog.deleteMany({}),
      NutritionLog.deleteMany({}),
      WorkoutSession.deleteMany({}),
      CognitiveStateHistoryModel.deleteMany({}),
      Task.deleteMany({}),
      Goal.deleteMany({}),
    ]);
  });

  it("5.5-01: Empty user state yields null / 'unknown' projections, non-empty missingDomains, deep-frozen, zero leaks", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const kernel = new KernelCapabilityService();
    const state = await kernel.readAuthoritativeState(userId);
    const engine = new ContextProjectionEngine();

    const prod = engine.projectProductivity(state);
    const health = engine.projectHealth(state);
    const wellness = engine.projectWellness(state);

    assert.equal(prod.crossDomainSignals.cognitiveReadinessScore, null);
    assert.equal(prod.crossDomainSignals.physicalEnergyLevel, "unknown");
    assert.equal(prod.crossDomainSignals.recoveryBand, "unknown");
    assert.equal(prod.dataStatus, "unknown");
    assert.ok(prod.missingDomains.length > 0);
    assert.ok(Object.isFrozen(prod));

    assert.equal(health.trainingStatus, "unknown");
    assert.equal(health.biometricSummary.physicalRecoveryScore, null);
    assert.equal(health.biometricSummary.sleepDurationHours, null);
    assert.equal(health.nutritionSummary.hydrationMl, null);
    assert.equal(health.nutritionSummary.caloriesEstimate, null);
    assert.equal(health.dataStatus, "unknown");
    assert.ok(health.missingDomains.length > 0);
    assert.ok(Object.isFrozen(health));

    assert.equal(wellness.recoveryCapacity, null);
    assert.equal(wellness.mentalBandwidthScore, null);
    assert.equal(wellness.stressBand, "unknown");
    assert.equal(wellness.sleepSummary.totalHours, null);
    assert.equal(wellness.sleepSummary.perceivedQuality, "unknown");
    assert.equal(wellness.dataStatus, "unknown");
    assert.ok(wellness.missingDomains.length > 0);
    assert.ok(Object.isFrozen(wellness));

    for (const f of FORBIDDEN_PRODUCTIVITY_FIELDS) {
      assert.equal(JSON.stringify(prod).toLowerCase().includes(`"${f.toLowerCase()}":`), false);
    }
    for (const f of FORBIDDEN_HEALTH_FIELDS) {
      assert.equal(JSON.stringify(health).toLowerCase().includes(`"${f.toLowerCase()}":`), false);
    }
    for (const f of FORBIDDEN_WELLNESS_FIELDS) {
      assert.equal(JSON.stringify(wellness).toLowerCase().includes(`"${f.toLowerCase()}":`), false);
    }
  });

  it("5.5-02: Hydrated user state populates authentic values from DailyLog, NutritionLog, WorkoutSession, CognitiveStateHistory & ExecutionGraph", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const today = "2026-11-26";

    await DailyLog.create({
      userId,
      date: today,
      sleep: { hours: 7.2, quality: 7 },
      mental: { mood: 8, energy: 8, stress: 3, focus: 8 },
      physical: { calories: 1950 },
      signals: { hydrationMl: 2100 },
    });

    await NutritionLog.create({
      userId,
      date: today,
      meals: [],
      dailyTotals: { calories: 1950, protein: 140, carbs: 180, fats: 65 },
    });

    await WorkoutSession.create({
      userId,
      dateOnly: today,
      workoutType: "push_day",
      intensity: "high",
      durationSeconds: 55 * 60,
      startedAt: new Date(),
    });

    const nowMs = Date.now();
    await CognitiveStateHistoryModel.create({
      userId,
      timestamp: nowMs,
      focusReadiness: { estimate: 0.82, confidence: 0.9, primaryFactors: ["sleep"] },
      stress: { estimate: 0.3, confidence: 0.85, primaryFactors: ["workload"] },
      energy: { estimate: 0.84, confidence: 0.9, primaryFactors: ["recovery"] },
      cognitiveLoad: { estimate: 0.4, confidence: 0.85, primaryFactors: ["tasks"] },
      provenance: "USER_MICRO_CHECKIN",
      temporalValidity: {
        validFrom: nowMs,
        validUntil: nowMs + 3600000,
        freshnessTimestamp: nowMs,
      },
      lastEventId: "evt_hyd_5_5",
    });

    await Goal.create({
      userId,
      title: "Ship Stage 5",
      type: "performance",
      status: "active",
      priority: 3,
    });

    await Task.create({
      userId,
      title: "Secret Project Alpha Task",
      dueDate: today,
      status: "pending",
      priority: "high",
    });

    const kernel = new KernelCapabilityService();
    const state = await kernel.readAuthoritativeState(userId);
    const engine = new ContextProjectionEngine();

    const prod = engine.projectProductivity(state);
    const health = engine.projectHealth(state);
    const wellness = engine.projectWellness(state);

    assert.equal(prod.dataStatus, "grounded");
    assert.ok(prod.tasks.some((t) => t.title === "Secret Project Alpha Task"));
    assert.ok(prod.goals.some((g) => g.title === "Ship Stage 5"));
    assert.equal(prod.crossDomainSignals.cognitiveReadinessScore, 82);
    assert.equal(prod.crossDomainSignals.physicalEnergyLevel, "high");

    assert.equal(health.dataStatus, "grounded");
    assert.equal(health.biometricSummary.physicalRecoveryScore, 84);
    assert.equal(health.biometricSummary.sleepDurationHours, 7.2);
    assert.equal(health.nutritionSummary.caloriesEstimate, 1950);
    assert.equal(health.nutritionSummary.hydrationMl, 2100);
    assert.equal(health.recentWorkouts.length, 1);
    assert.equal(JSON.stringify(health).includes("Secret Project Alpha Task"), false);

    assert.equal(wellness.dataStatus, "grounded");
    assert.equal(wellness.recoveryCapacity, 84);
    assert.equal(wellness.mentalBandwidthScore, 70);
    assert.equal(wellness.stressBand, "low");
    assert.equal(wellness.sleepSummary.totalHours, 7.2);
    assert.equal(wellness.sleepSummary.perceivedQuality, "good");
  });

  it("5.5-03: All three specialists and SynthesisEngine handle nullable/'unknown' projections safely and surface epistemic grounding note", async () => {
    const emptyEngine = new ContextProjectionEngine();
    const emptyState = {
      userId: "u_empty_spec",
      timestamp: Date.now(),
      graphSnapshot: new ExecutionGraph().createSnapshot(),
      worldSnapshot: (await new KernelCapabilityService().readAuthoritativeState("u_empty_spec")).worldSnapshot,
      domainSnapshot: {
        dailyLog: null,
        nutrition: null,
        recentWorkouts: [],
        cognitiveState: null,
        missingDomains: ["dailyLog", "nutrition", "workouts", "cognitiveState"],
      },
    };

    const prodProj = emptyEngine.projectProductivity(emptyState);
    const healthProj = emptyEngine.projectHealth(emptyState);
    const wellProj = emptyEngine.projectWellness(emptyState);

    const mockLLM = new MockLLMProvider([
      {
        pattern: /./,
        response: {
          summary: "Current telemetry is missing; no fabricated metrics assumed.",
          observations: [],
          estimates: [],
          hypotheses: [],
          proposals: [],
          confidence: 0.6,
        },
      },
    ]);

    const prodAgent = new ProductivityAgent(mockLLM);
    const healthAgent = new HealthAgent(mockLLM);
    const wellAgent = new WellnessAgent(mockLLM);

    const [pOut, hOut, wOut] = await Promise.all([
      prodAgent.analyze(
        { taskId: "t1", executionId: "e1", domain: "productivity", instruction: "Review workload", constraints: [] },
        prodProj
      ),
      healthAgent.analyze(
        { taskId: "t2", executionId: "e1", domain: "health", instruction: "Review recovery", constraints: [] },
        healthProj
      ),
      wellAgent.analyze(
        { taskId: "t3", executionId: "e1", domain: "wellness", instruction: "Review stress", constraints: [] },
        wellProj
      ),
    ]);

    const synthesis = new SynthesisEngine().synthesize([pOut, hOut, wOut], "Review status");
    assert.ok(synthesis.summary.length > 0);
    assert.equal(synthesis.approvedProposals.length, 0);
  });

  it("5.5-04: DynamicRouter routes grounded advisory turns and DYNAMIC_WORKFLOW plans coherently with zero dead branches", () => {
    const router = new DynamicRouter();

    const multiAdvisory = router.route(
      "How do my sleep and task load interact?",
      makeSemanticTurn({
        primaryClassification: "INFORMATION_QUERY",
        operations: [],
        requiresRetrieval: false,
        relevanceDomains: ["TASKS", "HEALTH"],
      })
    );
    assert.equal(multiAdvisory.strategy, "MULTI_AGENT");
    assert.deepEqual(multiAdvisory.selectedSpecialists, ["productivity", "health"]);

    const singleAdvisory = router.route(
      "How is my recovery?",
      makeSemanticTurn({
        primaryClassification: "INFORMATION_QUERY",
        operations: [],
        requiresRetrieval: false,
        relevanceDomains: ["HEALTH"],
      })
    );
    assert.equal(singleAdvisory.strategy, "SINGLE_SPECIALIST");
    assert.equal(singleAdvisory.targetDomain, "health");

    const investigative = router.route(
      "Analyze my last 7 days of energy and workouts",
      makeSemanticTurn({
        primaryClassification: "INFORMATION_QUERY",
        operations: [],
        requiresRetrieval: true,
        objectiveComplexity: "INVESTIGATIVE",
      })
    );
    assert.equal(investigative.strategy, "DYNAMIC_WORKFLOW");
  });
});
