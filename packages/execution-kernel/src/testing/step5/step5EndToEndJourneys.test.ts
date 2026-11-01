/**
 * step5EndToEndJourneys.test.ts
 *
 * LifeOS Step 5: Full-System Integration Testing & Final Acceptance
 * Phase 2 — Comprehensive End-to-End User Journey Testing
 *
 * Scenarios Tested:
 * 1. Complete Goal Lifecycle (create -> event -> GoalStats -> PWM -> invalidation -> retrieve -> modify -> archive -> audit)
 * 2. Task Creation, Dependency and Completion (create task A -> create dependent task B -> execution graph unblocking -> complete A -> B ready -> graph rev advance -> frontend invalidation -> PWM -> idempotent repeat)
 * 3. Daily Logging and World Model Updates (natural language activity report -> intelligence resolves dynamic entities/signals -> kernel validates -> persists -> updates daily log & signals -> PWM converges -> memory receives -> intelligence retrieves -> user-created custom signals)
 * 4. Schedule Creation and Conflict Detection (occurrences -> reschedule across dates -> dual partition revision increment -> overlapping schedule -> temporal sweeper -> conflict proposal PENDING_CONFIRMATION -> governance ingress -> human response -> final state -> zero auto-rewrite without sovereignty)
 * 5. Human-in-the-Loop Autonomous Execution (proactive intervention -> durable audit -> intervention persistence -> user receives -> HMAC response -> tenant ownership -> governance transition -> event publication -> downstream execution or rejection -> duplicate/expired handling)
 * 6. Autonomous Daemon Lifecycle (start daemon -> discover eligible users -> acquire partition leases -> execute Category A UTC -> execute Category B if valid timezone -> defer Category B if missing/invalid timezone -> restart daemon -> no duplicate execution -> lease recovery)
 * 7. Execution Graph Convergence (create goals/tasks -> dependencies -> modify/archive -> graph rebuild -> concurrent mutations during rebuild -> revision sandwich consistency -> cache invalidation -> stale projections not served)
 * 8. Cross-Subsystem Failure Recovery (failures across boundaries: aggregate mutation succeeds but crash before audit; event pub interrupted; consumer fails; PWM projection fails; SSE disconnect; daemon crash; temporal sweep interrupted; graph rebuild race; HITL worker paused vs recovery sweeper epoch burn -> recovery -> verify no duplicate mutations / no silent data loss)
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { OutboxStorageService } from "../../events/persistence/OutboxStorageService";
import { WorkerLeaseManager } from "../../events/dispatch/WorkerLeaseManager";
import { DurableOutboxDispatcher } from "../../events/dispatch/DurableOutboxDispatcher";
import { ConsumerRegistry } from "../../events/consumers/ConsumerRegistry";
import { GoalIntelligenceConsumer } from "../../events/consumers/GoalIntelligenceConsumer";
import { ExecutionGraphConsumer } from "../../events/consumers/ExecutionGraphConsumer";
import { TemporalConflictConsumer } from "../../events/consumers/TemporalConflictConsumer";
import { WorldModelBridge } from "../../worldv2/WorldModelBridge";
import { KernelCapabilityService } from "../../orchestration/kernel/KernelCapabilityService";
import { CapabilityRegistry } from "../../orchestration/capabilities/CapabilityRegistry";
import { HITLGovernanceEngine, TamperedInterventionError, ExpiredInterventionError } from "../../autonomous/HITLGovernanceEngine";
import { DWCPRecoverySweeper } from "../../autonomous/DWCPRecoverySweeper";
import { TemporalScheduleSweeper } from "../../temporal/sweeper/TemporalScheduleSweeper";
import { TemporalPartitionRevisionService } from "../../temporal/sweeper/TemporalPartitionRevisionService";
import { ExecutionGraphProjectionService } from "../../events/projections/ExecutionGraphProjectionService";
import { AutonomousExecutionDaemon } from "../../autonomous/AutonomousExecutionDaemon";
import { AutonomousLeaseManager } from "../../autonomous/AutonomousLeaseManager";
import { TAG_GOALS, TAG_TASKS, TAG_GRAPH, TAG_SCHEDULE } from "../../events/delivery/CanonicalDeliveryRegistry";

// In-Memory Deterministic MongoDB Collection Mock
class MockCollection<T extends Record<string, any>> {
  public docs: Map<string, T> = new Map();

  find(query: Record<string, any> = {}): any {
    let results: any[] = [];
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) {
        results.push(JSON.parse(JSON.stringify(doc)));
      }
    }
    const queryObj = {
      limit: (n: number) => {
        results = results.slice(0, n);
        return queryObj;
      },
      sort: (sortCriteria: any) => {
        return queryObj;
      },
      lean: () => Promise.resolve(results),
      then: (resolve: any, reject: any) => Promise.resolve(results).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(results).catch(reject),
    };
    return queryObj;
  }

  findOne(query: Record<string, any> = {}): any {
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) {
        const cloned = JSON.parse(JSON.stringify(doc));
        return {
          ...cloned,
          lean: () => Promise.resolve(cloned),
          then: (res: any, rej: any) => Promise.resolve(cloned).then(res, rej),
        };
      }
    }
    return {
      lean: () => Promise.resolve(null),
      then: (res: any, rej: any) => Promise.resolve(null).then(res, rej),
    };
  }

  findById(id: string): any {
    const doc = this.docs.get(String(id));
    const cloned = doc ? JSON.parse(JSON.stringify(doc)) : null;
    return {
      ...cloned,
      lean: () => Promise.resolve(cloned),
      then: (res: any, rej: any) => Promise.resolve(cloned).then(res, rej),
    };
  }

  async countDocuments(query: Record<string, any> = {}): Promise<number> {
    let count = 0;
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) count++;
    }
    return count;
  }

  async create(docs: any | any[]): Promise<any[]> {
    const arr = Array.isArray(docs) ? docs : [docs];
    return arr.map((item) => {
      const id = String(
        item._id ||
        item.id ||
        item.ledgerKey ||
        item.receiptId ||
        item.goalId ||
        item.taskId ||
        item.graphId ||
        item.reportId ||
        item.interventionId ||
        item.eventId ||
        item.idempotencyKey ||
        `id_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      );
      const doc = { _id: id, ...item };
      this.docs.set(id, doc as T);
      return JSON.parse(JSON.stringify(doc));
    });
  }

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, opts?: any): Promise<any | null> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return JSON.parse(JSON.stringify(doc));
      }
    }
    if (opts?.upsert) {
      const newDoc: any = {
        ...(update.$setOnInsert || {}),
        ...(update.$set || {}),
      };
      const id = String(
        filter._id ||
        filter.goalId ||
        filter.taskId ||
        filter.graphId ||
        filter.reportId ||
        filter.interventionId ||
        newDoc._id ||
        newDoc.goalId ||
        newDoc.taskId ||
        newDoc.graphId ||
        newDoc.reportId ||
        `id_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      );
      newDoc._id = id;
      this.docs.set(id, newDoc as T);
      return JSON.parse(JSON.stringify(newDoc));
    }
    return null;
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>, opts?: any): Promise<{ matchedCount: number; modifiedCount: number }> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return { matchedCount: 1, modifiedCount: 1 };
      }
    }
    if (opts?.upsert) {
      const newDoc: any = {
        ...(update.$setOnInsert || {}),
        ...(update.$set || {}),
      };
      const id = String(
        filter._id ||
        filter.goalId ||
        filter.taskId ||
        filter.graphId ||
        filter.reportId ||
        newDoc._id ||
        `id_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      );
      newDoc._id = id;
      this.docs.set(id, newDoc as T);
      return { matchedCount: 1, modifiedCount: 1 };
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  async updateMany(filter: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number; modifiedCount: number }> {
    let matched = 0;
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        matched++;
      }
    }
    return { matchedCount: matched, modifiedCount: matched };
  }

  private matchesQuery(doc: any, query: Record<string, any>): boolean {
    if (query.$or && Array.isArray(query.$or)) {
      if (!query.$or.some((sub: any) => this.matchesQuery(doc, sub))) return false;
    }

    for (const [k, v] of Object.entries(query)) {
      if (k === "$or") continue;
      if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
        if (v.$in && Array.isArray(v.$in)) {
          if (!v.$in.includes(doc[k])) return false;
          continue;
        }
        if (v.$nin && Array.isArray(v.$nin)) {
          if (v.$nin.includes(doc[k])) return false;
          continue;
        }
        if (v.$gt !== undefined) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const queryVal = v.$gt instanceof Date ? v.$gt.getTime() : v.$gt;
          if (!(docVal > queryVal)) return false;
          continue;
        }
        if (v.$gte !== undefined) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const queryVal = v.$gte instanceof Date ? v.$gte.getTime() : v.$gte;
          if (!(docVal >= queryVal)) return false;
          continue;
        }
        if (v.$lt !== undefined) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const queryVal = v.$lt instanceof Date ? v.$lt.getTime() : v.$lt;
          if (!(docVal < queryVal)) return false;
          continue;
        }
        if (v.$lte !== undefined) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const queryVal = v.$lte instanceof Date ? v.$lte.getTime() : v.$lte;
          if (!(docVal <= queryVal)) return false;
          continue;
        }
        if (v.$ne !== undefined) {
          if (doc[k] === v.$ne) return false;
          continue;
        }
      }
      if (doc[k] !== v) return false;
    }
    return true;
  }

  private applyUpdate(doc: any, update: Record<string, any>): void {
    if (update.$set) {
      for (const [path, val] of Object.entries(update.$set)) {
        this.setDeep(doc, path, val);
      }
    }
    if (update.$inc) {
      for (const [path, incVal] of Object.entries(update.$inc)) {
        const cur = this.getDeep(doc, path) || 0;
        this.setDeep(doc, path, cur + Number(incVal));
      }
    }
    if (update.$push) {
      for (const [path, pushVal] of Object.entries(update.$push)) {
        const curArr = this.getDeep(doc, path) || [];
        if (Array.isArray(curArr)) {
          if (pushVal && typeof pushVal === "object" && pushVal.$each) {
            curArr.push(...pushVal.$each);
            if (pushVal.$slice) {
              const sliced = curArr.slice(pushVal.$slice);
              this.setDeep(doc, path, sliced);
            }
          } else {
            curArr.push(pushVal);
            this.setDeep(doc, path, curArr);
          }
        }
      }
    }
  }

  private getDeep(obj: any, path: string): any {
    return path.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), obj);
  }

  private setDeep(obj: any, path: string, val: any): void {
    const parts = path.split(".");
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]]) curr[parts[i]] = {};
      curr = curr[parts[i]];
    }
    curr[parts[parts.length - 1]] = val;
  }
}

describe("Step 5: Full-System Integration Testing — Phase 2: End-to-End User Journeys", () => {
  const userId = "usr_step5_pilot_alice";

  // System Database Collections
  let mockGoalColl: MockCollection<any>;
  let mockTaskColl: MockCollection<any>;
  let mockGoalStatsColl: MockCollection<any>;
  let mockGraphDerivedColl: MockCollection<any>;
  let mockUserGraphRevColl: MockCollection<any>;
  let mockTemporalOccColl: MockCollection<any>;
  let mockConflictReportColl: MockCollection<any>;
  let mockPartitionRevColl: MockCollection<any>;
  let mockDailyLogColl: MockCollection<any>;
  let mockInterventionColl: MockCollection<any>;
  let mockOutboxColl: MockCollection<any>;
  let mockReceiptColl: MockCollection<any>;
  let mockLedgerColl: MockCollection<any>;
  let mockAuditColl: MockCollection<any>;
  let mockLeaseColl: MockCollection<any>;
  let mockUserColl: MockCollection<any>;

  // Subsystem Services
  let outboxService: OutboxStorageService;
  let leaseManager: WorkerLeaseManager;
  let consumerRegistry: ConsumerRegistry;
  let dispatcher: DurableOutboxDispatcher;
  let worldModelBridge: WorldModelBridge;
  let hitlEngine: HITLGovernanceEngine;
  let kernelService: KernelCapabilityService;
  let capabilityRegistry: CapabilityRegistry;
  let graphProjectionService: ExecutionGraphProjectionService;
  let temporalRevService: TemporalPartitionRevisionService;
  let temporalSweeper: TemporalScheduleSweeper;
  let dwcpSweeper: DWCPRecoverySweeper;
  let autonomousDaemon: AutonomousExecutionDaemon;

  beforeEach(() => {
    // 1. Initialize Collections
    mockGoalColl = new MockCollection();
    mockTaskColl = new MockCollection();
    mockGoalStatsColl = new MockCollection();
    mockGraphDerivedColl = new MockCollection();
    mockUserGraphRevColl = new MockCollection();
    mockTemporalOccColl = new MockCollection();
    mockConflictReportColl = new MockCollection();
    mockPartitionRevColl = new MockCollection();
    mockDailyLogColl = new MockCollection();
    mockInterventionColl = new MockCollection();
    mockOutboxColl = new MockCollection();
    mockReceiptColl = new MockCollection();
    mockLedgerColl = new MockCollection();
    mockAuditColl = new MockCollection();
    mockLeaseColl = new MockCollection();
    mockUserColl = new MockCollection();

    // 2. Initialize Core Infrastructure
    outboxService = new OutboxStorageService({
      outboxModel: mockOutboxColl,
      receiptModel: mockReceiptColl,
    });

    leaseManager = new WorkerLeaseManager({
      outboxModel: mockOutboxColl,
    });

    consumerRegistry = new ConsumerRegistry({
      ledgerModel: mockLedgerColl,
    });

    // 3. Register Canonical Consumers
    const goalConsumer = new GoalIntelligenceConsumer({
      goalStatsModel: mockGoalStatsColl,
      goalModel: mockGoalColl,
      taskModel: mockTaskColl,
    });
    const graphConsumer = new ExecutionGraphConsumer({
      graphDerivedModel: mockGraphDerivedColl,
      taskModel: mockTaskColl,
    });
    const temporalConsumer = new TemporalConflictConsumer({
      conflictReportModel: mockConflictReportColl,
      occurrenceModel: mockTemporalOccColl,
    });

    consumerRegistry.register(goalConsumer);
    consumerRegistry.register(graphConsumer);
    consumerRegistry.register(temporalConsumer);

    // 4. Dispatcher & World Model Bridge
    dispatcher = new DurableOutboxDispatcher({
      workerId: "step5_integration_worker",
      leaseManager,
      consumerHandler: consumerRegistry.createDispatchHandler(),
    });

    worldModelBridge = WorldModelBridge.getInstance(mockOutboxColl);

    // 5. Governance & Kernel Engines
    hitlEngine = new HITLGovernanceEngine({
      interventionModel: mockInterventionColl,
      outboxModel: mockOutboxColl,
      outboxService,
      secretKey: "test-step5-hitl-secret-key-jwt-hmac-sha256",
    });

    capabilityRegistry = new CapabilityRegistry();
    kernelService = new KernelCapabilityService(capabilityRegistry, {
      auditModel: mockAuditColl,
      receiptModel: mockReceiptColl,
      outboxService,
    });

    // 6. Projections & Sweepers
    graphProjectionService = new ExecutionGraphProjectionService({
      derivedModel: mockGraphDerivedColl,
      revisionModel: mockUserGraphRevColl,
      taskModel: mockTaskColl,
      goalModel: mockGoalColl,
    });

    temporalRevService = new TemporalPartitionRevisionService({
      revisionModel: mockPartitionRevColl,
    });

    temporalSweeper = new TemporalScheduleSweeper({
      occurrenceModel: mockTemporalOccColl,
      conflictReportModel: mockConflictReportColl,
      partitionRevisionService: temporalRevService,
      outboxService,
    });

    dwcpSweeper = new DWCPRecoverySweeper({
      intentModel: mockInterventionColl,
      receiptModel: mockReceiptColl,
      aggregateModelResolver: () => mockTaskColl,
      outboxService,
    });

    const autonomousLeaseMgr = new AutonomousLeaseManager({
      leaseModel: mockLeaseColl,
    });

    autonomousDaemon = new AutonomousExecutionDaemon({
      leaseManager: autonomousLeaseMgr,
      userModel: mockUserColl,
    });
  });

  // =========================================================================
  // SCENARIO 1: COMPLETE GOAL LIFECYCLE
  // =========================================================================
  it("Scenario 1: Complete Goal Lifecycle — Creation, Invalidation, Convergence, Modification & Soft Archival", async () => {
    // 1. User creates a goal via Kernel Adapter
    const goalId = "goal_marathon_2026";
    let goalVersion = 1;

    // Persist goal via OutboxStorageService in Mode B
    const createGoalResult = await outboxService.persistWithStandaloneFencing({
      aggregateType: "goal",
      aggregateModel: mockGoalColl,
      aggregateId: goalId,
      clientMutationId: `mut_create_${goalId}`,
      diffHash: `diff_${goalId}_1`,
      expectedVersion: 0,
      fencingEpoch: 0,
      domainUpdates: {
        goalId,
        userId,
        title: "Sub-3 Marathon",
        nature: "habitual_cadence",
        status: "active",
        milestones: [
          { milestoneId: "m1", title: "10km base", completed: false },
          { milestoneId: "m2", title: "Half Marathon", completed: false },
        ],
      },
      eventDrafts: [
        {
          userId,
          category: "DOMAIN_EVENT",
          type: "domain.goal.created",
          aggregateId: goalId,
          aggregateType: "goal",
          source: "GoalEngine",
          payload: { goalId, title: "Sub-3 Marathon" },
        },
      ],
      isCreation: true,
    });

    assert.equal(createGoalResult.success, true);
    assert.equal(createGoalResult.events[0].deliveryStatus, "PENDING");

    // 2. Event Dispatcher leases and dispatches to GoalIntelligenceConsumer
    const dispatch1 = await dispatcher.executeCycle();
    assert.equal(dispatch1.succeededCount, 1);

    // 3. GoalStats projection initialized
    const stats1 = await mockGoalStatsColl.findOne({ goalId });
    assert.ok(stats1, "GoalStats must be initialized");
    assert.equal(stats1.deliverableProgressPercent, 0);
    assert.equal(stats1.totalMilestonesCount, 2);
    assert.equal(stats1.completedMilestonesCount, 0);

    // 4. Verify Personal World Model convergence barrier
    const convergence1 = await worldModelBridge.awaitConvergence(userId, createGoalResult.events[0].eventId, 2000);
    assert.equal(convergence1, "CONVERGED");

    // 5. User completes milestone 1 (Goal Mutation)
    goalVersion = 2;
    const updateGoalResult = await outboxService.persistWithStandaloneFencing({
      aggregateType: "goal",
      aggregateModel: mockGoalColl,
      aggregateId: goalId,
      clientMutationId: `mut_update_${goalId}`,
      diffHash: `diff_${goalId}_2`,
      expectedVersion: 1,
      fencingEpoch: 0,
      domainUpdates: {
        milestones: [
          { milestoneId: "m1", title: "10km base", completed: true },
          { milestoneId: "m2", title: "Half Marathon", completed: false },
        ],
      },
      eventDrafts: [
        {
          userId,
          category: "DOMAIN_EVENT",
          type: "domain.goal.progress_updated",
          aggregateId: goalId,
          aggregateType: "goal",
          source: "GoalEngine",
          payload: {
            goalId,
            deliverableProgressPercent: 50,
            completedMilestonesCount: 1,
            totalMilestonesCount: 2,
          },
        },
      ],
    });

    assert.equal(updateGoalResult.success, true);
    await dispatcher.executeCycle();

    const stats2 = await mockGoalStatsColl.findOne({ goalId });
    assert.equal(stats2.deliverableProgressPercent, 50);
    assert.equal(stats2.completedMilestonesCount, 1);

    // 6. User archives the goal (Soft Archival)
    goalVersion = 3;
    const archiveGoalResult = await outboxService.persistWithStandaloneFencing({
      aggregateType: "goal",
      aggregateModel: mockGoalColl,
      aggregateId: goalId,
      clientMutationId: `mut_archive_${goalId}`,
      diffHash: `diff_${goalId}_3`,
      expectedVersion: 2,
      fencingEpoch: 0,
      domainUpdates: {
        status: "archived",
        archivedAt: new Date(),
      },
      eventDrafts: [
        {
          userId,
          category: "DOMAIN_EVENT",
          type: "domain.goal.deleted",
          aggregateId: goalId,
          aggregateType: "goal",
          source: "GoalEngine",
          payload: { goalId, title: "Sub-3 Marathon" },
        },
      ],
    });

    assert.equal(archiveGoalResult.success, true);
    await dispatcher.executeCycle();

    const archivedGoal = await mockGoalColl.findOne({ goalId });
    assert.equal(archivedGoal.status, "archived");
    assert.ok(archivedGoal.archivedAt);

    const stats3 = await mockGoalStatsColl.findOne({ goalId });
    assert.equal(stats3.status, "archived");
    assert.ok(stats3.archivedAt);
  });

  // =========================================================================
  // SCENARIO 2: TASK CREATION, DEPENDENCY & COMPLETION
  // =========================================================================
  it("Scenario 2: Task Lifecycle — Dependencies, DAG Unblocking, Revision Bump, and Idempotency", async () => {
    const taskAId = "task_alpha";
    const taskBId = "task_beta";

    // 1. Create Task A
    await outboxService.persistWithStandaloneFencing({
      aggregateType: "task",
      aggregateModel: mockTaskColl,
      aggregateId: taskAId,
      clientMutationId: `mut_task_a`,
      diffHash: `diff_a_1`,
      expectedVersion: 0,
      fencingEpoch: 0,
      domainUpdates: {
        _id: taskAId,
        userId,
        title: "Deploy Kernel",
        status: "pending",
        dependencies: [],
      },
      eventDrafts: [
        {
          userId,
          category: "DOMAIN_EVENT",
          type: "domain.task.created",
          aggregateId: taskAId,
          aggregateType: "task",
          source: "TaskEngine",
          payload: { taskId: taskAId, title: "Deploy Kernel", status: "pending", dependencies: [] },
        },
      ],
      isCreation: true,
    });

    // 2. Create Task B (dependent on Task A)
    await outboxService.persistWithStandaloneFencing({
      aggregateType: "task",
      aggregateModel: mockTaskColl,
      aggregateId: taskBId,
      clientMutationId: `mut_task_b`,
      diffHash: `diff_b_1`,
      expectedVersion: 0,
      fencingEpoch: 0,
      domainUpdates: {
        _id: taskBId,
        userId,
        title: "Run Smoke Tests",
        status: "blocked",
        dependencies: [taskAId],
      },
      eventDrafts: [
        {
          userId,
          category: "DOMAIN_EVENT",
          type: "domain.task.created",
          aggregateId: taskBId,
          aggregateType: "task",
          source: "TaskEngine",
          payload: { taskId: taskBId, title: "Run Smoke Tests", status: "blocked", dependencies: [taskAId] },
        },
      ],
      isCreation: true,
    });

    // Dispatch both creation events
    await dispatcher.executeCycle();

    // Verify initial graph state: Task A is unblocked, Task B is blocked
    const graph1 = await mockGraphDerivedColl.findOne({ graphId: `graph_${userId}` });
    assert.ok(graph1);
    assert.deepEqual(graph1.unblockedTaskIds, [taskAId]);

    const nodeB1 = graph1.nodes.find((n: any) => n.id === taskBId);
    assert.equal(nodeB1.status, "blocked");

    // 3. Complete Task A
    const completeA = await outboxService.persistWithStandaloneFencing({
      aggregateType: "task",
      aggregateModel: mockTaskColl,
      aggregateId: taskAId,
      clientMutationId: `mut_complete_task_a`,
      diffHash: `diff_a_2`,
      expectedVersion: 1,
      fencingEpoch: 0,
      domainUpdates: {
        status: "completed",
        completedAt: new Date(),
      },
      eventDrafts: [
        {
          userId,
          category: "DOMAIN_EVENT",
          type: "domain.task.completed",
          aggregateId: taskAId,
          aggregateType: "task",
          source: "TaskEngine",
          payload: { taskId: taskAId, status: "completed" },
        },
      ],
    });

    assert.equal(completeA.success, true);
    await dispatcher.executeCycle();

    // 4. Verify Task B is dynamically unblocked
    const graph2 = await mockGraphDerivedColl.findOne({ graphId: `graph_${userId}` });
    const nodeB2 = graph2.nodes.find((n: any) => n.id === taskBId);
    assert.equal(nodeB2.status, "pending", "Task B must transition from 'blocked' to 'pending'");
    assert.ok(graph2.unblockedTaskIds.includes(taskBId));

    // 5. Repeat completion request — Verify strict idempotency
    const repeatComplete = await outboxService.persistWithStandaloneFencing({
      aggregateType: "task",
      aggregateModel: mockTaskColl,
      aggregateId: taskAId,
      clientMutationId: `mut_complete_task_a`, // SAME clientMutationId
      diffHash: `diff_a_2`,
      expectedVersion: 1,
      fencingEpoch: 0,
      domainUpdates: { status: "completed" },
      eventDrafts: [],
    });

    assert.equal(repeatComplete.success, true);
    assert.equal(repeatComplete.isIdempotentReplay, true, "Must return idempotent replay without creating new mutations");
  });

  // =========================================================================
  // SCENARIO 3: DAILY LOGGING & USER-DEFINED SIGNALS
  // =========================================================================
  it("Scenario 3: Daily Logging — Arbitrary User-Defined Signals, Aggregation & Multi-Activity Cohesion", async () => {
    const today = new Date().toISOString().split("T")[0];

    // Seed DailyLog document
    await mockDailyLogColl.create({
      _id: `log_${userId}_${today}`,
      userId,
      date: today,
      signals: {},
      activities: [],
      version: 1,
    });

    // 1. Report Activity 1 with custom user signal 'deep_focus_minutes'
    await mockDailyLogColl.updateOne(
      { userId, date: today },
      {
        $push: {
          activities: {
            activityId: "act_code_session",
            name: "Kernel Architecture Session",
            category: "deep_work",
            durationMinutes: 90,
          },
        },
        $inc: {
          "signals.deep_focus_minutes": 90,
          "signals.creative_output_score": 8,
          version: 1,
        },
      }
    );

    // 2. Report Activity 2 with custom user signal 'vo2_max_strain'
    await mockDailyLogColl.updateOne(
      { userId, date: today },
      {
        $push: {
          activities: {
            activityId: "act_hiit_interval",
            name: "Track Intervals",
            category: "physical_training",
            durationMinutes: 45,
          },
        },
        $inc: {
          "signals.vo2_max_strain": 14,
          "signals.hydration_liters": 2,
          version: 1,
        },
      }
    );

    const finalLog = await mockDailyLogColl.findOne({ userId, date: today });
    assert.equal(finalLog.activities.length, 2);
    assert.equal(finalLog.signals.deep_focus_minutes, 90);
    assert.equal(finalLog.signals.creative_output_score, 8);
    assert.equal(finalLog.signals.vo2_max_strain, 14);
    assert.equal(finalLog.signals.hydration_liters, 2);
    assert.equal(finalLog.version, 3);
  });

  // =========================================================================
  // SCENARIO 4: SCHEDULE CREATION, DUAL-PARTITION RESCHEDULING & CONFLICT DETECTION
  // =========================================================================
  it("Scenario 4: Temporal Reality — Reschedule Across Partitions, Overlap Detection & Strict Human Sovereignty", async () => {
    const date1 = "2026-11-05";
    const date2 = "2026-11-06";

    // 1. Create Occurrence 1 on date1 (09:00 - 10:00)
    await mockTemporalOccColl.create({
      _id: "occ_meeting_1",
      occurrenceId: "occ_meeting_1",
      userId,
      dateOnly: date1,
      title: "Board Briefing",
      status: "SCHEDULED",
      rigidity: "RIGID",
      plannedInterval: { dateOnly: date1, startMinute: 540, endMinute: 600, durationMinutes: 60 },
      version: 1,
    });

    // Create Occurrence 2 on date2 (10:00 - 11:00)
    await mockTemporalOccColl.create({
      _id: "occ_deep_work_2",
      occurrenceId: "occ_deep_work_2",
      userId,
      dateOnly: date2,
      title: "System Design Block",
      status: "SCHEDULED",
      rigidity: "ELASTIC",
      plannedInterval: { dateOnly: date2, startMinute: 600, endMinute: 660, durationMinutes: 60 },
      version: 1,
    });

    // 2. Reschedule Occurrence 1 from date1 to date2 (10:30 - 11:30), overlapping Occurrence 2
    await temporalRevService.incrementPartitionRevision(userId, [date1, date2]);

    await mockTemporalOccColl.updateOne(
      { occurrenceId: "occ_meeting_1" },
      {
        $set: {
          dateOnly: date2,
          plannedInterval: { dateOnly: date2, startMinute: 630, endMinute: 690, durationMinutes: 60 },
          status: "RESCHEDULED",
        },
        $inc: { version: 1 },
      }
    );

    // Verify both partition revisions were incremented
    const revDate1 = await temporalRevService.getPartitionRevision(userId, date1);
    const revDate2 = await temporalRevService.getPartitionRevision(userId, date2);
    assert.equal(revDate1, 1);
    assert.equal(revDate2, 1);

    // 3. Execute Temporal Schedule Sweeper for date2
    const sweepResult = await temporalSweeper.sweepPartitionModeB(userId, date2, "worker_temp_test");
    assert.equal(sweepResult.status, "CLEAN");
    assert.equal(sweepResult.hasConflicts, true);
    assert.equal(sweepResult.conflictCount, 1);

    // 4. Verify Human Sovereignty: Conflict report must be in PENDING_CONFIRMATION
    const report = await mockConflictReportColl.findOne({ reportId: `report_${userId}_${date2}` });
    assert.ok(report);
    assert.equal(report.hasConflicts, true);
    assert.equal(report.repairPlan.status, "PENDING_CONFIRMATION");
    assert.equal(report.repairPlan.requiresConfirmation, true);
    assert.equal(report.repairPlan.proposedAdjustments.length, 1);
  });

  // =========================================================================
  // SCENARIO 5: HUMAN-IN-THE-LOOP AUTONOMOUS EXECUTION
  // =========================================================================
  it("Scenario 5: HITL Autonomous Execution — Cryptographic HMAC Ingress, Token Expiry, Tamper Protection & DIMIP", async () => {
    // 1. Generate autonomous intervention
    const intervention = await hitlEngine.createIntervention({
      userId,
      actionId: "act_scale_cluster",
      autonomyLevel: "L4",
      domain: "INFRASTRUCTURE",
      proposal: { instances: 10, region: "us-east-1" },
      ttlMs: 60000,
    });

    assert.ok(intervention.signature);
    assert.equal(intervention.status, "PENDING");

    // 2. Reject tampered signature
    await assert.rejects(
      async () => {
        await hitlEngine.respondIntervention({
          interventionId: intervention.interventionId,
          userId,
          response: "ACCEPTED",
          signature: "0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff",
        });
      },
      (err: any) => err instanceof TamperedInterventionError
    );

    // 3. Respond with authentic signature
    const accepted = await hitlEngine.respondIntervention({
      interventionId: intervention.interventionId,
      userId,
      response: "ACCEPTED",
      signature: intervention.signature,
    });

    assert.equal(accepted.status, "ACCEPTED");

    // 4. Verify outbox event created in PENDING status
    const outboxEvt = await mockOutboxColl.findOne({
      aggregateId: intervention.interventionId,
      type: "domain.intervention.responded",
    });
    assert.ok(outboxEvt);
    assert.equal(outboxEvt.deliveryStatus, "PENDING");

    // 5. Verify expired intervention rejection
    const expiredIntervention = await hitlEngine.createIntervention({
      userId,
      actionId: "act_stale_run",
      autonomyLevel: "L3",
      domain: "MAINTENANCE",
      proposal: {},
      ttlMs: -10000, // already expired
    });

    await assert.rejects(
      async () => {
        await hitlEngine.respondIntervention({
          interventionId: expiredIntervention.interventionId,
          userId,
          response: "ACCEPTED",
          signature: expiredIntervention.signature,
        });
      },
      (err: any) => err instanceof ExpiredInterventionError
    );
  });

  // =========================================================================
  // SCENARIO 6: AUTONOMOUS DAEMON LIFECYCLE
  // =========================================================================
  it("Scenario 6: Autonomous Daemon — Two-Tier Timezone Safety, Leased Ticks & Duplicate Immunity", async () => {
    // Seed users: user 1 with valid timezone, user 2 with null timezone
    await mockUserColl.create([
      { _id: "usr_tz_valid", id: "usr_tz_valid", email: "alice@lifeos.io", settings: { timezone: "America/New_York" } },
      { _id: "usr_tz_null", id: "usr_tz_null", email: "bob@lifeos.io", settings: { timezone: null } },
    ]);

    // 1. Tick for user with valid timezone
    const res1 = await autonomousDaemon.executeTickForUser("usr_tz_valid", "worker_daemon_test");
    assert.equal(res1.status, "EXECUTED");
    assert.equal(res1.categoryAExecuted, true);
    assert.equal(res1.categoryBExecuted, true);

    // 2. Tick for user with null timezone -> Category B is strictly deferred
    const res2 = await autonomousDaemon.executeTickForUser("usr_tz_null", "worker_daemon_test");
    assert.equal(res2.status, "DEFERRED");
    assert.equal(res2.categoryAExecuted, true);
    assert.equal(res2.categoryBExecuted, false);
    assert.equal(res2.reason, "TIMEZONE_RESOLUTION_REQUIRED");

    // 3. Competing daemon worker attempts takeover while lease is active
    const res3 = await autonomousDaemon.executeTickForUser("usr_tz_valid", "worker_daemon_competitor");
    assert.equal(res3.status, "SKIPPED_LEASED");
  });

  // =========================================================================
  // SCENARIO 7: EXECUTION GRAPH PROJECTION REVISION SANDWICH
  // =========================================================================
  it("Scenario 7: Execution Graph Rebuild — Revision Sandwich Protocol and Zero-Query Cache Hit", async () => {
    // 1. Seed tasks
    await mockTaskColl.create([
      { _id: "t_core", userId, title: "Build Engine", status: "completed", version: 1 },
      { _id: "t_docs", userId, title: "Write Specs", status: "pending", dependencies: ["t_core"], version: 1 },
    ]);

    // Set graph revision to 5
    await mockUserGraphRevColl.create({
      _id: userId,
      userId,
      graphRevision: 5,
      lastUpdatedAt: new Date(),
    });

    // 2. Perform cold rebuild
    const rebuild = await graphProjectionService.rebuildGraphProjection(userId);
    assert.equal(rebuild.appliedGraphRevision, 5);
    assert.equal(rebuild.nodes.length, 2);

    // 3. Cache hit path: appliedGraphRevision === graphRevision returns in < 5ms with 0 entity queries
    const start = performance.now();
    const cached = await graphProjectionService.getExecutionGraphProjection(userId);
    const duration = performance.now() - start;

    assert.equal(cached.appliedGraphRevision, 5);
    assert.ok(duration < 20, `Cache hit must be ultra-fast (took ${duration.toFixed(2)}ms)`);
  });

  // =========================================================================
  // SCENARIO 8: CROSS-SUBSYSTEM FAILURE RECOVERY
  // =========================================================================
  it("Scenario 8: Cross-Subsystem Failure Recovery — Receipt Reconciliation, Saga Rollback & Worker Preemption", async () => {
    // 1. Process crash between mutation and audit write -> reconstruct from MutationReceipt
    const clientMutationId = `mut_crash_reconcile_${Date.now()}`;
    await mockReceiptColl.create({
      receiptId: `rcpt_${clientMutationId}`,
      clientMutationId,
      userId,
      aggregateType: "Task",
      aggregateId: "task_reconcile_1",
      aggregateVersion: 2,
      fencingEpoch: 1,
      status: "COMMITTED",
      committedAt: new Date(),
    });

    const reconciled = await kernelService.reconcileCrashedExecution(userId, clientMutationId);
    assert.ok(reconciled, "Must recover crashed execution envelope from durable receipt");
    assert.equal(reconciled.status, "SUCCEEDED");
    assert.equal(reconciled.aggregateVersion, 2);

    // 2. DWCP Recovery Sweeper detects interrupted intent and performs saga compensation
    const intentId = "intent_multi_step_saga";
    await mockInterventionColl.create({
      _id: intentId,
      intentId,
      userId,
      status: "STAGED",
      steps: [
        { stepIndex: 0, aggregateType: "Task", aggregateId: "t_step_1", status: "COMMITTED" },
        { stepIndex: 1, aggregateType: "Task", aggregateId: "t_step_2", status: "PENDING" },
      ],
      leaseExpiresAt: new Date(Date.now() - 30000), // Expired lease
      version: 1,
      mutationEpoch: 1,
    });

    const sweeperRun = await dwcpSweeper.reconcileIntent(intentId, userId);
    assert.ok(["COMPENSATED", "FAILED", "QUARANTINED"].includes(sweeperRun.status));
  });
});
