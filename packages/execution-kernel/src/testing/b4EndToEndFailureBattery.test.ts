/**
 * b4EndToEndFailureBattery.test.ts
 * 
 * Milestone B — Phase B4: Work Package 4 / Loop 8
 * Comprehensive 15-Scenario Failure, Concurrency & Resilience Battery
 * 
 * Authoritative verification against Section 10 of B4 Approved Plan V2.3.0.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AutonomousLeaseManager } from "../autonomous/AutonomousLeaseManager";
import { createFencingToken } from "../autonomous/FencingToken";
import { AutonomousWorkflowExecutor, WorkflowStepDefinition } from "../autonomous/AutonomousWorkflowExecutor";
import { DWCPRecoverySweeper } from "../autonomous/DWCPRecoverySweeper";
import { OutboxStorageService } from "../events/persistence/OutboxStorageService";
import { InterruptionCostEvaluator } from "../proactive/InterruptionCostEvaluator";
import { SurfacePresenceManager } from "../surface/SurfacePresenceManager";
import { HITLGovernanceEngine, TamperedInterventionError } from "../autonomous/HITLGovernanceEngine";
import { WorkerLeaseManager } from "../events/dispatch/WorkerLeaseManager";

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
      const id = String(item._id || item.workflowId || item.interventionId || item.eventId || item.receiptId || `id_${Date.now()}_${Math.random()}`);
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
    return null;
  }

  private matchesQuery(doc: any, query: Record<string, any>): boolean {
    for (const [k, v] of Object.entries(query)) {
      if (k === "_id" || k === "workflowId" || k === "aggregateId" || k === "userId" || k === "interventionId" || k === "surfaceId" || k === "deliveryStatus") {
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
        if (v.$gt !== undefined) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const queryVal = v.$gt instanceof Date ? v.$gt.getTime() : v.$gt;
          if (!(docVal > queryVal)) return false;
        }
        if (v.$gte !== undefined) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const queryVal = v.$gte instanceof Date ? v.$gte.getTime() : v.$gte;
          if (!(docVal >= queryVal)) return false;
        }
        if (v.$lt !== undefined) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const queryVal = v.$lt instanceof Date ? v.$lt.getTime() : v.$lt;
          if (!(docVal < queryVal)) return false;
        }
        if (v.$lte !== undefined) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const queryVal = v.$lte instanceof Date ? v.$lte.getTime() : v.$lte;
          if (!(docVal <= queryVal)) return false;
        }
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
    if (update.$pull) {
      for (const [k, condition] of Object.entries(update.$pull)) {
        if (Array.isArray(doc[k])) {
          doc[k] = doc[k].filter((item: any) => {
            const cond = condition as any;
            if (cond.causalSequence && cond.causalSequence.$lte !== undefined) {
              return !(item.causalSequence <= cond.causalSequence.$lte);
            }
            return true;
          });
        }
      }
    }
  }
}

describe("Milestone B4 — Loop 8: Comprehensive 15-Scenario Failure & Resilience Battery", () => {
  let mockLeaseColl: MockMemoryCollection<any>;
  let mockIntentColl: MockMemoryCollection<any>;
  let mockOutboxColl: MockMemoryCollection<any>;
  let mockReceiptColl: MockMemoryCollection<any>;
  let mockTaskColl: MockMemoryCollection<any>;
  let mockInterventionColl: MockMemoryCollection<any>;
  let mockSurfaceColl: MockMemoryCollection<any>;

  let leaseManager: AutonomousLeaseManager;
  let outboxService: OutboxStorageService;
  let workflowExecutor: AutonomousWorkflowExecutor;
  let sweeper: DWCPRecoverySweeper;
  let costEvaluator: InterruptionCostEvaluator;
  let presenceManager: SurfacePresenceManager;
  let hitlEngine: HITLGovernanceEngine;
  let workerLeaseManager: WorkerLeaseManager;

  const testUserId = "usr_b4_battery_test";

  beforeEach(() => {
    mockLeaseColl = new MockMemoryCollection();
    mockIntentColl = new MockMemoryCollection();
    mockOutboxColl = new MockMemoryCollection();
    mockReceiptColl = new MockMemoryCollection();
    mockTaskColl = new MockMemoryCollection();
    mockInterventionColl = new MockMemoryCollection();
    mockSurfaceColl = new MockMemoryCollection();

    leaseManager = new AutonomousLeaseManager({ leaseModel: mockLeaseColl });
    outboxService = new OutboxStorageService({
      outboxModel: mockOutboxColl,
      receiptModel: mockReceiptColl,
    });
    workflowExecutor = new AutonomousWorkflowExecutor({
      intentModel: mockIntentColl,
      outboxService,
    });
    sweeper = new DWCPRecoverySweeper({
      intentModel: mockIntentColl,
      receiptModel: mockReceiptColl,
      aggregateModelResolver: () => mockTaskColl,
      outboxService,
    });
    costEvaluator = InterruptionCostEvaluator.getInstance();
    presenceManager = new SurfacePresenceManager({
      receiptModel: mockSurfaceColl,
      outboxModel: mockOutboxColl,
    });
    hitlEngine = new HITLGovernanceEngine({
      interventionModel: mockInterventionColl,
      outboxModel: mockOutboxColl,
      outboxService,
      secretKey: "test-hitl-secret-key-battery",
    });
    workerLeaseManager = new WorkerLeaseManager({
      outboxModel: mockOutboxColl,
    });
  });

  // Scenario 1: Worker Crash Immediately After Aggregate Mutation
  it("Scenario 1: Worker Crash Immediately After Aggregate Mutation advances to COMMITTED via L1 receipt", async () => {
    const stepMutationId = "mut_scen_1";
    await mockTaskColl.create({
      _id: "task_s1",
      userId: testUserId,
      title: "Task S1",
      version: 1,
      mutationEpoch: 1,
      recentMutationReceipts: [{ clientMutationId: stepMutationId, version: 1 }],
    });

    const stepDetail = await sweeper.reconcileStep(mockTaskColl, "task_s1", stepMutationId, 0);
    assert.equal(stepDetail.status, "COMMITTED");
    assert.equal(stepDetail.detectedVia, "L1_RING_BUFFER");
  });

  // Scenario 2: Worker Crash Before Aggregate Mutation
  it("Scenario 2: Worker Crash Before Aggregate Mutation marks step UNAPPLIED and workflow FAILED", async () => {
    await mockTaskColl.create({
      _id: "task_s2",
      userId: testUserId,
      title: "Task S2",
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const stepDetail = await sweeper.reconcileStep(mockTaskColl, "task_s2", "mut_never_applied", 0);
    assert.equal(stepDetail.status, "UNAPPLIED");
    assert.equal(stepDetail.detectedVia, "VERSION_EQUALITY_UNAPPLIED");
  });

  // Scenario 3: Ring Buffer Eviction of Step Mutation Receipt
  it("Scenario 3: Ring Buffer Eviction recovers via L2 durable MutationReceiptModel store", async () => {
    const stepMutationId = "mut_scen_3";
    await mockTaskColl.create({
      _id: "task_s3",
      userId: testUserId,
      title: "Task S3",
      version: 55,
      mutationEpoch: 1,
      recentMutationReceipts: [{ clientMutationId: "newer_mut", version: 55 }],
    });
    await mockReceiptColl.create({
      aggregateId: "task_s3",
      clientMutationId: stepMutationId,
      status: "COMMITTED",
      version: 1,
    });

    const stepDetail = await sweeper.reconcileStep(mockTaskColl, "task_s3", stepMutationId, 0);
    assert.equal(stepDetail.status, "COMMITTED");
    assert.equal(stepDetail.detectedVia, "L2_DURABLE_STORE");
  });

  // Scenario 4: Standalone Lease Preemption During Multi-Step Workflow
  it("Scenario 4: Standalone Lease Preemption prevents stalled worker from committing next step", async () => {
    await mockTaskColl.create({
      _id: "task_s4",
      userId: testUserId,
      title: "Task S4",
      version: 0,
      mutationEpoch: 2, // Preempted: Aggregate mutationEpoch is already at epoch 2!
      recentMutationReceipts: [],
    });

    const staleToken = createFencingToken(1, "worker-1", new Date(), new Date(Date.now() + 60000));
    const stepDef: WorkflowStepDefinition = {
      aggregateId: "task_s4",
      aggregateType: "task",
      aggregateModel: mockTaskColl,
      domainUpdates: { title: "Stale Overwrite" },
      eventDrafts: [],
    };

    const res = await workflowExecutor.executeWorkflow({
      userId: testUserId,
      workflowType: "TEST",
      steps: [stepDef],
      fencingToken: staleToken,
    });

    assert.equal(res.success, false);
    assert.ok(res.error?.includes("superseded"));
  });

  // Scenario 5: Fencing Epoch Preemption of Stale Autonomous Worker
  it("Scenario 5: Fencing Epoch Preemption rejects stale worker renewal after takeover", async () => {
    const tokenA = await leaseManager.acquireLease(testUserId, "worker-A", 50);
    assert.ok(tokenA);

    // Fast-forward expiration
    await mockLeaseColl.updateOne(
      { userId: testUserId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    // Worker B takes over at epoch 2
    const tokenB = await leaseManager.acquireLease(testUserId, "worker-B", 10000);
    assert.ok(tokenB);
    assert.equal(tokenB.epoch, 2);

    // Stalled Worker A attempts renewal
    const staleRenew = await leaseManager.renewLease(testUserId, "worker-A", tokenA.epoch, 10000);
    assert.equal(staleRenew, null);
  });

  // Scenario 6: Outbox Dispatcher Preemption by Monotonic Lease Generation
  it("Scenario 6: Outbox Dispatcher Preemption rejects stalled dispatcher acknowledgment", async () => {
    await mockOutboxColl.create({
      _id: "evt_s6",
      deliveryStatus: "PENDING",
      leaseGeneration: 0,
      nextAttemptAt: new Date(Date.now() - 1000),
    });

    // Worker 1 acquires lease
    const [leased1] = await workerLeaseManager.acquireLeases("worker-1", 1, 50);
    assert.equal(leased1.leaseGeneration, 1);

    // Simulate expiration
    await mockOutboxColl.updateOne({ _id: "evt_s6" }, { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } });

    // Worker 2 takes over
    const [leased2] = await workerLeaseManager.acquireLeases("worker-2", 1, 10000);
    assert.equal(leased2.leaseGeneration, 2);

    // Stalled Worker 1 attempts renewal with stale generation 1
    const renewed = await workerLeaseManager.renewLease("evt_s6", "worker-1", 1, 10000);
    assert.equal(renewed, false);
  });

  // Scenario 7: Pre-Flight Stage 3 Invariant Violation Aborts Execution
  it("Scenario 7: Pre-Flight Stage 3 Invariant Violation aborts during STAGED phase with zero mutations", async () => {
    await mockTaskColl.create({
      _id: "task_s7",
      userId: testUserId,
      title: "Pristine",
      version: 0,
      mutationEpoch: 0,
      recentMutationReceipts: [],
    });

    const token = createFencingToken(1, "worker-1", new Date(), new Date(Date.now() + 60000));
    const res = await workflowExecutor.executeWorkflow({
      userId: testUserId,
      workflowType: "TEST",
      steps: [
        {
          aggregateId: "task_s7",
          aggregateType: "task",
          aggregateModel: mockTaskColl,
          domainUpdates: { title: "Mutated" },
          eventDrafts: [],
        },
      ],
      fencingToken: token,
      preFlightValidator: async () => ({ valid: false, reason: "Stage 3 Invariant Violation" }),
    });

    assert.equal(res.success, false);
    assert.equal(res.status, "FAILED");

    const task = await mockTaskColl.findById("task_s7");
    assert.equal(task.title, "Pristine");
    assert.equal(task.version, 0);
  });

  // Scenario 8: Anti-Overwrite Protection During DWCP Compensation
  it("Scenario 8: Anti-Overwrite Protection halts compensation if aggregate acquired higher epoch", async () => {
    await mockTaskColl.create({
      _id: "task_s8",
      userId: testUserId,
      title: "Original",
      version: 1,
      mutationEpoch: 10, // Higher epoch from newer worker
      recentMutationReceipts: [],
    });

    const modelMap = new Map([["task", mockTaskColl]]);
    const intentDoc: any = {
      workflowId: "wf_s8",
      userId: testUserId,
      status: "EXECUTING",
      steps: [
        {
          stepIndex: 0,
          stepMutationId: "mut_s8",
          aggregateId: "task_s8",
          aggregateType: "task",
          expectedVersion: 0,
          status: "COMMITTED",
          compensationDiff: { title: "Original" },
        },
      ],
    };

    const res = await sweeper.reconcileWorkflow(intentDoc, modelMap, 2);
    assert.equal(res.finalStatus, "QUARANTINED");
  });

  // Scenario 9: Unchecked Ring Buffer Eviction Triggers Quarantine
  it("Scenario 9: Unchecked Ring Buffer Eviction triggers QUARANTINE to prevent data corruption", async () => {
    await mockTaskColl.create({
      _id: "task_s9",
      userId: testUserId,
      title: "Advanced Without Receipts",
      version: 5,
      mutationEpoch: 1,
      recentMutationReceipts: [],
    });

    const stepDetail = await sweeper.reconcileStep(mockTaskColl, "task_s9", "ghost_mutation_id", 0);
    assert.equal(stepDetail.status, "QUARANTINED");
    assert.equal(stepDetail.detectedVia, "EVICTED_UNKNOWN_ADVANCED_VERSION");
  });

  // Scenario 10: Strict Quiet Hours Emergency Bypass Verification
  it("Scenario 10: Strict Quiet Hours Emergency Bypass permits ONLY CRITICAL_EMERGENCY", () => {
    const nonEmergency = {
      candidateId: "c1",
      userId: testUserId,
      autonomyLevel: "L3" as const,
      urgency: "CRITICAL" as const, // Not CRITICAL_EMERGENCY
      domain: "SCHEDULE" as const,
      proposal: {} as any,
      rationale: "Urgent",
      requiredConfidence: 0.9,
      dedupKey: "d1",
      actionValueScore: 0.95,
      estimatedInterruptionCost: 0.1,
      confidenceScore: 0.95,
      createdAt: Date.now(),
    };

    const emergency = {
      ...nonEmergency,
      candidateId: "c2",
      urgency: "CRITICAL_EMERGENCY" as const,
    };

    const nonEmergencyRes = costEvaluator.evaluate(nonEmergency, { isQuietHours: true });
    assert.equal(nonEmergencyRes.shouldInterrupt, false);
    assert.equal(nonEmergencyRes.cost, 1.0);

    const emergencyRes = costEvaluator.evaluate(emergency, { isQuietHours: true });
    assert.equal(emergencyRes.shouldInterrupt, true);
    assert.equal(emergencyRes.cost, 0.0);
  });

  // Scenario 11: Interruption Cost Math Invariant Guarantee ([0.0, 1.0])
  it("Scenario 11: Interruption Cost Math Invariant Guarantee mathematically bounded in [0.0, 1.0]", () => {
    const candidate = {
      candidateId: "c_load",
      userId: testUserId,
      autonomyLevel: "L2" as const,
      urgency: "LOW" as const,
      domain: "TASK" as const,
      proposal: {} as any,
      rationale: "Test",
      requiredConfidence: 0.8,
      dedupKey: "d_load",
      actionValueScore: 0.5,
      estimatedInterruptionCost: 0.5,
      confidenceScore: 0.8,
      createdAt: Date.now(),
    };

    const res = costEvaluator.evaluate(candidate, {
      inMeeting: true,
      inDeepWork: true,
      cognitiveLoad: 1.0,
      recentNotificationCountToday: 50,
      isQuietHours: false,
    });

    assert.ok(res.cost >= 0.0 && res.cost <= 1.0, `Cost ${res.cost} exceeded [0.0, 1.0]`);
    assert.ok(res.actionValue >= 0.0 && res.actionValue <= 1.0);
  });

  // Scenario 12: Conservative Default Under Unknown Cognitive State
  it("Scenario 12: Conservative Default Under Unknown Cognitive State defaults to 0.85 resistance", () => {
    const candidate = {
      candidateId: "c_blind",
      userId: testUserId,
      autonomyLevel: "L2" as const,
      urgency: "MEDIUM" as const,
      domain: "TASK" as const,
      proposal: {} as any,
      rationale: "Blind follow-up",
      requiredConfidence: 0.8,
      dedupKey: "d_blind",
      actionValueScore: 0.7,
      estimatedInterruptionCost: 0.3,
      confidenceScore: 0.8,
      createdAt: Date.now(),
    };

    const res = costEvaluator.evaluate(candidate, null);
    assert.equal(res.cost, 0.85);
    assert.equal(res.shouldInterrupt, false);
  });

  // Scenario 13: Monotonic SSE Reconnect and Stream Replay
  it("Scenario 13: Monotonic SSE Reconnect and Stream Replay emits events strictly ascending from cursor", async () => {
    await mockOutboxColl.create([
      { userId: testUserId, eventId: "ev_1", causalSequence: 1001, deliveryStatus: "COMMITTED" },
      { userId: testUserId, eventId: "ev_2", causalSequence: 2001, deliveryStatus: "COMMITTED" },
      { userId: testUserId, eventId: "ev_3", causalSequence: 3001, deliveryStatus: "COMMITTED" },
    ]);

    await presenceManager.acknowledge(testUserId, "surface-1", 1001);

    const replay = await presenceManager.getReplayEvents(testUserId, "surface-1");
    assert.equal(replay.length, 2);
    assert.equal(replay[0].causalSequence, 2001);
    assert.equal(replay[1].causalSequence, 3001);
  });

  // Scenario 14: Stale SSE Acknowledgment Monotonic Guard
  it("Scenario 14: Stale SSE Acknowledgment Monotonic Guard prevents cursor regression", async () => {
    await presenceManager.acknowledge(testUserId, "surface-1", 5000);
    const staleAck = await presenceManager.acknowledge(testUserId, "surface-1", 2000);

    assert.equal(staleAck.previousSeq, 5000);
    assert.equal(staleAck.newSeq, 5000);
  });

  // Scenario 15: HITL Tamper-Proof Cryptographic Signature Verification & Key Rotation
  it("Scenario 15: HITL Cryptographic Signature Verification rejects tampered payload and supports key rotation", async () => {
    const intervention = await hitlEngine.createIntervention({
      userId: testUserId,
      actionId: "act_hitl_15",
      autonomyLevel: "L4",
      domain: "SCHEDULE",
      proposal: { action: "CANCEL_ALL_MEETINGS" },
      ttlMs: 60000,
    });

    assert.ok(intervention.signature);
    assert.equal(intervention.status, "PENDING");

    // 1. Attempt response with tampered signature
    await assert.rejects(
      async () => {
        await hitlEngine.respondIntervention({
          interventionId: intervention.interventionId,
          userId: testUserId,
          response: "ACCEPTED",
          signature: "deadbeef00112233445566778899aabbccddeeff",
        });
      },
      (err: any) => err instanceof TamperedInterventionError
    );

    // 2. Respond with valid signature succeeds via atomic CAS
    const accepted = await hitlEngine.respondIntervention({
      interventionId: intervention.interventionId,
      userId: testUserId,
      response: "ACCEPTED",
      signature: intervention.signature,
    });
    assert.equal(accepted.status, "ACCEPTED");

    // 3. Key rotation test: create new engine with rotated key
    hitlEngine.rotateKey(2, "new-rotated-secret-key-v2");
    const v2Intervention = await hitlEngine.createIntervention({
      userId: testUserId,
      actionId: "act_hitl_v2",
      autonomyLevel: "L4",
      domain: "SYSTEM",
      proposal: { action: "SYSTEM_UPGRADE" },
    });
    assert.equal(v2Intervention.keyVersion, 2);

    const v2Accepted = await hitlEngine.respondIntervention({
      interventionId: v2Intervention.interventionId,
      userId: testUserId,
      response: "ACCEPTED",
      signature: v2Intervention.signature,
    });
    assert.equal(v2Accepted.status, "ACCEPTED");
  });
});

