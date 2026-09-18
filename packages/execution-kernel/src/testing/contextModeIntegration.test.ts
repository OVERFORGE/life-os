import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContextModeService } from "../context/ContextModeService";
import { DEFAULT_MODE_CONFIGS, ContextModeRecord } from "../context/ContextModeContracts";
import { LifeStateEngine } from "../worldv2/LifeStateEngine";
import { GoalIntelligenceEngine } from "../worldv2/GoalIntelligenceEngine";
import { FastPathExecutor } from "../orchestration/supervisor/FastPathExecutor";
import { KernelCapabilityService } from "../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../orchestration/kernel/ActionAdapters";
import { SetContextModeAdapter, ClearContextModeAdapter } from "../orchestration/kernel/DefaultActionAdapters";
import { nameLifeEra } from "../../../../apps/web/features/insights/engine/nameLifeEra";
import { LifeEra } from "../../../../apps/web/features/insights/types";

import { ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";

describe("Context Modes (Seasons of Life) End-to-End Integration", () => {
  const service = ContextModeService.getInstance();

  it("1. ContextModeService manages lifecycle, tenant isolation, and auto-expiry", async () => {
    service.clearInMemoryStore();
    const userA = "usr_tenant_alpha";
    const userB = "usr_tenant_beta";

    // 1a. Default is Standard
    const defaultA = await service.getActiveMode(userA);
    assert.equal(defaultA.mode, "standard");
    assert.equal(defaultA.isActive, true);

    // 1b. Tenant isolation: set User A to Sprint
    const sprintA = await service.setMode({
      userId: userA,
      mode: "sprint",
      title: "Q4 Launch Sprint",
      durationDays: 7,
      targetGoalIds: ["goal_v3_core"],
      minSleepProtectionHours: 6.0,
    });
    assert.equal(sprintA.mode, "sprint");
    assert.equal(sprintA.config.targetGoalIds?.[0], "goal_v3_core");
    assert.equal(sprintA.config.minSleepProtectionHours, 6.0);
    assert.ok(sprintA.expiresAt! > Date.now());

    // User B must still be standard
    const activeB = await service.getActiveMode(userB);
    assert.equal(activeB.mode, "standard");

    // 1c. Transition User A to Sanctuary
    const sanctuaryA = await service.setMode({
      userId: userA,
      mode: "sanctuary",
      title: "Post-Launch Decompression",
      durationDays: 3,
    });
    assert.equal(sanctuaryA.mode, "sanctuary");

    // History contains both
    const historyA = await service.getHistory(userA);
    assert.equal(historyA.length, 2);
    assert.equal(historyA[0].mode, "sanctuary"); // newest first
    assert.equal(historyA[1].mode, "sprint");

    // 1d. Auto-expiry test
    const expiredRecord = await service.setMode({
      userId: "usr_expired_test",
      mode: "sabbatical",
      durationDays: -1, // already expired in the past
    });
    // Manually push expiresAt to past
    (expiredRecord as any).expiresAt = Date.now() - 5000;
    (service as any).inMemoryStore.set(expiredRecord.id, expiredRecord);

    const autoReverted = await service.getActiveMode("usr_expired_test");
    assert.equal(autoReverted.mode, "standard", "Expired custom mode must automatically revert to standard");
  });

  it("2. FastPathExecutor handles context mode conversational commands in <10ms with zero DAG jargon", async () => {
    service.clearInMemoryStore();
    const userId = "usr_fastpath_pilot";
    const registry = new ActionAdapterRegistry();
    registry.register("set_context_mode", new SetContextModeAdapter());
    registry.register("clear_context_mode", new ClearContextModeAdapter());
    const kernelCapability = new KernelCapabilityService(registry);
    const fastPath = new FastPathExecutor(kernelCapability);

    // 2a. Pattern matching assertions
    assert.equal(fastPath.canHandle("start sprint mode for 7 days"), true);
    assert.equal(fastPath.canHandle("enable sanctuary mode"), true);
    assert.equal(fastPath.canHandle("switch to sabbatical mode for 14 days"), true);
    assert.equal(fastPath.canHandle("exit sprint mode"), true);
    assert.equal(fastPath.canHandle("resume standard mode"), true);

    // 2b. Execution of "start sprint mode for 7 days"
    const t0 = Date.now();
    const res1 = await fastPath.execute("start sprint mode for 7 days", userId);
    const latency = Date.now() - t0;

    assert.equal(res1.handled, true);
    assert.ok(latency <= 50, `Latency was ${latency}ms, expected <= 50ms`);
    assert.match(res1.userResponse, /Sprint Mode activated for the next 7 days/i);
    // Invariant 28: Zero DAG jargon leaked
    assert.doesNotMatch(res1.userResponse, /node|dag|graph|dependency|executionnode/i);

    // Verify system state
    const activeAfterSprint = await service.getActiveMode(userId);
    assert.equal(activeAfterSprint.mode, "sprint");

    // 2c. Execution of "exit sprint mode"
    const res2 = await fastPath.execute("exit sprint mode", userId);
    assert.equal(res2.handled, true);
    assert.match(res2.userResponse, /Returned to Standard operational mode/i);

    const activeAfterClear = await service.getActiveMode(userId);
    assert.equal(activeAfterClear.mode, "standard");
  });

  it("3. LifeStateEngine modulates candidate scoring according to Context Mode", async () => {
    const lifeStateEngine = LifeStateEngine.getInstance();

    // 3a. Sanctuary Mode with zero task velocity:
    // Without SanctuaryMode, 0 tasks with normal stress might trigger Stagnant.
    const sanctuaryMode: ContextModeRecord = {
      id: "mode_sanc_1",
      userId: "usr_rest",
      mode: "sanctuary",
      title: "Sacred Reset",
      reason: "Recovery",
      startedAt: Date.now(),
      expiresAt: null,
      isActive: true,
      config: { ...DEFAULT_MODE_CONFIGS.sanctuary },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Low stress (0.15), good energy (0.80), good sleep (0.10 debt), 0 task velocity
    const observations = [
      { id: "o1", type: "HighPhysiologicalStress" as any, normalizedValue: 0.15, timestamp: Date.now() },
      { id: "o2", type: "EnergyDeficit" as any, normalizedValue: 0.20, timestamp: Date.now() },
      { id: "o3", type: "SleepDeprivation" as any, normalizedValue: 0.10, timestamp: Date.now() },
      { id: "o4", type: "TaskExecutionVelocity" as any, normalizedValue: 0.0, timestamp: Date.now() },
    ];

    const resultSanctuary = lifeStateEngine.evaluate({
      observations,
      contextMode: sanctuaryMode,
    });

    assert.notEqual(resultSanctuary.state, "Stagnant", "Sanctuary mode must never tag intentional zero velocity as Stagnant");
    assert.ok(["Recovery", "Stable"].includes(resultSanctuary.state), `Expected Recovery or Stable, got ${resultSanctuary.state}`);
    assert.ok(resultSanctuary.diagnostics.candidateScores.Stagnant < 0.10, "Stagnant candidate score must be heavily suppressed in Sanctuary mode");
    assert.ok(resultSanctuary.structuredEvidence.some((e) => e.metric === "ContextMode"), "Must include ContextMode structured evidence");

    // 3b. Sprint Mode with Eustress:
    // High stress (0.55), high velocity (0.95), sleep well-protected (0.15 debt)
    const sprintMode: ContextModeRecord = {
      id: "mode_sprint_1",
      userId: "usr_builder",
      mode: "sprint",
      title: "Launch Crucible",
      reason: "High velocity execution",
      startedAt: Date.now(),
      expiresAt: null,
      isActive: true,
      config: { ...DEFAULT_MODE_CONFIGS.sprint },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const sprintObs = [
      { id: "s1", type: "HighPhysiologicalStress" as any, normalizedValue: 0.55, timestamp: Date.now() },
      { id: "s2", type: "EnergyDeficit" as any, normalizedValue: 0.30, timestamp: Date.now() },
      { id: "s3", type: "SleepDeprivation" as any, normalizedValue: 0.15, timestamp: Date.now() },
      { id: "s4", type: "TaskExecutionVelocity" as any, normalizedValue: 0.95, timestamp: Date.now() },
    ];

    const resultSprint = lifeStateEngine.evaluate({
      observations: sprintObs,
      contextMode: sprintMode,
    });

    assert.notEqual(resultSprint.state, "Burnout", "Sprint mode with protected sleep must not false-alarm into Burnout");
    assert.ok(["FocusedExecution", "HighMomentum"].includes(resultSprint.state), `Expected FocusedExecution or HighMomentum, got ${resultSprint.state}`);
  });

  it("4. GoalIntelligenceEngine elevates sprint targets and defers secondary goals", async () => {
    const goalEngine = GoalIntelligenceEngine.getInstance();

    const mockGraphSnapshot: ExecutionGraphSnapshot = {
      rootNodes: [],
      readyNodes: [
        {
          id: "task_sprint_1",
          title: "Deploy V3 Core",
          entityType: "task",
          state: "ready",
          blockedBy: [],
          metadata: { goalId: "goal_core", dueDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString() },
        } as any,
        {
          id: "task_secondary_1",
          title: "Update Team Wiki",
          entityType: "task",
          state: "ready",
          blockedBy: [],
          metadata: { goalId: "goal_wiki", dueDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString() },
        } as any,
      ],
      blockedNodes: [],
      inProgressNodes: [],
      completedNodes: [],
      criticalPath: [
        { id: "task_sprint_1", entityType: "task", metadata: { goalId: "goal_core" } } as any,
      ],
      totalPressure: 50,
      nodeCount: 2,
    };

    const sprintMode: ContextModeRecord = {
      id: "mode_sprint_2",
      userId: "usr_alex",
      mode: "sprint",
      title: "Sprint Alpha",
      reason: "Focus",
      startedAt: Date.now(),
      expiresAt: null,
      isActive: true,
      config: {
        ...DEFAULT_MODE_CONFIGS.sprint,
        targetGoalIds: ["goal_core"],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const evaluatedGoals = goalEngine.evaluateGoals({
      graphSnapshot: mockGraphSnapshot,
      contextMode: sprintMode,
    });

    assert.equal(evaluatedGoals.length, 2);
    const targetGoal = evaluatedGoals.find((g) => g.goalId === "goal_core")!;
    const secondaryGoal = evaluatedGoals.find((g) => g.goalId === "goal_wiki")!;

    // Target goal maintains elevated strategic priority
    assert.equal(targetGoal.axes.strategicAlignment, 1.0);
    assert.ok(targetGoal.factors.some((f) => f.includes("Designated target goal of active Sprint Season")));

    // Secondary goal is deferred to protect focus
    assert.ok(secondaryGoal.axes.urgency <= 0.25, `Secondary goal urgency should be dampened, got ${secondaryGoal.axes.urgency}`);
    assert.ok(secondaryGoal.factors.some((f) => f.includes("deferred to protect sprint focus")));
    assert.ok(secondaryGoal.adaptations.some((a) => a.includes("Defer non-sprint goal tasks")));
  });

  it("5. GoalIntelligenceEngine suspends urgency in Sanctuary and Sabbatical seasons", async () => {
    const goalEngine = GoalIntelligenceEngine.getInstance();

    const mockGraphSnapshot: ExecutionGraphSnapshot = {
      rootNodes: [],
      readyNodes: [
        {
          id: "task_due_tomorrow",
          title: "Urgent Tax Filing",
          entityType: "task",
          state: "ready",
          blockedBy: [],
          metadata: { goalId: "goal_taxes", dueDate: new Date(Date.now() + 12 * 3600 * 1000).toISOString() },
        } as any,
      ],
      blockedNodes: [],
      inProgressNodes: [],
      completedNodes: [],
      criticalPath: [],
      totalPressure: 30,
      nodeCount: 1,
    };

    const sabbaticalMode: ContextModeRecord = {
      id: "mode_sabb_1",
      userId: "usr_alex",
      mode: "sabbatical",
      title: "European Sabbatical",
      reason: "Time off",
      startedAt: Date.now(),
      expiresAt: null,
      isActive: true,
      config: { ...DEFAULT_MODE_CONFIGS.sabbatical },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const results = goalEngine.evaluateGoals({
      graphSnapshot: mockGraphSnapshot,
      contextMode: sabbaticalMode,
    });

    assert.equal(results.length, 1);
    const goal = results[0];
    assert.ok(goal.axes.urgency <= 0.15, `Urgency should be clamped to 0.15 during sabbatical, got ${goal.axes.urgency}`);
    assert.equal(goal.status, "aligned", "Goal should remain in resting alignment during sabbatical");
    assert.ok(goal.factors.some((f) => f.includes("Urgency elevation suspended")));
  });

  it("6. nameLifeEra recognizes intentional Context Modes: The Crucible, The Sanctuary, The Sabbatical", () => {
    // 6a. Sprint Era -> The Crucible
    const sprintEra: LifeEra = {
      id: "era_1",
      from: "2026-06-01",
      to: "2026-06-21",
      phases: [
        {
          phase: "grind",
          startDate: "2026-06-01",
          endDate: "2026-06-21",
          durationDays: 21,
          confidence: 0.90,
          snapshot: { contextMode: "sprint" },
        },
      ],
      dominantPhase: "grind",
      direction: "up",
      volatility: 0.30,
      stability: 0.85,
      confidence: 0.90,
      summaryVector: { avgMood: 7.8, avgEnergy: 8.2, avgStress: 5.5, avgSleep: 7.0, avgDeepWork: 5.0 },
    };

    const narrativeSprint = nameLifeEra(sprintEra);
    assert.equal(narrativeSprint.title, "The Crucible");
    assert.equal(narrativeSprint.theme, "Sprint & Conquest");

    // 6b. Sanctuary Era -> The Sanctuary
    const sanctuaryEra: LifeEra = {
      id: "era_2",
      from: "2026-07-01",
      to: "2026-07-14",
      phases: [
        {
          phase: "recovery",
          startDate: "2026-07-01",
          endDate: "2026-07-14",
          durationDays: 14,
          confidence: 0.92,
          snapshot: { contextMode: "sanctuary" },
        },
      ],
      dominantPhase: "recovery",
      direction: "flat",
      volatility: 0.15,
      stability: 0.90,
      confidence: 0.92,
      summaryVector: { avgMood: 8.0, avgEnergy: 7.5, avgStress: 2.0, avgSleep: 8.5, avgDeepWork: 0.5 },
    };

    const narrativeSanctuary = nameLifeEra(sanctuaryEra);
    assert.equal(narrativeSanctuary.title, "The Sanctuary");
    assert.equal(narrativeSanctuary.theme, "Sanctuary & Healing");

    // 6c. Sabbatical Era -> The Sabbatical
    const sabbaticalEra: LifeEra = {
      id: "era_3",
      from: "2026-08-01",
      to: "2026-08-31",
      phases: [
        {
          phase: "balanced",
          startDate: "2026-08-01",
          endDate: "2026-08-31",
          durationDays: 31,
          confidence: 0.95,
          snapshot: { contextMode: "sabbatical" },
        },
      ],
      dominantPhase: "balanced",
      direction: "flat",
      volatility: 0.10,
      stability: 0.95,
      confidence: 0.95,
      summaryVector: { avgMood: 8.5, avgEnergy: 8.0, avgStress: 1.5, avgSleep: 8.0, avgDeepWork: 1.0 },
    };

    const narrativeSabbatical = nameLifeEra(sabbaticalEra);
    assert.equal(narrativeSabbatical.title, "The Sabbatical");
    assert.equal(narrativeSabbatical.theme, "Perspective & Renewal");
  });
});
