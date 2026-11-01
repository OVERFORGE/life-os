/**
 * b2GoalGraphPropagation.test.ts
 * 
 * Loop 5 (WP3) Verification Suite:
 * - Mandatory Correctness Gate: Missing derived document authoritative rebuild
 * - Correction B Guard: Same-version out-of-order delivery prevention (ALREADY_SUBSUMED)
 * - Exact redelivery idempotency (ALREADY_APPLIED)
 * - Atomic milestone and task progress calculation on GoalStats
 * - Execution Graph DAG unblocking of downstream dependent nodes
 * - Monotonic guard on Execution Graph derived state
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { GoalIntelligenceConsumer } from "../events/consumers/GoalIntelligenceConsumer";
import { ExecutionGraphConsumer } from "../events/consumers/ExecutionGraphConsumer";

class MockCollection {
  public docs: Map<string, any> = new Map();

  findOne(query: Record<string, any>): any {
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) {
        const cloned = JSON.parse(JSON.stringify(doc));
        return {
          ...cloned,
          lean: () => Promise.resolve(cloned),
          then: (resolve: any, reject: any) => Promise.resolve(cloned).then(resolve, reject),
        };
      }
    }
    return {
      lean: () => Promise.resolve(null),
      then: (resolve: any, reject: any) => Promise.resolve(null).then(resolve, reject),
    };
  }

  findById(id: string): any {
    const doc = this.docs.get(id);
    const cloned = doc ? JSON.parse(JSON.stringify(doc)) : null;
    return {
      ...cloned,
      lean: () => Promise.resolve(cloned),
      then: (resolve: any, reject: any) => Promise.resolve(cloned).then(resolve, reject),
    };
  }

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, opts?: any): Promise<any> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        if (update.$set) Object.assign(doc, update.$set);
        return JSON.parse(JSON.stringify(doc));
      }
    }
    if (opts?.upsert) {
      const newDoc = { ...(update.$set || {}) };
      const docId = newDoc._id || newDoc.goalId || newDoc.graphId || `id_${Date.now()}`;
      newDoc._id = docId;
      this.docs.set(docId, newDoc);
      return JSON.parse(JSON.stringify(newDoc));
    }
    return null;
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number; modifiedCount: number }> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        if (update.$set) Object.assign(doc, update.$set);
        return { matchedCount: 1, modifiedCount: 1 };
      }
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  private matchesQuery(doc: Record<string, any>, query: Record<string, any>): boolean {
    for (const [k, v] of Object.entries(query)) {
      if (k === "derivedFromCausalSequence" && v && typeof v === "object" && "$lt" in v) {
        if ((doc.derivedFromCausalSequence ?? 0) >= (v as any).$lt) return false;
        continue;
      }
      if (doc[k] !== v) return false;
    }
    return true;
  }
}

describe("LOOP 5 (WP3): Goal Intelligence & Execution Graph Consumers", () => {
  let mockGoalStats: MockCollection;
  let mockGoals: MockCollection;
  let mockGraphDerived: MockCollection;
  let goalConsumer: GoalIntelligenceConsumer;
  let graphConsumer: ExecutionGraphConsumer;

  beforeEach(() => {
    mockGoalStats = new MockCollection();
    mockGoals = new MockCollection();
    mockGraphDerived = new MockCollection();

    goalConsumer = new GoalIntelligenceConsumer({
      goalStatsModel: mockGoalStats,
      goalModel: mockGoals,
    });

    graphConsumer = new ExecutionGraphConsumer({
      graphDerivedModel: mockGraphDerived,
    });
  });

  it("GOAL-01: Missing derived document triggers authoritative rebuild from Goal aggregate", async () => {
    // Seed authoritative Goal aggregate root (GoalStats does not exist)
    mockGoals.docs.set("goal_100", {
      _id: "goal_100",
      userId: "usr_alice",
      title: "Launch Mobile App",
      status: "active",
      deliverableProgressPercent: 50,
      milestones: [
        { milestoneId: "m1", title: "Spec", completed: true },
        { milestoneId: "m2", title: "Design", completed: true },
        { milestoneId: "m3", title: "Build", completed: false },
        { milestoneId: "m4", title: "Test", completed: false },
      ],
    });

    const envelope = {
      eventId: "evt_task_t_first_v2_1_completed",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.task.completed",
      aggregateId: "t_first",
      aggregateType: "task" as const,
      aggregateVersion: 2,
      eventOrdinal: 1,
      causalSequence: 2001,
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      correlationId: "corr_01",
      source: "kernel",
      payload: { taskId: "t_first", goalId: "goal_100" },
    };

    const result = await goalConsumer.process(envelope as any, 1);
    assert.equal(result.status, "SUCCEEDED");

    // Derived document must now exist with authoritative rebuilt values
    const createdStats = mockGoalStats.docs.get("goal_100");
    assert.ok(createdStats, "GoalStats must be authoritatively initialized");
    assert.equal(createdStats.goalId, "goal_100");
    assert.equal(createdStats.totalMilestonesCount, 4);
    assert.equal(createdStats.completedMilestonesCount, 2);
    assert.equal(createdStats.deliverableProgressPercent, 50);
    assert.equal(createdStats.completedTasksCount, 1);
    assert.equal(createdStats.derivedFromCausalSequence, 2001);
    assert.equal(createdStats.lastEventId, "evt_task_t_first_v2_1_completed");
  });

  it("GOAL-02 (Correction B): Same-version out-of-order delivery prevents regression (ALREADY_SUBSUMED)", async () => {
    // Seed initial GoalStats
    mockGoalStats.docs.set("goal_200", {
      _id: "goal_200",
      goalId: "goal_200",
      userId: "usr_alice",
      deliverableProgressPercent: 0,
      derivedFromCausalSequence: 0,
      lastEventId: "init",
    });

    // Event B: version 4, ordinal 1, causalSequence 4001, deliverableProgressPercent 80%
    const eventB = {
      eventId: "evt_goal_g200_v4_1_progress_updated",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.goal.progress_updated",
      aggregateId: "goal_200",
      aggregateType: "goal" as const,
      aggregateVersion: 4,
      eventOrdinal: 1,
      causalSequence: 4001, // HIGHER sequence
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      correlationId: "corr_b",
      source: "kernel",
      payload: { goalId: "goal_200", deliverableProgressPercent: 80 },
    };

    // Event A: version 4, ordinal 0, causalSequence 4000, deliverableProgressPercent 40%
    const eventA = {
      eventId: "evt_goal_g200_v4_0_progress_updated",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.goal.progress_updated",
      aggregateId: "goal_200",
      aggregateType: "goal" as const,
      aggregateVersion: 4,
      eventOrdinal: 0,
      causalSequence: 4000, // LOWER sequence
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      correlationId: "corr_a",
      source: "kernel",
      payload: { goalId: "goal_200", deliverableProgressPercent: 40 },
    };

    // 1. Event B arrives FIRST
    const resB = await goalConsumer.process(eventB as any, 1);
    assert.equal(resB.status, "SUCCEEDED");
    const statsAfterB = mockGoalStats.docs.get("goal_200");
    assert.equal(statsAfterB.deliverableProgressPercent, 80);
    assert.equal(statsAfterB.derivedFromCausalSequence, 4001);

    // 2. Event A arrives LATER
    const resA = await goalConsumer.process(eventA as any, 1);
    assert.equal(resA.status, "SKIPPED_STALE", "Older same-version event must be classified as SKIPPED_STALE");

    // 3. Verify state did NOT regress to 40%
    const statsAfterA = mockGoalStats.docs.get("goal_200");
    assert.equal(statsAfterA.deliverableProgressPercent, 80, "Progress must NOT regress to 40%!");
    assert.equal(statsAfterA.derivedFromCausalSequence, 4001);
  });

  it("GOAL-03: Exact event redelivery returns SUCCEEDED via ALREADY_APPLIED idempotency guard", async () => {
    mockGoalStats.docs.set("goal_300", {
      _id: "goal_300",
      goalId: "goal_300",
      userId: "usr_alice",
      deliverableProgressPercent: 70,
      derivedFromCausalSequence: 3001,
      lastEventId: "evt_goal_g300_v3_1_progress",
    });

    const duplicateEvent = {
      eventId: "evt_goal_g300_v3_1_progress",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.goal.progress_updated",
      aggregateId: "goal_300",
      aggregateType: "goal" as const,
      aggregateVersion: 3,
      eventOrdinal: 1,
      causalSequence: 3001,
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      correlationId: "corr_dup",
      source: "kernel",
      payload: { goalId: "goal_300", deliverableProgressPercent: 70 },
    };

    const res = await goalConsumer.process(duplicateEvent as any, 1);
    assert.equal(res.status, "SUCCEEDED", "Duplicate redelivery must return SUCCEEDED idempotently");
  });

  it("GRAPH-01: ExecutionGraphConsumer unblocks downstream dependent nodes when upstream dependencies complete", async () => {
    // Seed ExecutionGraph with Node 1 (task_spec, completed) and Node 2 (task_api, blocked by task_spec)
    mockGraphDerived.docs.set("graph_usr_alice", {
      _id: "graph_usr_alice",
      graphId: "graph_usr_alice",
      userId: "usr_alice",
      nodes: [
        { id: "task_spec", title: "API Specification", status: "pending", dependencies: [] },
        { id: "task_api", title: "Build Endpoints", status: "blocked", dependencies: ["task_spec"] },
      ],
      unblockedTaskIds: [],
      derivedFromCausalSequence: 1000,
      lastEventId: "evt_init",
    });

    const completionEvent = {
      eventId: "evt_task_task_spec_v2_1_completed",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.task.completed",
      aggregateId: "task_spec",
      aggregateType: "task" as const,
      aggregateVersion: 2,
      eventOrdinal: 1,
      causalSequence: 2001,
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      correlationId: "corr_spec_done",
      source: "kernel",
      payload: { taskId: "task_spec", graphId: "graph_usr_alice" },
    };

    const res = await graphConsumer.process(completionEvent as any, 1);
    assert.equal(res.status, "SUCCEEDED");

    const updatedGraph = mockGraphDerived.docs.get("graph_usr_alice");
    assert.equal(updatedGraph.derivedFromCausalSequence, 2001);

    const specNode = updatedGraph.nodes.find((n: any) => n.id === "task_spec");
    const apiNode = updatedGraph.nodes.find((n: any) => n.id === "task_api");

    assert.equal(specNode.status, "completed");
    assert.equal(apiNode.status, "pending", "Downstream node must be unblocked from 'blocked' to 'pending'");
    assert.deepEqual(updatedGraph.unblockedTaskIds, ["task_api"]);
  });

  it("GRAPH-02: Older same-version task event does not regress ExecutionGraph state", async () => {
    mockGraphDerived.docs.set("graph_usr_alice", {
      _id: "graph_usr_alice",
      graphId: "graph_usr_alice",
      userId: "usr_alice",
      nodes: [],
      unblockedTaskIds: ["task_api"],
      derivedFromCausalSequence: 3005, // Current state is at sequence 3005
      lastEventId: "evt_newer",
    });

    const olderEvent = {
      eventId: "evt_task_t_old_v3_1_completed",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.task.completed",
      aggregateId: "t_old",
      aggregateType: "task" as const,
      aggregateVersion: 3,
      eventOrdinal: 1,
      causalSequence: 3001, // Older sequence (< 3005)
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      correlationId: "corr_old",
      source: "kernel",
      payload: { taskId: "t_old", graphId: "graph_usr_alice" },
    };

    const res = await graphConsumer.process(olderEvent as any, 1);
    assert.equal(res.status, "SKIPPED_STALE", "Older event must be classified as SKIPPED_STALE");

    const graph = mockGraphDerived.docs.get("graph_usr_alice");
    assert.equal(graph.derivedFromCausalSequence, 3005, "Causal sequence must remain 3005");
  });
});
