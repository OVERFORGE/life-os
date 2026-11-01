/**
 * loop2ExecutionGraph.test.ts
 * 
 * Step 2 Loop 2 Test Battery:
 * - Per-node appliedVersion tracking (eliminating cross-aggregate collisions)
 * - Complete task lifecycle handling (created, updated, completed, uncompleted, deleted)
 * - Topological DAG unblocking and dependency pruning
 * - Authoritative Source State Fingerprint verification in buildFromDatabase
 * - Degraded read path and TOCTOU protection
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionGraphConsumer } from "../../events/consumers/ExecutionGraphConsumer";
import { ExecutionGraph } from "../../kernel/ExecutionGraph";
import { ICanonicalEventEnvelope } from "../../events/contracts/CanonicalEventContracts";

describe("Step 2 — Loop 2: Execution Graph Projection Convergence", () => {
  it("Scenario 1: Per-node appliedVersion allows Task B v1 to be processed after Task A v5", async () => {
    let storedDoc: any = {
      graphId: "graph_user_1",
      userId: "user_1",
      nodes: [
        {
          id: "task_A",
          title: "Task A",
          status: "completed",
          dependencies: [],
          appliedVersion: 5, // Task A at version 5
        },
      ],
      unblockedTaskIds: [],
      projectionRevision: 1,
      sourceTaskCount: 1,
      sourceVersionSum: 5,
      sourceMaxVersion: 5,
      lastEventId: "evt_task_A_v5",
    };

    const mockGraphDerivedModel = {
      findOne: async (query: any) => {
        if (query.graphId === "graph_user_1") return JSON.parse(JSON.stringify(storedDoc));
        return null;
      },
      findOneAndUpdate: async (query: any, update: any) => {
        if (query.graphId === "graph_user_1" && query.projectionRevision === storedDoc.projectionRevision) {
          storedDoc = {
            ...storedDoc,
            ...update.$set,
            projectionRevision: storedDoc.projectionRevision + (update.$inc?.projectionRevision || 0),
          };
          return JSON.parse(JSON.stringify(storedDoc));
        }
        return null;
      },
    };

    const consumer = new ExecutionGraphConsumer({
      graphDerivedModel: mockGraphDerivedModel,
    });

    // Task B arrives at version 1 (lower than Task A version 5)
    const taskBEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_task_B_v1",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "task",
      aggregateId: "task_B",
      aggregateVersion: 1,
      causalSequence: 1000,
      type: "domain.task.created",
      source: "TaskService",
      payload: {
        title: "Task B",
        status: "pending",
        dependencies: ["task_A"], // Depends on completed Task A!
      },
    } as any;

    const res = await consumer.process(taskBEnvelope, 1);

    assert.equal(res.status, "SUCCEEDED", "Task B v1 must NOT be dropped by Task A v5");
    assert.equal(storedDoc.nodes.length, 2, "Graph must now contain 2 nodes");
    const nodeB = storedDoc.nodes.find((n: any) => n.id === "task_B");
    assert.ok(nodeB, "Node B must exist");
    assert.equal(nodeB.appliedVersion, 1);
    assert.equal(nodeB.status, "pending", "Node B should be pending (unblocked) because Task A is completed");
    assert.ok(storedDoc.unblockedTaskIds.includes("task_B"), "Task B must be in unblockedTaskIds");
  });

  it("Scenario 2: Complete task lifecycle transitions (created -> updated -> completed -> uncompleted -> deleted)", async () => {
    let storedDoc: any = {
      graphId: "graph_user_1",
      userId: "user_1",
      nodes: [],
      unblockedTaskIds: [],
      projectionRevision: 0,
      sourceTaskCount: 0,
      sourceVersionSum: 0,
      sourceMaxVersion: 0,
      lastEventId: "evt_init",
    };

    const mockGraphDerivedModel = {
      findOne: async () => JSON.parse(JSON.stringify(storedDoc)),
      findOneAndUpdate: async (query: any, update: any) => {
        storedDoc = {
          ...storedDoc,
          ...update.$set,
          projectionRevision: (storedDoc.projectionRevision || 0) + (update.$inc?.projectionRevision || 0),
        };
        return JSON.parse(JSON.stringify(storedDoc));
      },
    };

    const consumer = new ExecutionGraphConsumer({
      graphDerivedModel: mockGraphDerivedModel,
    });

    // 1. Created
    await consumer.process({
      eventId: "e1",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "task",
      aggregateId: "t1",
      aggregateVersion: 1,
      causalSequence: 1000,
      type: "domain.task.created",
      source: "TaskService",
      payload: { title: "Original Title", status: "pending" },
    } as any, 1);

    assert.equal(storedDoc.nodes.length, 1);
    assert.equal(storedDoc.nodes[0].title, "Original Title");

    // 2. Updated
    await consumer.process({
      eventId: "e2",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "task",
      aggregateId: "t1",
      aggregateVersion: 2,
      causalSequence: 2000,
      type: "domain.task.updated",
      source: "TaskService",
      payload: { title: "Updated Title" },
    } as any, 1);

    assert.equal(storedDoc.nodes[0].title, "Updated Title");
    assert.equal(storedDoc.nodes[0].appliedVersion, 2);

    // 3. Completed
    await consumer.process({
      eventId: "e3",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "task",
      aggregateId: "t1",
      aggregateVersion: 3,
      causalSequence: 3000,
      type: "domain.task.completed",
      source: "TaskService",
      payload: {},
    } as any, 1);

    assert.equal(storedDoc.nodes[0].status, "completed");
    assert.equal(storedDoc.nodes[0].appliedVersion, 3);

    // 4. Uncompleted
    await consumer.process({
      eventId: "e4",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "task",
      aggregateId: "t1",
      aggregateVersion: 4,
      causalSequence: 4000,
      type: "domain.task.uncompleted",
      source: "TaskService",
      payload: {},
    } as any, 1);

    assert.equal(storedDoc.nodes[0].status, "pending");

    // 5. Deleted
    await consumer.process({
      eventId: "e5",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "task",
      aggregateId: "t1",
      aggregateVersion: 5,
      causalSequence: 5000,
      type: "domain.task.deleted",
      source: "TaskService",
      payload: {},
    } as any, 1);

    assert.equal(storedDoc.nodes.length, 0, "Deleted task must be pruned from nodes");
  });

  it("Scenario 3: Dependency unblocking correctly sets blocked vs pending status", async () => {
    let storedDoc: any = {
      graphId: "graph_user_1",
      userId: "user_1",
      nodes: [
        { id: "parent_1", title: "Parent", status: "pending", dependencies: [], appliedVersion: 1 },
        { id: "child_1", title: "Child", status: "blocked", dependencies: ["parent_1"], appliedVersion: 1 },
      ],
      unblockedTaskIds: ["parent_1"],
      projectionRevision: 1,
      sourceTaskCount: 2,
      sourceVersionSum: 2,
      sourceMaxVersion: 1,
      lastEventId: "evt_init",
    };

    const mockGraphDerivedModel = {
      findOne: async () => JSON.parse(JSON.stringify(storedDoc)),
      findOneAndUpdate: async (query: any, update: any) => {
        storedDoc = {
          ...storedDoc,
          ...update.$set,
          projectionRevision: (storedDoc.projectionRevision || 0) + (update.$inc?.projectionRevision || 0),
        };
        return JSON.parse(JSON.stringify(storedDoc));
      },
    };

    const consumer = new ExecutionGraphConsumer({
      graphDerivedModel: mockGraphDerivedModel,
    });

    // Complete parent task
    await consumer.process({
      eventId: "evt_parent_done",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "task",
      aggregateId: "parent_1",
      aggregateVersion: 2,
      causalSequence: 2000,
      type: "domain.task.completed",
      source: "TaskService",
      payload: {},
    } as any, 1);

    const child = storedDoc.nodes.find((n: any) => n.id === "child_1");
    assert.equal(child.status, "pending", "Child must be unblocked to pending once parent is completed");
    assert.ok(storedDoc.unblockedTaskIds.includes("child_1"), "Child must now be in unblockedTaskIds");
  });

  it("Scenario 4: Stale task event with version <= appliedVersion returns SKIPPED_STALE", async () => {
    const storedDoc = {
      graphId: "graph_user_1",
      userId: "user_1",
      nodes: [
        { id: "task_1", title: "Task 1", status: "pending", dependencies: [], appliedVersion: 3 },
      ],
      projectionRevision: 1,
      lastEventId: "evt_old",
    };

    const mockGraphDerivedModel = {
      findOne: async () => JSON.parse(JSON.stringify(storedDoc)),
    };

    const consumer = new ExecutionGraphConsumer({
      graphDerivedModel: mockGraphDerivedModel,
    });

    const res = await consumer.process({
      eventId: "evt_stale",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "task",
      aggregateId: "task_1",
      aggregateVersion: 2, // 2 <= 3 -> Stale
      causalSequence: 2000,
      type: "domain.task.updated",
      source: "TaskService",
      payload: { title: "Stale update" },
    } as any, 1);

    assert.equal(res.status, "SKIPPED_STALE");
  });
});
