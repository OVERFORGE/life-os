import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AutonomousWorkflowExecutor, WorkflowStepDefinition } from "../autonomous/AutonomousWorkflowExecutor";
import { DWCPRecoverySweeper } from "../autonomous/DWCPRecoverySweeper";
import { OutboxStorageService } from "../events/persistence/OutboxStorageService";
import { createFencingToken } from "../autonomous/FencingToken";

class MockMemoryCollection<T extends Record<string, any>> {
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
          then: (res: any, rej: any) => Promise.resolve(cloned).then(res, rej),
        };
      }
    }
    return null;
  }

  findById(id: string): any {
    const doc = this.docs.get(String(id));
    const cloned = doc ? JSON.parse(JSON.stringify(doc)) : null;
    return {
      ...cloned,
      lean: () => Promise.resolve(cloned),
      then: (resolve: any, reject: any) => Promise.resolve(cloned).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(cloned).catch(reject),
    };
  }

  async create(docs: any | any[], _opts?: any): Promise<any[]> {
    const arr = Array.isArray(docs) ? docs : [docs];
    const created = arr.map((item) => {
      const id = String(item._id || item.workflowId || item.eventId || item.receiptId || `id_${Date.now()}_${Math.random()}`);
      const doc = { _id: id, ...item };
      this.docs.set(id, doc);
      return JSON.parse(JSON.stringify(doc));
    });
    return created;
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

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, _opts?: any): Promise<any> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return JSON.parse(JSON.stringify(doc));
      }
    }
    const newDoc: any = { _id: filter._id || filter.receiptId || `id_${Date.now()}` };
    if (update.$setOnInsert) Object.assign(newDoc, update.$setOnInsert);
    if (update.$set) Object.assign(newDoc, update.$set);
    this.docs.set(String(newDoc._id), newDoc);
    return JSON.parse(JSON.stringify(newDoc));
  }

  private matchesQuery(doc: any, query: Record<string, any>): boolean {
    for (const [k, v] of Object.entries(query)) {
      if (k === "_id" || k === "workflowId" || k === "aggregateId" || k === "userId") {
        if (v && typeof v === "object" && "$in" in v) {
          const inArr = (v.$in as any[]).map(String);
          if (!inArr.includes(String(doc[k]))) return false;
        } else if (String(doc[k]) !== String(v)) {
          return false;
        }
        continue;
      }
      if (k === "$or" && Array.isArray(v)) {
        const matchesAny = v.some((subQ) => this.matchesQuery(doc, subQ));
        if (!matchesAny) return false;
        continue;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (v.$in && !v.$in.includes(doc[k])) return false;
        if (v.$gt !== undefined && !(doc[k] > v.$gt)) return false;
        if (v.$gte !== undefined && !(doc[k] >= v.$gte)) return false;
        if (v.$lt !== undefined && !(doc[k] < v.$lt)) return false;
        if (v.$lte !== undefined && !(doc[k] <= v.$lte)) return false;
        if (v.$ne !== undefined && doc[k] === v.$ne) return false;
        continue;
      }
      if (doc[k] !== v) return false;
    }
    return true;
  }

  private applyUpdate(doc: any, update: Record<string, any>): void {
    if (update.$set) {
      for (const [k, setVal] of Object.entries(update.$set)) {
        if (k.includes(".")) {
          // Handle nested paths like "steps.$.status" or simple nested properties
          const parts = k.split(".");
          let target = doc;
          for (let i = 0; i < parts.length - 1; i++) {
            if (parts[i] === "$") continue;
            if (!target[parts[i]]) target[parts[i]] = {};
            target = target[parts[i]];
          }
          target[parts[parts.length - 1]] = setVal;
        } else {
          doc[k] = setVal;
        }
      }
    }
    if (update.$inc) {
      for (const [k, incVal] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] || 0) + (incVal as number);
      }
    }
    if (update.$push) {
      for (const [k, pushVal] of Object.entries(update.$push)) {
        if (!doc[k]) doc[k] = [];
        const pv = pushVal as any;
        if (pv && typeof pv === "object" && pv.$each) {
          doc[k].push(...pv.$each);
          if (pv.$slice && pv.$slice < 0) {
            doc[k] = doc[k].slice(pv.$slice);
          }
        } else {
          doc[k].push(pushVal);
        }
      }
    }
  }
}

describe("Milestone B4 — Loop 6: Autonomous Workflow Execution & DWCP", () => {
  let mockIntentColl: MockMemoryCollection<any>;
  let mockOutboxColl: MockMemoryCollection<any>;
  let mockReceiptColl: MockMemoryCollection<any>;
  let mockTaskColl: MockMemoryCollection<any>;
  let outboxService: OutboxStorageService;
  let executor: AutonomousWorkflowExecutor;
  let sweeper: DWCPRecoverySweeper;
  const testUserId = "usr_b4_dwcp_test";

  beforeEach(() => {
    mockIntentColl = new MockMemoryCollection();
    mockOutboxColl = new MockMemoryCollection();
    mockReceiptColl = new MockMemoryCollection();
    mockTaskColl = new MockMemoryCollection();

    outboxService = new OutboxStorageService({
      outboxModel: mockOutboxColl,
      receiptModel: mockReceiptColl,
    });

    executor = new AutonomousWorkflowExecutor({
      intentModel: mockIntentColl,
      outboxService,
    });

    sweeper = new DWCPRecoverySweeper({
      intentModel: mockIntentColl,
      receiptModel: mockReceiptColl,
      aggregateModelResolver: () => mockTaskColl,
      outboxService,
    });
  });

  it("Test A: Single-step success records L1 ring buffer and L2 durable receipts", async () => {
    await mockTaskColl.create({
      _id: "task_101",
      userId: testUserId,
      title: "Initial Task",
      priority: "medium",
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const token = createFencingToken(1, "worker-1", new Date(), new Date(Date.now() + 60000));
    const stepDef: WorkflowStepDefinition = {
      aggregateId: "task_101",
      aggregateType: "task",
      aggregateModel: mockTaskColl,
      domainUpdates: { priority: "high" },
      eventDrafts: [
        {
          userId: testUserId,
          category: "DOMAIN_EVENT",
          type: "domain.task.updated",
          aggregateId: "task_101",
          aggregateType: "task",
          aggregateVersion: 1,
          source: "kernel.workflow",
          payload: { priority: "high" },
          occurredAt: new Date(),
        },
      ],
    };

    const res = await executor.executeWorkflow({
      userId: testUserId,
      workflowType: "PRIORITY_ESCALATION",
      steps: [stepDef],
      fencingToken: token,
    });

    console.log("TEST A RESULT:", res);

    assert.equal(res.success, true);
    assert.equal(res.status, "COMMITTED");
    assert.equal(res.committedSteps, 1);

    // Verify L1 ring buffer
    const task = await mockTaskColl.findById("task_101");
    assert.equal(task.priority, "high");
    assert.equal(task.version, 1);
    assert.equal(task.recentMutationReceipts.length, 1);
    const receiptId = task.recentMutationReceipts[0].clientMutationId;

    // Verify L2 durable store
    const l2Receipt = await mockReceiptColl.findOne({ aggregateId: "task_101", clientMutationId: receiptId });
    assert.ok(l2Receipt);
    assert.equal(l2Receipt.status, "COMMITTED");
  });

  it("Test B: Multi-step sequential execution to full COMMIT", async () => {
    await mockTaskColl.create({
      _id: "task_201",
      userId: testUserId,
      title: "Task 1",
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });
    await mockTaskColl.create({
      _id: "task_202",
      userId: testUserId,
      title: "Task 2",
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const token = createFencingToken(1, "worker-1", new Date(), new Date(Date.now() + 60000));
    const steps: WorkflowStepDefinition[] = [
      {
        aggregateId: "task_201",
        aggregateType: "task",
        aggregateModel: mockTaskColl,
        domainUpdates: { title: "Task 1 Updated" },
        eventDrafts: [],
      },
      {
        aggregateId: "task_202",
        aggregateType: "task",
        aggregateModel: mockTaskColl,
        domainUpdates: { title: "Task 2 Updated" },
        eventDrafts: [],
      },
    ];

    const res = await executor.executeWorkflow({
      userId: testUserId,
      workflowType: "BATCH_UPDATE",
      steps,
      fencingToken: token,
    });

    assert.equal(res.success, true);
    assert.equal(res.status, "COMMITTED");
    assert.equal(res.committedSteps, 2);

    const t1 = await mockTaskColl.findById("task_201");
    const t2 = await mockTaskColl.findById("task_202");
    assert.equal(t1.title, "Task 1 Updated");
    assert.equal(t2.title, "Task 2 Updated");
  });

  it("Test C: Worker crash between aggregate commit and intent update recovers via L1 receipt", async () => {
    const stepMutationId = "mut_step_crash_c";
    await mockTaskColl.create({
      _id: "task_301",
      userId: testUserId,
      title: "Task 301",
      version: 1,
      mutationEpoch: 1,
      recentMutationReceipts: [
        { clientMutationId: stepMutationId, receiptId: stepMutationId, version: 1, appliedAt: new Date() },
      ],
    });

    const stepDetail = await sweeper.reconcileStep(mockTaskColl, "task_301", stepMutationId, 0);
    assert.equal(stepDetail.status, "COMMITTED");
    assert.equal(stepDetail.detectedVia, "L1_RING_BUFFER");
  });

  it("Test D: Worker crash before aggregate commit sees UNAPPLIED", async () => {
    await mockTaskColl.create({
      _id: "task_401",
      userId: testUserId,
      title: "Unmodified Task",
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const stepDetail = await sweeper.reconcileStep(mockTaskColl, "task_401", "unapplied_mut_id", 0);
    assert.equal(stepDetail.status, "UNAPPLIED");
    assert.equal(stepDetail.detectedVia, "VERSION_EQUALITY_UNAPPLIED");
  });

  it("Test E: Ring buffer eviction recovery via L2 durable receipt", async () => {
    const stepMutationId = "mut_evicted_from_ring";
    // Aggregate has version 51, and ring buffer has evicted the original receipt
    await mockTaskColl.create({
      _id: "task_501",
      userId: testUserId,
      title: "Heavily Mutated Task",
      version: 51,
      mutationEpoch: 1,
      recentMutationReceipts: [{ clientMutationId: "newer_mut_51", version: 51 }],
    });

    // But L2 durable store still holds it
    await mockReceiptColl.create({
      aggregateId: "task_501",
      clientMutationId: stepMutationId,
      status: "COMMITTED",
      version: 1,
    });

    const stepDetail = await sweeper.reconcileStep(mockTaskColl, "task_501", stepMutationId, 0);
    assert.equal(stepDetail.status, "COMMITTED");
    assert.equal(stepDetail.detectedVia, "L2_DURABLE_STORE");
  });

  it("Test F: Ring buffer eviction with aggregate advanced version triggers QUARANTINE", async () => {
    // Aggregate has version 10, but receipt is in NEITHER L1 ring buffer nor L2 durable store
    await mockTaskColl.create({
      _id: "task_601",
      userId: testUserId,
      title: "Task With Mystery Advance",
      version: 10,
      mutationEpoch: 1,
      recentMutationReceipts: [],
    });

    const stepDetail = await sweeper.reconcileStep(mockTaskColl, "task_601", "missing_everywhere_id", 0);
    assert.equal(stepDetail.status, "QUARANTINED");
    assert.equal(stepDetail.detectedVia, "EVICTED_UNKNOWN_ADVANCED_VERSION");
    assert.ok(stepDetail.reason?.includes("Potential eviction anomaly"));
  });

  it("Test G: Anti-overwrite CAS prevents compensation from clobbering newer mutations", async () => {
    await mockTaskColl.create({
      _id: "task_701",
      userId: testUserId,
      title: "Original Title",
      version: 1,
      mutationEpoch: 5, // Aggregate was taken over by worker with epoch 5
      recentMutationReceipts: [],
    });

    const modelMap = new Map([["task", mockTaskColl]]);
    const intentDoc: any = {
      workflowId: "wf_stale_comp",
      userId: testUserId,
      status: "EXECUTING",
      steps: [
        {
          stepIndex: 0,
          stepMutationId: "step_mut_701",
          aggregateId: "task_701",
          aggregateType: "task",
          expectedVersion: 0,
          status: "COMMITTED",
          compensationDiff: { title: "Original Title" },
        },
      ],
    };

    // Stale recovery worker with epoch 2 attempts compensation
    const res = await sweeper.reconcileWorkflow(intentDoc, modelMap, 2);
    // Anti-overwrite protection triggers quarantine
    assert.equal(res.finalStatus, "QUARANTINED");
  });

  it("Test H: Fencing epoch prevents stale worker recovery from executing", async () => {
    await mockTaskColl.create({
      _id: "task_801",
      userId: testUserId,
      title: "Task 801",
      version: 1,
      mutationEpoch: 10,
      recentMutationReceipts: [],
    });

    const staleToken = createFencingToken(2, "stale-worker", new Date(), new Date(Date.now() + 60000));
    const stepDef: WorkflowStepDefinition = {
      aggregateId: "task_801",
      aggregateType: "task",
      aggregateModel: mockTaskColl,
      domainUpdates: { title: "Stale Overwrite" },
      eventDrafts: [],
    };

    const res = await executor.executeWorkflow({
      userId: testUserId,
      workflowType: "TEST",
      steps: [stepDef],
      fencingToken: staleToken,
    });

    assert.equal(res.success, false);
    assert.ok(res.error?.includes("superseded"));
  });

  it("Test I: Concurrency conflict triggers safe step rollback and compensation", async () => {
    await mockTaskColl.create({
      _id: "task_901",
      userId: testUserId,
      title: "Task 1",
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });
    // Task 2 has version 5 (conflicting with expected 0)
    await mockTaskColl.create({
      _id: "task_902",
      userId: testUserId,
      title: "Task 2 Modified Out Of Band",
      version: 5,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const token = createFencingToken(1, "worker-1", new Date(), new Date(Date.now() + 60000));
    const steps: WorkflowStepDefinition[] = [
      {
        aggregateId: "task_901",
        aggregateType: "task",
        aggregateModel: mockTaskColl,
        domainUpdates: { title: "Task 1 New Title" },
        eventDrafts: [],
      },
      {
        aggregateId: "task_902",
        aggregateType: "task",
        aggregateModel: mockTaskColl,
        // Will throw concurrency conflict because expectedVersion will be mismatch or we fail
        domainUpdates: { title: "Task 2 New Title" },
        eventDrafts: [],
      },
    ];

    // Simulate conflict on task_902 by injecting version mismatch
    const origPersist = outboxService.persistWithStandaloneFencing.bind(outboxService);
    outboxService.persistWithStandaloneFencing = async (p: any) => {
      if (p.aggregateId === "task_902") {
        throw new Error("ConcurrencyConflictError: expectedVersion mismatch");
      }
      return origPersist(p);
    };

    const res = await executor.executeWorkflow({
      userId: testUserId,
      workflowType: "COMPENSATING_BATCH",
      steps,
      fencingToken: token,
    });

    assert.equal(res.success, false);
    assert.equal(res.status, "COMPENSATED");

    // Task 1 was reverted to original title!
    const task1 = await mockTaskColl.findById("task_901");
    assert.equal(task1.title, "Task 1");
  });

  it("Test J: Stage 3 pre-flight invariant violation aborts workflow during STAGED phase before any aggregate mutation occurs", async () => {
    await mockTaskColl.create({
      _id: "task_1001",
      userId: testUserId,
      title: "Pristine Task",
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const token = createFencingToken(1, "worker-1", new Date(), new Date(Date.now() + 60000));
    const stepDef: WorkflowStepDefinition = {
      aggregateId: "task_1001",
      aggregateType: "task",
      aggregateModel: mockTaskColl,
      domainUpdates: { title: "Mutated Title" },
      eventDrafts: [],
    };

    // Stage 3 invariant rejects the workflow before execution
    const preFlightValidator = async () => ({
      valid: false,
      reason: "Stage 3 Safety Invariant: Target scheduled window exceeds maximum daily cognitive capacity.",
    });

    const res = await executor.executeWorkflow({
      userId: testUserId,
      workflowType: "INVALID_WORKFLOW",
      steps: [stepDef],
      fencingToken: token,
      preFlightValidator,
    });

    assert.equal(res.success, false);
    assert.equal(res.status, "FAILED");
    assert.equal(res.committedSteps, 0);
    assert.ok(res.error?.includes("Stage 3 Safety Invariant"));

    // Verify aggregate was completely untouched!
    const task = await mockTaskColl.findById("task_1001");
    assert.equal(task.title, "Pristine Task");
    assert.equal(task.version, 0);
    assert.equal(task.recentMutationReceipts.length, 0);
  });
});
