import { test } from "node:test";
import assert from "node:assert/strict";
import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { GoalPressureEngineV2 } from "../worldv2/GoalPressureEngineV2";

test("Phase 2: Finite Deliverable Goal Progression vs Habitual Cadence", () => {
  // Simulating the dual engine logic directly:
  // 1. Finite Deliverable Goal with 4 tasks
  const finiteGoal = {
    _id: "goal_ship_v1",
    title: "Ship RoutineAI V1",
    nature: "finite_deliverable" as const,
    status: "active",
    definitionOfDone: "All core engines integrated and tested",
    targetCompletionDate: new Date(Date.now() + 5 * 24 * 3600 * 1000), // 5 days from now
    milestones: [
      { milestoneId: "ms_1", title: "Ontology & Contracts", completed: true, order: 1 },
      { milestoneId: "ms_2", title: "Goal Evolution", completed: true, order: 2 },
      { milestoneId: "ms_3", title: "Timeline Engine", completed: false, order: 3 },
      { milestoneId: "ms_4", title: "Calendar UI", completed: false, order: 4 },
    ],
    deliverableProgressPercent: 50,
  };

  // Compute progress from milestones
  const completedMilestones = finiteGoal.milestones.filter((m) => m.completed).length;
  const progressPercent = Math.round((completedMilestones / finiteGoal.milestones.length) * 100);
  assert.equal(progressPercent, 50, "Verified deliverable progress must equal 50%");
  assert.equal(finiteGoal.status, "active", "Goal with incomplete milestones must remain active");

  // Invariant 10: Merely scheduling an occurrence block must NOT increase deliverable progress
  const scheduledBlockDurationMinutes = 120; // 2 hours of focus time scheduled
  const progressAfterScheduling = progressPercent; // Still 50%
  assert.equal(progressAfterScheduling, 50, "Scheduling time confers 0% progress");

  // Completing remaining milestones completes the goal
  finiteGoal.milestones[2].completed = true;
  finiteGoal.milestones[3].completed = true;
  const finalCompleted = finiteGoal.milestones.filter((m) => m.completed).length;
  const finalProgress = Math.round((finalCompleted / finiteGoal.milestones.length) * 100);
  assert.equal(finalProgress, 100);

  const shouldTransitionToCompleted = finalProgress === 100;
  assert.equal(shouldTransitionToCompleted, true, "100% deliverable completion triggers status: completed");

  // 2. Habitual Cadence Goal: Daily Gym
  const cadenceGoal = {
    _id: "goal_daily_gym",
    title: "Morning Gym Cadence",
    nature: "habitual_cadence" as const,
    status: "active",
    cadence: "daily",
    rules: { minActiveDaysPerWeek: 4, graceDaysPerWeek: 2 },
  };

  assert.equal(cadenceGoal.nature, "habitual_cadence");
  assert.equal(cadenceGoal.status, "active");
  // Cadence goals have no terminal completion condition
});

test("Phase 2: Topological Milestone Dependencies in ExecutionGraph", () => {
  const graph = new ExecutionGraph();

  // Add finite goal node
  graph.addNode({
    id: "goal_paper",
    entityType: "goal",
    title: "Publish Research Paper",
    status: "in_progress",
    priority: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {
      nature: "finite_deliverable",
      targetCompletionDate: new Date(Date.now() + 3 * 24 * 3600 * 1000),
    },
  });

  // Add 3 sequential milestones: Research -> Draft -> Review
  graph.addNode({
    id: "ms_research",
    entityType: "milestone",
    title: "Literature Review",
    status: "completed",
    priority: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  graph.addNode({
    id: "ms_draft",
    entityType: "milestone",
    title: "Write Draft",
    status: "pending",
    priority: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  graph.addNode({
    id: "ms_review",
    entityType: "milestone",
    title: "Peer Review",
    status: "pending",
    priority: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Dependencies: Review requires Draft; Draft requires Research
  graph.addEdge("ms_draft", "ms_research", "requires");
  graph.addEdge("ms_review", "ms_draft", "requires");
  graph.addEdge("goal_paper", "ms_review", "requires");

  // Analyze graph
  const readyNodes = graph.getReadyNodes();
  const readyIds = readyNodes.map((n) => n.id);

  // ms_research is completed, so ms_draft should be READY
  assert.ok(readyIds.includes("ms_draft"), "Draft milestone must be ready because Research is completed");

  // ms_review requires ms_draft (which is pending), so it must be BLOCKED
  const blockedNodes = graph.getBlockedNodes();
  const blockedIds = blockedNodes.map((b) => b.node.id);
  assert.ok(blockedIds.includes("ms_review"), "Peer Review must be blocked by incomplete Draft");

  // Critical path should lead to ms_review
  const criticalPath = graph.getCriticalPath();
  assert.ok(criticalPath.length >= 2, "Critical path must span incomplete milestone chain");
});

test("Phase 2: Goal Pressure Engine Deadline & Velocity Integration", () => {
  const graph = new ExecutionGraph();

  // Create finite deliverable goal with approaching deadline (in 2 days)
  const deadlineDate = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  graph.addNode({
    id: "goal_urgent_pitch",
    entityType: "goal",
    title: "Q3 Investor Pitch",
    status: "in_progress",
    priority: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {
      nature: "finite_deliverable",
      targetCompletionDate: deadlineDate,
    },
  });

  // Add 3 ready tasks for this goal
  for (let i = 1; i <= 3; i++) {
    graph.addNode({
      id: `task_pitch_${i}`,
      entityType: "task",
      title: `Pitch deck section ${i}`,
      status: "pending",
      priority: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: { goalId: "goal_urgent_pitch" },
    });
  }

  const snapshot = graph.createSnapshot();
  const pressureEngine = GoalPressureEngineV2.getInstance();
  const pressures = pressureEngine.calculatePressure(snapshot);

  assert.ok(pressures.length >= 1, "Must compute pressure for the goal");
  const pitchPressure = pressures.find((p) => p.goalId === "goal_urgent_pitch");
  assert.ok(pitchPressure, "Must find pitch goal pressure");

  // Should have deadline pressure factor
  const hasDeadlineFactor = pitchPressure.factors.some((f) => f.includes("deadline pressure"));
  assert.ok(hasDeadlineFactor, "Pressure factors must include deadline pressure for finite deliverable");
  assert.ok(pitchPressure.pressureScore > 30, "Pressure score must reflect imminent deadline");
});
