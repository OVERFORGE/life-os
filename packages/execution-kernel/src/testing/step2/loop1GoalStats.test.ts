/**
 * loop1GoalStats.test.ts
 * 
 * Step 2 Loop 1 Test Battery:
 * - Multi-aggregate constituent version fencing (Goal v5 vs Task v1)
 * - Authoritative Task Reconciliation (Mode B Snapshot Boundary Protocol)
 * - Habitual cadence streak decoupling & preservation
 * - Tenant isolation verification
 * - CAS contention & retry exhaustion handling
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GoalIntelligenceConsumer } from "../../events/consumers/GoalIntelligenceConsumer";
import { ICanonicalEventEnvelope } from "../../events/contracts/CanonicalEventContracts";

describe("Step 2 — Loop 1: GoalStats and Multi-Aggregate Reconciliation", () => {
  it("Scenario 1: Task v1 is NOT dropped when Goal v5 was previously applied (Cross-Aggregate Monotonicity)", async () => {
    let storedDoc: any = {
      goalId: "goal_123",
      userId: "user_1",
      nature: "finite_deliverable",
      currentScore: 50,
      deliverableProgressPercent: 50,
      completedMilestonesCount: 1,
      totalMilestonesCount: 2,
      completedTasksCount: 1,
      totalTasksCount: 2,
      projectionRevision: 1,
      derivedFromVersions: {
        goalVersion: 5, // Higher goal version
        taskVersions: {},
      },
      lastEventId: "evt_goal_v5",
    };

    const mockGoalStatsModel = {
      findOne: async (query: any) => {
        if (query.goalId === "goal_123") return { ...storedDoc };
        return null;
      },
      findOneAndUpdate: async (query: any, update: any) => {
        if (query.goalId === "goal_123" && query.projectionRevision === storedDoc.projectionRevision) {
          const newDoc = { ...storedDoc, ...update.$set };
          if (update.$set && update.$set["derivedFromVersions.taskVersions.task_abc"]) {
            newDoc.derivedFromVersions = {
              ...newDoc.derivedFromVersions,
              taskVersions: {
                ...newDoc.derivedFromVersions?.taskVersions,
                task_abc: update.$set["derivedFromVersions.taskVersions.task_abc"],
              },
            };
          }
          newDoc.projectionRevision = storedDoc.projectionRevision + (update.$inc?.projectionRevision || 0);
          storedDoc = newDoc;
          return { ...storedDoc };
        }
        return null; // CAS mismatch
      },
    };

    const mockGoalModel = {
      findById: async () => ({
        _id: "goal_123",
        userId: "user_1",
        version: 5,
        milestones: [],
      }),
      exists: async () => false,
    };

    const mockTaskModel = {
      countDocuments: async (query: any) => {
        if (query.status === "completed") return 2;
        return 2;
      },
    };

    const consumer = new GoalIntelligenceConsumer({
      goalStatsModel: mockGoalStatsModel,
      goalModel: mockGoalModel,
      taskModel: mockTaskModel,
    });

    // Task v1 completion event arrives
    const taskV1Envelope: ICanonicalEventEnvelope = {
      eventId: "evt_task_v1",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "task",
      aggregateId: "task_abc",
      aggregateVersion: 1, // Version 1 is lower than Goal version 5!
      causalSequence: 1000,
      type: "domain.task.completed",
      source: "TaskService",
      payload: {
        goalId: "goal_123",
      },
    } as any;

    const result = await consumer.process(taskV1Envelope, 1);

    assert.equal(result.status, "SUCCEEDED", "Task v1 must succeed and NOT be marked SKIPPED_STALE");
    assert.equal(storedDoc.completedTasksCount, 2, "Authoritative count must reflect completed tasks");
    assert.equal(storedDoc.deliverableProgressPercent, 100, "Progress must be recalculated to 100%");
    assert.equal(storedDoc.derivedFromVersions.taskVersions["task_abc"], 1, "Task version 1 must be tracked");
    assert.equal(storedDoc.derivedFromVersions.goalVersion, 5, "Goal version 5 must be preserved");
  });

  it("Scenario 2: Habitual cadence streaks are decoupled and NEVER clobbered by task events", async () => {
    let storedDoc: any = {
      goalId: "goal_habit_1",
      userId: "user_1",
      nature: "habitual_cadence",
      currentScore: 85,
      currentStreak: 12, // 12-day active streak from signals
      bestStreakEver: 30,
      deliverableProgressPercent: 0,
      completedTasksCount: 5,
      totalTasksCount: 10,
      projectionRevision: 4,
      derivedFromVersions: {
        goalVersion: 2,
        taskVersions: {},
      },
      lastEventId: "evt_prev",
    };

    const mockGoalStatsModel = {
      findOne: async () => ({ ...storedDoc }),
      findOneAndUpdate: async (query: any, update: any) => {
        storedDoc = {
          ...storedDoc,
          ...update.$set,
          projectionRevision: storedDoc.projectionRevision + (update.$inc?.projectionRevision || 0),
        };
        return { ...storedDoc };
      },
    };

    const mockGoalModel = {
      findById: async () => ({
        _id: "goal_habit_1",
        userId: "user_1",
        version: 2,
        nature: "habitual_cadence",
      }),
      exists: async () => false,
    };

    const mockTaskModel = {
      countDocuments: async (query: any) => (query.status === "completed" ? 6 : 10),
    };

    const consumer = new GoalIntelligenceConsumer({
      goalStatsModel: mockGoalStatsModel,
      goalModel: mockGoalModel,
      taskModel: mockTaskModel,
    });

    const taskEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_task_completion_42",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "task",
      aggregateId: "task_42",
      aggregateVersion: 1,
      causalSequence: 1001,
      type: "domain.task.completed",
      source: "TaskService",
      payload: { goalId: "goal_habit_1" },
    } as any;

    const result = await consumer.process(taskEnvelope, 1);

    assert.equal(result.status, "SUCCEEDED");
    assert.equal(storedDoc.currentStreak, 12, "currentStreak must remain untouched by task completion");
    assert.equal(storedDoc.bestStreakEver, 30, "bestStreakEver must remain untouched by task completion");
    assert.equal(storedDoc.completedTasksCount, 6, "Task count must be authoritatively updated");
  });

  it("Scenario 3: Tenant mismatch fails immediately with FAILED_TERMINAL", async () => {
    const storedDoc = {
      goalId: "goal_user_a",
      userId: "user_A", // Belongs to user A
      projectionRevision: 1,
      derivedFromVersions: { goalVersion: 1, taskVersions: {} },
    };

    const mockGoalStatsModel = {
      findOne: async () => ({ ...storedDoc }),
    };

    const consumer = new GoalIntelligenceConsumer({
      goalStatsModel: mockGoalStatsModel,
    });

    // Malicious or mismatched event from user B
    const rogueEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_rogue",
      occurredAt: Date.now() as any,
      userId: "user_B",
      aggregateType: "task",
      aggregateId: "task_b",
      aggregateVersion: 1,
      causalSequence: 1000,
      type: "domain.task.completed",
      source: "TaskService",
      payload: { goalId: "goal_user_a" },
    } as any;

    const result = await consumer.process(rogueEnvelope, 1);

    assert.equal(result.status, "FAILED_TERMINAL", "Cross-tenant mutation must fail terminal");
    assert.match(result.error || "", /Tenant mismatch/, "Error must state tenant mismatch");
  });

  it("Scenario 4: Stale task event with version <= applied version is skipped as SKIPPED_STALE", async () => {
    const storedDoc = {
      goalId: "goal_1",
      userId: "user_1",
      projectionRevision: 2,
      derivedFromVersions: {
        goalVersion: 1,
        taskVersions: {
          task_99: 3, // Already at version 3
        },
      },
      lastEventId: "evt_old",
    };

    const mockGoalStatsModel = {
      findOne: async () => ({ ...storedDoc }),
    };

    const consumer = new GoalIntelligenceConsumer({
      goalStatsModel: mockGoalStatsModel,
    });

    const staleEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_stale_task",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "task",
      aggregateId: "task_99",
      aggregateVersion: 2, // 2 <= 3 -> Stale
      causalSequence: 2000,
      type: "domain.task.completed",
      source: "TaskService",
      payload: { goalId: "goal_1" },
    } as any;

    const result = await consumer.process(staleEnvelope, 1);

    assert.equal(result.status, "SKIPPED_STALE", "Older task version must be skipped as stale");
  });

  it("Scenario 5: Contention limit exhaustion preserves database and returns FAILED_RETRYABLE", async () => {
    let readCount = 0;
    const storedDoc = {
      goalId: "goal_contention",
      userId: "user_1",
      projectionRevision: 1,
      derivedFromVersions: { goalVersion: 1, taskVersions: {} },
    };

    const mockGoalStatsModel = {
      findOne: async () => {
        readCount++;
        return { ...storedDoc, projectionRevision: readCount }; // Revision keeps shifting mid-flight!
      },
      findOneAndUpdate: async () => null, // Always fail CAS
    };

    const mockGoalModel = {
      findById: async () => ({ _id: "goal_contention", version: 1 }),
      exists: async () => false,
    };

    const mockTaskModel = {
      countDocuments: async () => 1,
    };

    const consumer = new GoalIntelligenceConsumer({
      goalStatsModel: mockGoalStatsModel,
      goalModel: mockGoalModel,
      taskModel: mockTaskModel,
    });

    const envelope: ICanonicalEventEnvelope = {
      eventId: "evt_contended",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "task",
      aggregateId: "task_contended",
      aggregateVersion: 1,
      causalSequence: 1000,
      type: "domain.task.completed",
      source: "TaskService",
      payload: { goalId: "goal_contention" },
    } as any;

    const result = await consumer.process(envelope, 1);

    assert.equal(result.status, "FAILED_RETRYABLE");
    assert.equal(result.error, "CONTENTION_LIMIT_EXHAUSTED", "Must report explicit contention limit exhaustion");
  });
});
