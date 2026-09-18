import { test } from "node:test";
import assert from "node:assert/strict";
import { ExecutionWorkspace } from "../orchestration/workspace/ExecutionWorkspace";
import { ExecutionEventLedger } from "../orchestration/workspace/ExecutionEventLedger";
import { OrchestrationEventBus } from "../orchestration/events/OrchestrationEventBus";
import { TestHarness } from "./harness";

test("Phase 2: ExecutionWorkspace initializes with valid context and initial event", () => {
  const ws = new ExecutionWorkspace({
    executionId: "exec_test_001",
    userId: "user_test_001",
    conversationId: "conv_test_001",
    userRequest: "I'm exhausted and have a deadline tomorrow.",
    goal: "Resolve schedule congestion and fatigue",
    objective: "Reschedule non-urgent tasks and protect recovery",
    constraints: ["Do not reschedule thesis chapter 1"],
  });

  assert.equal(ws.status, "INITIALIZED");
  assert.equal(ws.iteration, 1);
  assert.equal(ws.stateVersion, 1);
  assert.equal(ws.ledger.getEventCount(), 1);
  assert.equal(ws.ledger.getEvents()[0].type, "WorkspaceInitialized");
});

test("Phase 2: Concurrent specialists append findings without collision or stale-write errors", async () => {
  const ws = new ExecutionWorkspace({
    executionId: "exec_test_002",
    userId: "user_test_002",
    conversationId: "conv_test_002",
    userRequest: "Test concurrent appends",
    goal: "Test concurrency",
    objective: "Test concurrent appends",
    constraints: [],
  });

  ws.transitionTo("DELEGATING");
  ws.transitionTo("ANALYZING");

  // Simulate concurrent specialist execution
  await Promise.all([
    (async () => {
      ws.ledger.append("AgentObservationProduced", "Productivity", {
        id: "obs_prod_1",
        category: "Observation",
        source: "Productivity",
        timestamp: Date.now(),
        payload: { overdueCount: 3 },
        observedAt: Date.now(),
      });
      ws.ledger.append("ProposalCreated", "Productivity", {
        id: "prop_prod_1",
        domain: "productivity",
        actionType: "reschedule_task",
        targetEntityId: "task_2",
        payload: { newDate: "2026-09-17" },
        rationale: "Relieve deadline pressure",
        reversibility: "reversible_with_compensation",
        idempotencyKey: "key_prod_1",
      });
    })(),
    (async () => {
      ws.ledger.append("AgentObservationProduced", "Health", {
        id: "obs_health_1",
        category: "Observation",
        source: "Health",
        timestamp: Date.now(),
        payload: { workoutScheduled: "High-intensity Leg Day" },
        observedAt: Date.now(),
      });
    })(),
    (async () => {
      ws.ledger.append("AgentObservationProduced", "Wellness", {
        id: "obs_well_1",
        category: "Observation",
        source: "Wellness",
        timestamp: Date.now(),
        payload: { sleepDeficitHours: 2.5 },
        observedAt: Date.now(),
      });
    })(),
  ]);

  // Initial event + 4 specialist events = 5 events
  assert.equal(ws.ledger.getEventCount(), 5);

  const projection = ws.getProjection();
  assert.equal(projection.observations.length, 3);
  assert.equal(projection.proposals.length, 1);
  assert.equal(projection.proposals[0].id, "prop_prod_1");

  // Verify sequences are strictly monotonic
  const events = ws.ledger.getEvents();
  for (let i = 0; i < events.length; i++) {
    assert.equal(events[i].seq, i + 1);
  }
});

test("Phase 2: State machine enforces valid transitions and rejects illegal transitions", () => {
  const ws = new ExecutionWorkspace({
    executionId: "exec_test_003",
    userId: "user_test_003",
    conversationId: "conv_test_003",
    userRequest: "Test transitions",
    goal: "Test",
    objective: "Test",
    constraints: [],
  });

  assert.equal(ws.status, "INITIALIZED");

  // Illegal: INITIALIZED directly to KERNEL_EXECUTING
  assert.throws(() => {
    ws.transitionTo("KERNEL_EXECUTING");
  }, /ILLEGAL_WORKSPACE_TRANSITION/);

  // Legal transitions
  ws.transitionTo("DELEGATING");
  assert.equal(ws.status, "DELEGATING");
  assert.equal(ws.stateVersion, 2);

  ws.transitionTo("ANALYZING");
  assert.equal(ws.status, "ANALYZING");
  assert.equal(ws.stateVersion, 3);

  ws.transitionTo("SYNTHESIZING");
  assert.equal(ws.status, "SYNTHESIZING");

  ws.transitionTo("COMPLETED");
  assert.equal(ws.status, "COMPLETED");

  // Cannot transition out of COMPLETED
  assert.throws(() => {
    ws.transitionTo("ANALYZING");
  }, /ILLEGAL_WORKSPACE_TRANSITION/);
});

test("Phase 2: Optimistic versioning detects stale mutations", () => {
  const ws = new ExecutionWorkspace({
    executionId: "exec_test_004",
    userId: "user_test_004",
    conversationId: "conv_test_004",
    userRequest: "Test optimistic concurrency",
    goal: "Test",
    objective: "Test",
    constraints: [],
  });

  // Current version is 1
  ws.transitionTo("DELEGATING", 1); // Succeeds, version becomes 2

  // Attempt to transition passing stale expected version 1
  assert.throws(() => {
    ws.transitionTo("ANALYZING", 1);
  }, /STALE_WORKSPACE_MUTATION/);

  // Succeeds with correct version 2
  ws.transitionTo("ANALYZING", 2);
  assert.equal(ws.status, "ANALYZING");
  assert.equal(ws.stateVersion, 3);
});

test("Phase 2 & 3: Deterministic Replay reconstructs workspace state from ledger", () => {
  const context = {
    executionId: "exec_test_005",
    userId: "user_test_005",
    conversationId: "conv_test_005",
    userRequest: "Replay test",
    goal: "Test replay",
    objective: "Verify replay reconstruction",
    constraints: ["Constraint 1"],
  };

  const originalWs = new ExecutionWorkspace(context);
  originalWs.transitionTo("DELEGATING");
  originalWs.transitionTo("ANALYZING");
  originalWs.transitionTo("SYNTHESIZING");
  originalWs.advanceIteration(); // Iteration 2
  originalWs.terminate("GOAL_SATISFIED");

  assert.equal(originalWs.status, "COMPLETED");
  assert.equal(originalWs.iteration, 2);

  // Reconstruct new instance from the ledger
  const reconstructedWs = ExecutionWorkspace.reconstructFromLedger(originalWs.ledger, context);

  assert.equal(reconstructedWs.status, "COMPLETED");
  assert.equal(reconstructedWs.iteration, 2);
  assert.equal(reconstructedWs.ledger.getEventCount(), originalWs.ledger.getEventCount());
});

test("Phase 3: EventBus dispatches live events to subscribers", () => {
  const bus = OrchestrationEventBus.getInstance();
  const received: string[] = [];

  const unsubscribe = bus.subscribe("AgentObservationProduced", (event) => {
    received.push(event.payload.id);
  });

  const ledger = new ExecutionEventLedger("exec_test_bus");
  ledger.append("AgentObservationProduced", "Wellness", { id: "obs_live_1" });

  assert.equal(received.length, 1);
  assert.equal(received[0], "obs_live_1");

  unsubscribe();
  ledger.append("AgentObservationProduced", "Wellness", { id: "obs_live_2" });
  assert.equal(received.length, 1); // Did not receive after unsubscribe
});
