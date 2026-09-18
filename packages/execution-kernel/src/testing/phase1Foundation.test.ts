import test from "node:test";
import assert from "node:assert/strict";
import { MemoryRepository, cosineSimilarity } from "../memory/MemoryRepository";
import { DeterministicMockEmbeddingProvider } from "../memory/EmbeddingProvider";
import { PersonalMemoryRecord } from "../memory/PersonalMemoryContracts";
import { IncidentService } from "../incidents/IncidentService";
import { GoalIntelligenceEngine } from "../worldv2/GoalIntelligenceEngine";
import { ExecutionGraph } from "../kernel/ExecutionGraph";

test("Phase 1: Foundation Architecture Suite", async (t) => {
  const memoryRepo = MemoryRepository.getInstance();
  const incidentService = IncidentService.getInstance();
  const goalIntelligenceEngine = GoalIntelligenceEngine.getInstance();
  const embeddingProvider = new DeterministicMockEmbeddingProvider(1536);

  // Clean in-memory stores before tests
  memoryRepo.clearInMemoryStore();
  incidentService.clearInMemoryStore();

  await t.test("P1-MEM-01: Memory persistence validates tenant ownership and assigns ID", async () => {
    // 1. Missing userId must throw security violation
    await assert.rejects(
      async () => {
        await memoryRepo.save({
          id: "",
          userId: "",
          memoryType: "semantic_fact",
          domain: "productivity",
          content: "Works best in morning",
          summary: "Morning productivity",
          source: "explicit_user_statement",
          confidence: 0.95,
          importance: 0.8,
          evidenceCount: 1,
          firstObservedAt: Date.now(),
          lastReinforcedAt: Date.now(),
          isArchived: false,
          provenance: {},
          relatedEntityIds: [],
          embeddingModel: "deterministic-mock-v1",
          embeddingVersion: 1,
          lifecycleStatus: "verified",
          updatedAt: Date.now(),
        });
      },
      /SECURITY_VIOLATION/
    );

    // 2. Valid persistence
    const saved = await memoryRepo.save({
      id: "",
      userId: "user_alice",
      memoryType: "semantic_fact",
      domain: "productivity",
      content: "Prefers deep work between 08:00 and 11:00 AM",
      summary: "Peak morning focus window",
      source: "explicit_user_statement",
      confidence: 0.95,
      importance: 0.85,
      evidenceCount: 1,
      firstObservedAt: Date.now(),
      lastReinforcedAt: Date.now(),
      isArchived: false,
      provenance: { sourceContext: "Onboarding interview" },
      relatedEntityIds: ["goal_101"],
      embeddingModel: "deterministic-mock-v1",
      embeddingVersion: 1,
      lifecycleStatus: "verified",
      updatedAt: Date.now(),
    });

    assert.ok(saved.id.startsWith("mem_"));
    assert.equal(saved.userId, "user_alice");
    assert.ok(saved.embedding && (saved.embedding.length === 384 || saved.embedding.length === 1536));
  });

  await t.test("P1-MEM-02: Tenant Isolation strictly prevents cross-user access", async () => {
    const memBob = await memoryRepo.save({
      id: "mem_bob_private",
      userId: "user_bob",
      memoryType: "semantic_fact",
      domain: "health",
      content: "Suffers from chronic lower back strain",
      summary: "Back injury",
      source: "explicit_user_statement",
      confidence: 0.9,
      importance: 0.9,
      evidenceCount: 1,
      firstObservedAt: Date.now(),
      lastReinforcedAt: Date.now(),
      isArchived: false,
      provenance: {},
      relatedEntityIds: [],
      embeddingModel: "deterministic-mock-v1",
      embeddingVersion: 1,
      lifecycleStatus: "verified",
      updatedAt: Date.now(),
    });

    // Alice attempts to read Bob's memory by exact ID
    const aliceAttempt = await memoryRepo.getById(memBob.id, "user_alice");
    assert.equal(aliceAttempt, null, "User Alice must receive null when requesting Bob's memory");

    // Alice attempts to search Bob's memories
    const aliceSearch = await memoryRepo.search({
      userId: "user_alice",
      queryText: "lower back strain injury",
    });
    assert.ok(
      !aliceSearch.some((r) => r.memory.userId === "user_bob"),
      "User Alice's vector search must never contain User Bob's records"
    );
  });

  await t.test("P1-MEM-03: Memory Lifecycle & Archival Excludes Records from Search", async () => {
    const mem = await memoryRepo.save({
      id: "mem_temp_study",
      userId: "user_charlie",
      memoryType: "episodic_event",
      domain: "productivity",
      content: "Studying for AWS Solutions Architect Exam in November",
      summary: "AWS Exam Prep",
      source: "explicit_user_statement",
      confidence: 0.8,
      importance: 0.7,
      evidenceCount: 1,
      firstObservedAt: Date.now(),
      lastReinforcedAt: Date.now(),
      isArchived: false,
      provenance: {},
      relatedEntityIds: [],
      embeddingModel: "deterministic-mock-v1",
      embeddingVersion: 1,
      lifecycleStatus: "verified",
      updatedAt: Date.now(),
    });

    // Initial search matches
    let res = await memoryRepo.search({
      userId: "user_charlie",
      queryText: "AWS exam study",
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].memory.id, mem.id);

    // Archive memory
    const archived = await memoryRepo.archive(mem.id, "user_charlie");
    assert.ok(archived);

    // Normal search should now exclude archived memory
    res = await memoryRepo.search({
      userId: "user_charlie",
      queryText: "AWS exam study",
    });
    assert.equal(res.length, 0, "Archived memory must be excluded by default");

    // Search with includeArchived: true finds it
    res = await memoryRepo.search({
      userId: "user_charlie",
      queryText: "AWS exam study",
      includeArchived: true,
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].memory.isArchived, true);
  });

  await t.test("P1-VEC-01: Vector Embeddings produce continuous cosine similarities", async () => {
    const vec1 = await embeddingProvider.generateEmbedding("High intensity sprint interval training");
    const vec2 = await embeddingProvider.generateEmbedding("Sprints and cardio training workouts");
    const vec3 = await embeddingProvider.generateEmbedding("Writing financial accounting spreadsheet reports");

    assert.equal(vec1.length, 1536);
    assert.equal(vec2.length, 1536);

    // Compute norms (unit length check)
    const norm1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
    assert.ok(Math.abs(norm1 - 1.0) < 0.001, "Vector must be normalized to unit length");

    const simRelated = cosineSimilarity(vec1, vec2);
    const simUnrelated = cosineSimilarity(vec1, vec3);

    assert.ok(
      simRelated > simUnrelated,
      `Related vectors (${simRelated.toFixed(3)}) must have higher cosine similarity than unrelated (${simUnrelated.toFixed(3)})`
    );
  });

  await t.test("P1-INC-01: Incident lifecycle & operational constraints enforce safety", async () => {
    const incident = await incidentService.createIncident({
      userId: "user_david",
      title: "Acute Rotator Cuff Tendinitis",
      domain: "health",
      severity: "major",
      expectedDurationHours: 120,
      summary: "Right shoulder inflamed after heavy bench press. Medical advice: complete upper body rest.",
      symptomsOrSignals: ["shoulder_pain", "limited_mobility"],
      operationalConstraints: {
        suppressWorkouts: true,
        maxWorkloadHoursPerDay: 6,
      },
      tags: ["injury", "shoulder"],
    });

    assert.ok(incident.id.startsWith("inc_"));
    assert.equal(incident.status, "active");
    assert.equal(incident.operationalConstraints.suppressWorkouts, true);

    // Query active incidents
    const active = await incidentService.getActiveIncidents("user_david");
    assert.equal(active.length, 1);
    assert.equal(active[0].title, "Acute Rotator Cuff Tendinitis");

    // Cross-user test: Eve should have 0 active incidents
    const eveIncidents = await incidentService.getActiveIncidents("user_eve");
    assert.equal(eveIncidents.length, 0);

    // Resolve incident
    const resolved = await incidentService.resolveIncident(incident.id, "user_david");
    assert.ok(resolved);

    const postResolve = await incidentService.getActiveIncidents("user_david");
    assert.equal(postResolve.length, 0, "Resolved incidents must no longer be returned as active");
  });

  await t.test("P1-GOAL-01: Goal Intelligence calculates 5-axis tension and adaptations", async () => {
    const graph = new ExecutionGraph();
    const now = Date.now();
    const nowDate = new Date(now);

    // Goal with imminent deadline (12h away) and 2 blocked tasks
    graph.addNode({
      id: "goal_deploy",
      title: "Deploy V3 Production Cluster",
      entityType: "goal",
      status: "pending",
      priority: 5,
      createdAt: nowDate,
      updatedAt: nowDate,
    });

    graph.addNode({
      id: "task_dns",
      title: "Configure DNS Records",
      entityType: "task",
      status: "pending",
      priority: 5,
      createdAt: nowDate,
      updatedAt: nowDate,
      metadata: {
        goalId: "goal_deploy",
        dueDate: new Date(now + 12 * 3600 * 1000).toISOString(),
      },
    });

    graph.addNode({
      id: "task_cert",
      title: "Issue SSL Certificate",
      entityType: "task",
      status: "pending",
      priority: 5,
      createdAt: nowDate,
      updatedAt: nowDate,
      metadata: { goalId: "goal_deploy" },
    });

    graph.addEdge("task_cert", "task_dns", "requires");

    const snapshot = graph.createSnapshot();

    const results = goalIntelligenceEngine.evaluateGoals({
      graphSnapshot: snapshot,
      lifeState: {
        state: "Stable",
        mentalState: { stressLevel: 0.3, energyLevel: 0.8 },
      } as any,
    });

    assert.equal(results.length, 1);
    const deployGoal = results[0];

    assert.equal(deployGoal.goalId, "goal_deploy");
    assert.ok(deployGoal.axes.urgency >= 0.9, "Imminent deadline must result in high urgency");
    assert.ok(deployGoal.axes.friction > 0, "Blocked task must produce friction");
    assert.ok(deployGoal.pressureScore > 0, "Pressure score must be positive");
    assert.ok(["rising", "stable", "falling"].includes(deployGoal.trend));
    assert.ok(["aligned", "strained", "conflicting", "toxic"].includes(deployGoal.status));
  });

  await t.test("P1-GOAL-02: Active Incident dynamically dampens capacity match & triggers pause adaptation", async () => {
    const graph = new ExecutionGraph();
    const nowDate = new Date();
    graph.addNode({
      id: "goal_marathon",
      title: "Sub-4hr Marathon Prep",
      entityType: "goal",
      status: "pending",
      priority: 4,
      createdAt: nowDate,
      updatedAt: nowDate,
    });
    graph.addNode({
      id: "task_run_20k",
      title: "20k Weekend Long Run",
      entityType: "task",
      status: "pending",
      priority: 4,
      createdAt: nowDate,
      updatedAt: nowDate,
      metadata: { goalId: "goal_marathon" },
    });

    const snapshot = graph.createSnapshot();

    // Evaluate without incident
    const normalEval = goalIntelligenceEngine.evaluateGoals({
      graphSnapshot: snapshot,
    });
    assert.equal(normalEval[0].axes.capacityMatch, 0.85);

    // Evaluate with active sickness incident suspending marathon goal
    const activeIncident = {
      id: "inc_flu_01",
      userId: "user_runner",
      title: "Influenza with 102F Fever",
      domain: "health" as const,
      severity: "major" as const,
      status: "active" as const,
      startedAt: Date.now(),
      expectedDurationHours: 96,
      summary: "Bed rest required",
      symptomsOrSignals: ["fever", "body_aches"],
      operationalConstraints: {
        suppressWorkouts: true,
        suspendedGoalIds: ["goal_marathon"],
      },
      tags: ["illness"],
      updatedAt: Date.now(),
    };

    const incidentEval = goalIntelligenceEngine.evaluateGoals({
      graphSnapshot: snapshot,
      activeIncidents: [activeIncident],
    });

    assert.ok(
      incidentEval[0].axes.capacityMatch <= 0.15,
      "Active incident suspending goal must sharply reduce capacity match"
    );
    assert.ok(
      incidentEval[0].adaptations.some((a) => a.includes("pause goal")),
      "Must emit adaptation recommending goal pause during active incident"
    );
  });

  await t.test("P1-DET-01: 100% Deterministic Goal Intelligence Replay", async () => {
    const graph = new ExecutionGraph();
    const nowDate = new Date();
    graph.addNode({
      id: "goal_rust",
      title: "Master Rust Async Systems",
      entityType: "goal",
      status: "pending",
      priority: 3,
      createdAt: nowDate,
      updatedAt: nowDate,
    });
    graph.addNode({
      id: "task_tokio",
      title: "Build custom Tokio runtime executor",
      entityType: "task",
      status: "pending",
      priority: 3,
      createdAt: nowDate,
      updatedAt: nowDate,
      metadata: { goalId: "goal_rust" },
    });

    const snapshot = graph.createSnapshot();

    const run1 = goalIntelligenceEngine.evaluateGoals({ graphSnapshot: snapshot });
    const run2 = goalIntelligenceEngine.evaluateGoals({ graphSnapshot: snapshot });

    assert.deepEqual(run1, run2, "Goal Intelligence must produce byte-identical results across identical snapshots");
  });
});
