/**
 * b2EndToEndCausalReality.test.ts
 * 
 * Loop 8 (WP4) End-to-End Battery:
 * Full Lifecycle Unified Causal Integration Verification:
 * 1. Authoritative mutation via OutboxStorageService (DIMIP Mode B)
 * 2. Active in-flight detection in WorldModelBridge (Correction C)
 * 3. Durable leasing via WorkerLeaseManager & DurableOutboxDispatcher
 * 4. Consumer dispatch to GoalIntelligence & ExecutionGraph consumers
 * 5. Partial acknowledgment & sibling failure isolation via ConsumerProcessingLedger
 * 6. Monotonic same-version causalSequence protection against out-of-order regression (Correction B)
 * 7. Evidence-based Sweeper recovery avoiding false aborts (Correction A)
 * 8. Final convergence to DELIVERED state and stable World Model projection
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { OutboxStorageService } from "../events/persistence/OutboxStorageService";
import { WorkerLeaseManager } from "../events/dispatch/WorkerLeaseManager";
import { DurableOutboxDispatcher } from "../events/dispatch/DurableOutboxDispatcher";
import { ConsumerRegistry } from "../events/consumers/ConsumerRegistry";
import { GoalIntelligenceConsumer } from "../events/consumers/GoalIntelligenceConsumer";
import { ExecutionGraphConsumer } from "../events/consumers/ExecutionGraphConsumer";
import { WorldModelBridge } from "../worldv2/WorldModelBridge";

class MockMemoryCollection<T extends Record<string, any>> {
  public docs: Map<string, T> = new Map();

  find(query: Record<string, any>): any {
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
      lean: () => queryObj,
      then: (resolve: any, reject: any) => Promise.resolve(results).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(results).catch(reject),
    };
    return queryObj;
  }

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

  async countDocuments(query: Record<string, any>): Promise<number> {
    let count = 0;
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) count++;
    }
    return count;
  }

  async create(docs: any | any[]): Promise<any[]> {
    const arr = Array.isArray(docs) ? docs : [docs];
    return arr.map((item) => {
      const id = item._id || item.ledgerKey || item.receiptId || item.goalId || item.graphId || item.eventId || `id_${Date.now()}_${Math.random()}`;
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
      const newDoc = { ...(update.$setOnInsert || {}), ...(update.$set || {}) } as any;
      const docId = newDoc._id || newDoc.ledgerKey || newDoc.receiptId || newDoc.goalId || newDoc.graphId || newDoc.eventId || `id_${Date.now()}_${Math.random()}`;
      newDoc._id = docId;
      this.docs.set(docId, newDoc as T);
      return JSON.parse(JSON.stringify(newDoc));
    }
    return null;
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number; modifiedCount: number }> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return { matchedCount: 1, modifiedCount: 1 };
      }
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  async updateMany(filter: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number; modifiedCount: number }> {
    let count = 0;
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        count++;
      }
    }
    return { matchedCount: count, modifiedCount: count };
  }

  private matchesQuery(doc: Record<string, any>, query: Record<string, any>): boolean {
    if (query.$or && Array.isArray(query.$or)) {
      if (!query.$or.some((sub: any) => this.matchesQuery(doc, sub))) return false;
    }

    for (const [k, v] of Object.entries(query)) {
      if (k === "$or") continue;
      if (k === "_id") {
        if (v && typeof v === "object" && "$in" in v) {
          if (!v.$in.includes(doc._id)) return false;
        } else if (doc._id !== v) {
          return false;
        }
        continue;
      }
      if (k === "deliveryStatus" && v && typeof v === "object" && "$in" in v) {
        if (!v.$in.includes(doc.deliveryStatus)) return false;
        continue;
      }
      if (v && typeof v === "object" && "$lte" in v) {
        const docVal = doc[k] instanceof Date ? doc[k].getTime() : (typeof doc[k] === "string" && !isNaN(Date.parse(doc[k])) ? new Date(doc[k]).getTime() : doc[k]);
        const targetVal = (v as any).$lte instanceof Date ? (v as any).$lte.getTime() : (typeof (v as any).$lte === "string" && !isNaN(Date.parse((v as any).$lte)) ? new Date((v as any).$lte).getTime() : (v as any).$lte);
        if (docVal > targetVal) return false;
        continue;
      }
      if (k === "leaseExpiresAt" && v && typeof v === "object" && "$lt" in v) {
        if (!doc.leaseExpiresAt || new Date(doc.leaseExpiresAt).getTime() >= new Date(v.$lt).getTime()) return false;
        continue;
      }
      if (k === "derivedFromCausalSequence" && v && typeof v === "object" && "$lt" in v) {
        if ((doc.derivedFromCausalSequence ?? 0) >= (v as any).$lt) return false;
        continue;
      }
      if (doc[k] !== v) return false;
    }
    return true;
  }

  private applyUpdate(doc: Record<string, any>, update: Record<string, any>): void {
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] ?? 0) + (v as number);
      }
    }
    if (update.$push) {
      for (const [k, v] of Object.entries(update.$push)) {
        if (!doc[k]) doc[k] = [];
        if (v && typeof v === "object" && "$each" in v) {
          doc[k].push(...(v as any).$each);
          if (typeof (v as any).$slice === "number" && (v as any).$slice < 0) {
            doc[k] = doc[k].slice((v as any).$slice);
          }
        } else {
          doc[k].push(v);
        }
      }
    }
  }
}

describe("LOOP 8 (WP4): End-to-End Unified Causal Reality Battery", () => {
  let mockOutbox: MockMemoryCollection<any>;
  let mockReceipts: MockMemoryCollection<any>;
  let mockLedger: MockMemoryCollection<any>;
  let mockTasks: MockMemoryCollection<any>;
  let mockGoals: MockMemoryCollection<any>;
  let mockGoalStats: MockMemoryCollection<any>;
  let mockGraph: MockMemoryCollection<any>;

  let storageService: OutboxStorageService;
  let leaseManager: WorkerLeaseManager;
  let dispatcher: DurableOutboxDispatcher;
  let registry: ConsumerRegistry;
  let worldModelBridge: WorldModelBridge;

  beforeEach(() => {
    mockOutbox = new MockMemoryCollection();
    mockReceipts = new MockMemoryCollection();
    mockLedger = new MockMemoryCollection();
    mockTasks = new MockMemoryCollection();
    mockGoals = new MockMemoryCollection();
    mockGoalStats = new MockMemoryCollection();
    mockGraph = new MockMemoryCollection();

    storageService = new OutboxStorageService({
      outboxModel: mockOutbox,
      receiptModel: mockReceipts,
    });

    leaseManager = new WorkerLeaseManager({
      outboxModel: mockOutbox,
    });

    registry = new ConsumerRegistry({
      ledgerModel: mockLedger,
    });

    const goalConsumer = new GoalIntelligenceConsumer({
      goalStatsModel: mockGoalStats,
      goalModel: mockGoals,
      taskModel: mockTasks,
    });

    const graphConsumer = new ExecutionGraphConsumer({
      graphDerivedModel: mockGraph,
      taskModel: mockTasks,
    });

    registry.register(goalConsumer);
    registry.register(graphConsumer);

    dispatcher = new DurableOutboxDispatcher({
      workerId: "e2e_worker_1",
      leaseManager,
      consumerHandler: registry.createDispatchHandler(),
    });

    worldModelBridge = WorldModelBridge.getInstance(mockOutbox);
  });

  it("E2E-01: Full lifecycle mutation -> outbox -> dispatch -> consumers -> ledger -> DELIVERED", async () => {
    const userId = "usr_e2e_alice";

    // 1. Seed initial primary state
    await mockTasks.create({
      _id: "task_1",
      userId,
      title: "Write Architecture Spec",
      status: "pending",
      goalId: "goal_1",
      version: 1,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    await mockGoals.create({
      _id: "goal_1",
      userId,
      title: "Launch Phase B2",
      status: "active",
      deliverableProgressPercent: 0,
      milestones: [
        { milestoneId: "m1", title: "Architecture Spec", completed: false },
        { milestoneId: "m2", title: "Implementation", completed: false },
      ],
    });

    await mockGraph.create({
      _id: `graph_${userId}`,
      graphId: `graph_${userId}`,
      userId,
      nodes: [
        { id: "task_1", title: "Write Architecture Spec", status: "pending", dependencies: [] },
        { id: "task_2", title: "Implement Core", status: "blocked", dependencies: ["task_1"] },
      ],
      unblockedTaskIds: [],
      derivedFromCausalSequence: 1000,
      lastEventId: "evt_init",
    });

    // 2. Perform authoritative domain mutation via OutboxStorageService (DIMIP Mode B)
    const commitResult = await storageService.persistWithStandaloneFencing({
      userId,
      aggregateModel: mockTasks as any,
      aggregateId: "task_1",
      clientMutationId: "mut_client_001",
      diffHash: "hash_task_1_completed",
      expectedVersion: 1,
      fencingEpoch: 0,
      domainUpdates: { status: "completed", completedAt: new Date() },
      eventDrafts: [
        {
          userId,
          category: "DOMAIN_EVENT",
          type: "domain.task.completed",
          aggregateId: "task_1",
          aggregateType: "task",
          aggregateVersion: 2,
          eventOrdinal: 1,
          source: "task_service",
          payload: { taskId: "task_1", goalId: "goal_1", title: "Write Architecture Spec" },
        },
      ],
    });

    assert.equal(commitResult.events.length, 1);
    assert.equal(commitResult.events[0].deliveryStatus, "PENDING");
    assert.equal(commitResult.receipt.status, "COMMITTED");

    // 3. Verify WorldModelBridge in-flight detection (Correction C)
    const inFlightBefore = await worldModelBridge.hasInFlightEvents(userId);
    assert.equal(inFlightBefore, true, "WorldModelBridge must detect in-flight event during active propagation");

    // 4. Dispatcher executes cycle: leases event and dispatches to registered consumers
    const report = await dispatcher.executeCycle();
    assert.equal(report.leasedCount, 1);
    assert.equal(report.succeededCount, 1);
    assert.equal(report.failedCount, 0);

    // 5. Verify Goal Intelligence Consumer executed and initialized/updated GoalStats
    const goalStats = await mockGoalStats.findOne({ goalId: "goal_1" });
    assert.ok(goalStats);
    assert.equal(goalStats.completedTasksCount, 1);
    assert.equal(goalStats.derivedFromCausalSequence, 2001);

    // 6. Verify Execution Graph Consumer unblocked task_2
    const graphDoc = await mockGraph.findOne({ graphId: `graph_${userId}` });
    assert.ok(graphDoc);
    const node2 = graphDoc.nodes.find((n: any) => n.id === "task_2");
    assert.equal(node2.status, "pending", "Downstream task_2 must be unblocked to 'pending'");
    assert.deepEqual(graphDoc.unblockedTaskIds, ["task_2"]);

    // 7. Verify Consumer Processing Ledger recorded completions
    const goalLedger = await mockLedger.findOne({
      ledgerKey: `${userId}:GoalIntelligenceConsumer:${commitResult.events[0].eventId}`,
    });
    const graphLedger = await mockLedger.findOne({
      ledgerKey: `${userId}:ExecutionGraphConsumer:${commitResult.events[0].eventId}`,
    });
    assert.equal(goalLedger.status, "SUCCEEDED");
    assert.equal(graphLedger.status, "SUCCEEDED");

    // 8. Verify Outbox Event reached DELIVERED state
    const deliveredEvent = await mockOutbox.findById(String(commitResult.events[0]._id));
    assert.equal(deliveredEvent.deliveryStatus, "DELIVERED");

    // 9. Verify WorldModelBridge in-flight cleared (active propagation finished)
    const inFlightAfter = await worldModelBridge.hasInFlightEvents(userId);
    assert.equal(inFlightAfter, false, "In-flight guard must clear once event is DELIVERED");
  });

  it("E2E-02: Sibling consumer failure isolation & partial acknowledgment on redelivery", async () => {
    const userId = "usr_e2e_bob";

    let transientFail = true;
    registry.register({
      name: "TransientFailingConsumer",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["*"],
      process: async () => {
        if (transientFail) {
          return { status: "FAILED_RETRYABLE", error: "Simulated transient failure" };
        }
        return { status: "SUCCEEDED" };
      },
    });

    await mockTasks.create({
      _id: "task_e2e_2",
      userId,
      version: 1,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const commitResult = await storageService.persistWithStandaloneFencing({
      userId,
      aggregateModel: mockTasks as any,
      aggregateId: "task_e2e_2",
      clientMutationId: "mut_e2e_sibling",
      diffHash: "diff_sibling",
      expectedVersion: 1,
      fencingEpoch: 0,
      domainUpdates: { status: "completed" },
      eventDrafts: [
        {
          userId,
          category: "DOMAIN_EVENT",
          type: "domain.task.completed",
          aggregateId: "task_e2e_2",
          aggregateType: "task",
          aggregateVersion: 2,
          eventOrdinal: 1,
          source: "task_service",
          payload: { taskId: "task_e2e_2" },
        },
      ],
    });

    // Cycle 1: GoalIntelligence and ExecutionGraph succeed, TransientFailingConsumer fails
    const report1 = await dispatcher.executeCycle();
    assert.equal(report1.leasedCount, 1);
    assert.equal(report1.failedCount, 1);

    // Goal and Graph consumers recorded SUCCEEDED in ledger
    const goalLedger = await mockLedger.findOne({
      ledgerKey: `${userId}:GoalIntelligenceConsumer:${commitResult.events[0].eventId}`,
    });
    assert.equal(goalLedger.status, "SUCCEEDED");

    // Event is released back to PENDING for retry
    const eventAfterFail = await mockOutbox.findById(String(commitResult.events[0]._id));
    assert.equal(eventAfterFail.deliveryStatus, "PENDING");
    assert.equal(eventAfterFail.attempts, 1);

    // Cycle 2: Fix transient issue; redeliver
    transientFail = false;
    // Set nextAttemptAt to past
    const doc = mockOutbox.docs.get(String(commitResult.events[0]._id));
    doc.nextAttemptAt = new Date(Date.now() - 1000);

    const report2 = await dispatcher.executeCycle();
    assert.equal(report2.leasedCount, 1);
    assert.equal(report2.succeededCount, 1);

    // Event is now DELIVERED
    const finalEvent = await mockOutbox.findById(String(commitResult.events[0]._id));
    assert.equal(finalEvent.deliveryStatus, "DELIVERED");
  });

  it("E2E-03 (Correction B): Monotonic causalSequence prevents regression across multiple same-version events", async () => {
    const userId = "usr_e2e_carol";

    await mockGoalStats.create({
      _id: "goal_carol",
      goalId: "goal_carol",
      userId,
      deliverableProgressPercent: 0,
      derivedFromCausalSequence: 0,
      lastEventId: "evt_init",
    });

    // Event B: causalSequence 3002 (e.g. 90% progress)
    const eventB = {
      eventId: "evt_goal_gc_v3_2_progress",
      userId,
      category: "DOMAIN_EVENT" as const,
      type: "domain.goal.progress_updated",
      aggregateId: "goal_carol",
      aggregateType: "goal" as const,
      aggregateVersion: 3,
      eventOrdinal: 2,
      causalSequence: 3002,
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      correlationId: "corr_b",
      source: "kernel",
      payload: { goalId: "goal_carol", deliverableProgressPercent: 90 },
    };

    // Event A: causalSequence 3001 (e.g. 50% progress)
    const eventA = {
      eventId: "evt_goal_gc_v3_1_progress",
      userId,
      category: "DOMAIN_EVENT" as const,
      type: "domain.goal.progress_updated",
      aggregateId: "goal_carol",
      aggregateType: "goal" as const,
      aggregateVersion: 3,
      eventOrdinal: 1,
      causalSequence: 3001,
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      correlationId: "corr_a",
      source: "kernel",
      payload: { goalId: "goal_carol", deliverableProgressPercent: 50 },
    };

    // Dispatch Event B FIRST
    const resB = await registry.dispatch(eventB as any, 1);
    assert.equal(resB.success, true);
    const statsAfterB = await mockGoalStats.findOne({ goalId: "goal_carol" });
    assert.equal(statsAfterB.deliverableProgressPercent, 90);

    // Dispatch Event A LATER
    const resA = await registry.dispatch(eventA as any, 1);
    assert.equal(resA.success, true);
    const statsAfterA = await mockGoalStats.findOne({ goalId: "goal_carol" });
    assert.equal(statsAfterA.deliverableProgressPercent, 90, "Progress must NOT regress to 50%");

    // Verify ledger marked Event A as SKIPPED_STALE
    const ledgerA = await mockLedger.findOne({
      ledgerKey: `${userId}:GoalIntelligenceConsumer:${eventA.eventId}`,
    });
    assert.equal(ledgerA.status, "SKIPPED_STALE");
  });

  it("E2E-04 (Correction A): Sweeper accurately distinguishes uncommitted vs indeterminate intents", async () => {
    const pastDate = new Date(Date.now() - 10000);

    // Intent 1: Uncommitted (aggregate still at version 1, epoch 0) -> Mark ABORTED via epoch burn
    await mockTasks.create({
      _id: "task_uncommitted",
      userId: "usr_alice",
      version: 1,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    await mockOutbox.create({
      _id: "evt_stalled_uncommitted",
      eventId: "evt_task_t_uncomm_v2_1",
      userId: "usr_alice",
      aggregateId: "task_uncommitted",
      aggregateType: "task",
      deliveryStatus: "PENDING_COMMIT",
      recordedAt: pastDate,
      mutationIntent: {
        clientMutationId: "mut_never_applied",
        expectedVersion: 1,
        fencingEpoch: 0,
        diffHash: "hash_uncomm",
      },
    });

    // Intent 2: Indeterminate (aggregate version advanced from 1 to 4, receipt missing from ring buffer) -> DEAD_LETTER
    await mockTasks.create({
      _id: "task_indeterminate",
      userId: "usr_alice",
      version: 4, // Advanced past expectedVersion 1
      mutationEpoch: 0,
      recentMutationReceipts: [], // Empty/rotated
    });

    await mockOutbox.create({
      _id: "evt_stalled_indeterminate",
      eventId: "evt_task_t_indet_v2_1",
      userId: "usr_alice",
      aggregateId: "task_indeterminate",
      aggregateType: "task",
      deliveryStatus: "PENDING_COMMIT",
      recordedAt: pastDate,
      mutationIntent: {
        clientMutationId: "mut_indeterminate_outcome",
        expectedVersion: 1,
        fencingEpoch: 0,
        diffHash: "hash_indet",
      },
    });

    const sweeperResult = await storageService.reconcilePendingIntents({
      gracePeriodMs: 5000,
      aggregateModelResolver: () => mockTasks as any,
    });

    assert.equal(sweeperResult.scannedCount, 2);
    assert.equal(sweeperResult.abortedCount, 1, "Uncommitted intent must be ABORTED via atomic epoch burn");
    assert.equal(sweeperResult.quarantinedCount, 1, "Indeterminate intent must be quarantined to DEAD_LETTER");

    const abortedEvent = await mockOutbox.findById("evt_stalled_uncommitted");
    assert.equal(abortedEvent.deliveryStatus, "ABORTED");

    const quarantinedEvent = await mockOutbox.findById("evt_stalled_indeterminate");
    assert.equal(quarantinedEvent.deliveryStatus, "DEAD_LETTER");
    assert.match(quarantinedEvent.failureReason, /STANDALONE_INTENT_OUTCOME_INDETERMINATE/);
  });
});
