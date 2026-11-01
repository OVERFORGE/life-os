/**
 * step4Loop3DwcpSweeper.test.ts
 * 
 * Step 4 Loop 3: DWCP Recovery Sweeper Daemon & Autonomous Sweeper Service
 * 
 * Verification Battery:
 * 1. Two-tier receipt verification: L1 ring buffer hit -> COMMITTED.
 * 2. Two-tier receipt verification: L1 miss, L2 durable store hit -> COMMITTED.
 * 3. Ghost version advancement: L1 & L2 miss, aggregate version > expectedVersion -> QUARANTINED.
 * 4. Definitive unapplied: L1 & L2 miss, aggregate version === expectedVersion -> UNAPPLIED.
 * 5. Full commitment resolution: All steps committed -> Workflow marked COMMITTED.
 * 6. Clean failure resolution: All steps unapplied -> Workflow marked FAILED.
 * 7. Partial commitment compensation: Step 1 committed, Step 2 unapplied -> DWCP compensation executed via OutboxStorageService -> COMPENSATED.
 * 8. Anti-overwrite TOCTOU safeguard: Epoch advancement or outbox failure during compensation -> QUARANTINED.
 * 9. DWCPRecoveryService: Exclusive partition lease acquisition (${userId}:dwcp:sweeper) and release.
 * 10. DWCPRecoveryService: Contended lease skips reconciliation cleanly.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  DWCPRecoverySweeper,
  WorkflowRecoveryStatus,
} from "../../autonomous/DWCPRecoverySweeper";
import { DWCPRecoveryService } from "../../autonomous/DWCPRecoveryService";
import { AutonomousLeaseManager } from "../../autonomous/AutonomousLeaseManager";

class MockWorkflowIntentModel {
  public intents: Map<string, any> = new Map();

  async find(query: Record<string, any>): Promise<any[]> {
    const results: any[] = [];
    for (const doc of this.intents.values()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (k === "updatedAt" && v && v.$lt) {
          if (new Date(doc.updatedAt).getTime() >= new Date(v.$lt).getTime()) {
            match = false;
            break;
          }
        } else if (doc[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) results.push(JSON.parse(JSON.stringify(doc)));
    }
    return results;
  }

  async findOne(query: Record<string, any>): Promise<any> {
    const res = await this.find(query);
    return res[0] || null;
  }

  async updateOne(filter: Record<string, any>, update: any): Promise<{ matchedCount: number; modifiedCount: number }> {
    for (const [id, doc] of this.intents.entries()) {
      let match = true;
      for (const [k, v] of Object.entries(filter)) {
        if (doc[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) {
        if (update.$set) Object.assign(doc, update.$set);
        this.intents.set(id, doc);
        return { matchedCount: 1, modifiedCount: 1 };
      }
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  setDoc(doc: any) {
    this.intents.set(doc.workflowId, JSON.parse(JSON.stringify(doc)));
  }
}

class MockMutationReceiptModel {
  public receipts: any[] = [];

  async findOne(query: Record<string, any>): Promise<any> {
    for (const r of this.receipts) {
      if (query.aggregateId && r.aggregateId !== query.aggregateId) continue;
      if (query.$or) {
        const matchesOr = query.$or.some((clause: any) => {
          for (const [k, v] of Object.entries(clause)) {
            if (r[k] === v) return true;
          }
          return false;
        });
        if (matchesOr) return JSON.parse(JSON.stringify(r));
      } else {
        let match = true;
        for (const [k, v] of Object.entries(query)) {
          if (r[k] !== v) match = false;
        }
        if (match) return JSON.parse(JSON.stringify(r));
      }
    }
    return null;
  }
}

class MockAggregateModel {
  public docs: Map<string, any> = new Map();

  async findById(id: string): Promise<any> {
    const doc = this.docs.get(id);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  setDoc(id: string, doc: any) {
    this.docs.set(id, JSON.parse(JSON.stringify(doc)));
  }
}

class MockOutboxService {
  public persistedCalls: any[] = [];
  public shouldFail: boolean = false;

  async persistWithStandaloneFencing(params: any): Promise<any> {
    if (this.shouldFail) {
      throw new Error("Simulated Outbox persist error");
    }
    this.persistedCalls.push(params);
    return { success: true };
  }
}

class MockLeaseModel {
  public leases: Map<string, any> = new Map();

  async findOne(query: Record<string, any>): Promise<any> {
    for (const lease of this.leases.values()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (k === "expiresAt" && v && v.$gt) {
          if (new Date(lease.expiresAt).getTime() <= new Date(v.$gt).getTime()) {
            match = false;
            break;
          }
        } else if (lease[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) return JSON.parse(JSON.stringify(lease));
    }
    return null;
  }

  async create(doc: any): Promise<any> {
    const saved = JSON.parse(JSON.stringify(doc));
    this.leases.set(doc.userId, saved);
    return saved;
  }

  async findOneAndUpdate(filter: Record<string, any>, update: any, _opts?: any): Promise<any> {
    const userId = filter.userId;
    const doc = this.leases.get(userId);
    if (!doc) return null;

    let match = true;
    if (filter.$or) {
      const orMatched = filter.$or.some((clause: any) => {
        if (clause.status && doc.status === clause.status) return true;
        if (clause.expiresAt && clause.expiresAt.$lt) {
          return new Date(doc.expiresAt).getTime() < new Date(clause.expiresAt.$lt).getTime();
        }
        return false;
      });
      if (!orMatched) match = false;
    }
    if (filter.status && doc.status !== filter.status) match = false;
    if (filter.epoch !== undefined && doc.epoch !== filter.epoch) match = false;
    if (filter.leaseHolder && doc.leaseHolder !== filter.leaseHolder) match = false;

    if (!match) return null;

    if (update.$inc) {
      for (const [field, inc] of Object.entries(update.$inc)) {
        doc[field] = (doc[field] || 0) + (inc as number);
      }
    }
    if (update.$set) {
      Object.assign(doc, update.$set);
    }
    this.leases.set(userId, doc);
    return JSON.parse(JSON.stringify(doc));
  }

  async updateOne(filter: Record<string, any>, update: any): Promise<{ matchedCount: number; modifiedCount: number }> {
    const userId = filter.userId;
    const doc = this.leases.get(userId);
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    if (filter.epoch !== undefined && doc.epoch !== filter.epoch) return { matchedCount: 0, modifiedCount: 0 };
    if (filter.leaseHolder && doc.leaseHolder !== filter.leaseHolder) return { matchedCount: 0, modifiedCount: 0 };
    if (filter.status && doc.status !== filter.status) return { matchedCount: 0, modifiedCount: 0 };

    if (update.$set) Object.assign(doc, update.$set);
    this.leases.set(userId, doc);
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

describe("Step 4 Loop 3 — DWCP Recovery Sweeper & Autonomous Sweeper Service", () => {
  let mockIntentModel: MockWorkflowIntentModel;
  let mockReceiptModel: MockMutationReceiptModel;
  let mockTaskModel: MockAggregateModel;
  let mockOutboxService: MockOutboxService;
  let sweeper: DWCPRecoverySweeper;

  beforeEach(() => {
    mockIntentModel = new MockWorkflowIntentModel();
    mockReceiptModel = new MockMutationReceiptModel();
    mockTaskModel = new MockAggregateModel();
    mockOutboxService = new MockOutboxService();

    sweeper = new DWCPRecoverySweeper({
      intentModel: mockIntentModel as any,
      receiptModel: mockReceiptModel as any,
      outboxService: mockOutboxService as any,
    });
  });

  it("1. Resolves step as COMMITTED when found in aggregate L1 ring buffer", async () => {
    mockTaskModel.setDoc("task-1", {
      _id: "task-1",
      userId: "user-1",
      version: 2,
      recentMutationReceipts: [
        { clientMutationId: "mut-step-1", version: 2 },
      ],
    });

    const res = await sweeper.reconcileStep(
      mockTaskModel,
      "task-1",
      "mut-step-1",
      1
    );

    assert.equal(res.status, "COMMITTED");
    assert.equal(res.detectedVia, "L1_RING_BUFFER");
  });

  it("2. Resolves step as COMMITTED when evicted from L1 but present in L2 MutationReceiptModel", async () => {
    mockTaskModel.setDoc("task-2", {
      _id: "task-2",
      userId: "user-1",
      version: 10,
      recentMutationReceipts: [], // Evicted from ring buffer
    });

    mockReceiptModel.receipts.push({
      aggregateId: "task-2",
      clientMutationId: "mut-step-2",
      appliedVersion: 5,
    });

    const res = await sweeper.reconcileStep(
      mockTaskModel,
      "task-2",
      "mut-step-2",
      4
    );

    assert.equal(res.status, "COMMITTED");
    assert.equal(res.detectedVia, "L2_DURABLE_STORE");
  });

  it("3. Traps in QUARANTINED when receipt missing from L1 and L2 but aggregate version advanced (Ghost Advancement)", async () => {
    mockTaskModel.setDoc("task-3", {
      _id: "task-3",
      userId: "user-1",
      version: 5, // Advanced past expectedVersion 3
      recentMutationReceipts: [], // Evicted
    });
    // No receipt in mockReceiptModel

    const res = await sweeper.reconcileStep(
      mockTaskModel,
      "task-3",
      "mut-step-ghost",
      3
    );

    assert.equal(res.status, "QUARANTINED");
    assert.equal(res.detectedVia, "EVICTED_UNKNOWN_ADVANCED_VERSION");
  });

  it("4. Resolves step as UNAPPLIED when receipt missing and aggregate version === expectedVersion", async () => {
    mockTaskModel.setDoc("task-4", {
      _id: "task-4",
      userId: "user-1",
      version: 3, // Exactly equal to expectedVersion
      recentMutationReceipts: [],
    });

    const res = await sweeper.reconcileStep(
      mockTaskModel,
      "task-4",
      "mut-step-unapplied",
      3
    );

    assert.equal(res.status, "UNAPPLIED");
    assert.equal(res.detectedVia, "VERSION_EQUALITY_UNAPPLIED");
  });

  it("5. Completes workflow reconciliation with COMMITTED when all steps are committed", async () => {
    mockTaskModel.setDoc("task-10", {
      _id: "task-10",
      userId: "user-1",
      version: 2,
      recentMutationReceipts: [{ clientMutationId: "step-1" }],
    });
    mockTaskModel.setDoc("task-11", {
      _id: "task-11",
      userId: "user-1",
      version: 2,
      recentMutationReceipts: [{ clientMutationId: "step-2" }],
    });

    const intent = {
      workflowId: "wf-100",
      userId: "user-1",
      status: "EXECUTING",
      steps: [
        { stepIndex: 0, aggregateType: "task", aggregateId: "task-10", stepMutationId: "step-1", expectedVersion: 1 },
        { stepIndex: 1, aggregateType: "task", aggregateId: "task-11", stepMutationId: "step-2", expectedVersion: 1 },
      ],
    };
    mockIntentModel.setDoc(intent);

    const modelMap = new Map<string, any>([["task", mockTaskModel]]);
    const res = await sweeper.reconcileWorkflow(intent as any, modelMap, 1);

    assert.equal(res.finalStatus, "COMMITTED");
    const updated = await mockIntentModel.findOne({ workflowId: "wf-100" });
    assert.equal(updated.status, "COMMITTED");
  });

  it("6. Completes workflow reconciliation with FAILED when all steps are unapplied", async () => {
    mockTaskModel.setDoc("task-20", {
      _id: "task-20",
      userId: "user-1",
      version: 1,
      recentMutationReceipts: [],
    });
    mockTaskModel.setDoc("task-21", {
      _id: "task-21",
      userId: "user-1",
      version: 1,
      recentMutationReceipts: [],
    });

    const intent = {
      workflowId: "wf-200",
      userId: "user-1",
      status: "EXECUTING",
      steps: [
        { stepIndex: 0, aggregateType: "task", aggregateId: "task-20", stepMutationId: "step-1", expectedVersion: 1 },
        { stepIndex: 1, aggregateType: "task", aggregateId: "task-21", stepMutationId: "step-2", expectedVersion: 1 },
      ],
    };
    mockIntentModel.setDoc(intent);

    const modelMap = new Map<string, any>([["task", mockTaskModel]]);
    const res = await sweeper.reconcileWorkflow(intent as any, modelMap, 1);

    assert.equal(res.finalStatus, "FAILED");
    const updated = await mockIntentModel.findOne({ workflowId: "wf-200" });
    assert.equal(updated.status, "FAILED");
  });

  it("7. Executes saga compensation via OutboxStorageService for partial commits", async () => {
    mockTaskModel.setDoc("task-30", {
      _id: "task-30",
      userId: "user-1",
      version: 2,
      mutationEpoch: 1,
      recentMutationReceipts: [{ clientMutationId: "step-1" }],
    });
    mockTaskModel.setDoc("task-31", {
      _id: "task-31",
      userId: "user-1",
      version: 1,
      mutationEpoch: 1,
      recentMutationReceipts: [], // Unapplied
    });

    const intent = {
      workflowId: "wf-300",
      userId: "user-1",
      status: "EXECUTING",
      steps: [
        {
          stepIndex: 0,
          aggregateType: "task",
          aggregateId: "task-30",
          stepMutationId: "step-1",
          expectedVersion: 1,
          compensationDiff: { status: "REVERTED" },
        },
        {
          stepIndex: 1,
          aggregateType: "task",
          aggregateId: "task-31",
          stepMutationId: "step-2",
          expectedVersion: 1,
          compensationDiff: {},
        },
      ],
    };
    mockIntentModel.setDoc(intent);

    const modelMap = new Map<string, any>([["task", mockTaskModel]]);
    const res = await sweeper.reconcileWorkflow(intent as any, modelMap, 1);

    assert.equal(res.finalStatus, "COMPENSATED");
    assert.equal(mockOutboxService.persistedCalls.length, 1);
    assert.equal(mockOutboxService.persistedCalls[0].aggregateId, "task-30");
    assert.equal(mockOutboxService.persistedCalls[0].clientMutationId, "comp_sweeper_step-1");
    assert.equal(mockOutboxService.persistedCalls[0].eventDrafts[0].type, "system.workflow.step_compensated");

    const updated = await mockIntentModel.findOne({ workflowId: "wf-300" });
    assert.equal(updated.status, "COMPENSATED");
  });

  it("8. Traps in QUARANTINED if aggregate epoch advanced or compensation throws (Anti-overwrite protection)", async () => {
    mockTaskModel.setDoc("task-40", {
      _id: "task-40",
      userId: "user-1",
      version: 2,
      mutationEpoch: 2, // Advanced beyond recoveryFencingEpoch (1)
      recentMutationReceipts: [{ clientMutationId: "step-1" }],
    });
    mockTaskModel.setDoc("task-41", {
      _id: "task-41",
      userId: "user-1",
      version: 1,
      mutationEpoch: 1,
      recentMutationReceipts: [],
    });

    const intent = {
      workflowId: "wf-400",
      userId: "user-1",
      status: "EXECUTING",
      steps: [
        {
          stepIndex: 0,
          aggregateType: "task",
          aggregateId: "task-40",
          stepMutationId: "step-1",
          expectedVersion: 1,
          compensationDiff: { status: "REVERTED" },
        },
        {
          stepIndex: 1,
          aggregateType: "task",
          aggregateId: "task-41",
          stepMutationId: "step-2",
          expectedVersion: 1,
        },
      ],
    };
    mockIntentModel.setDoc(intent);

    const modelMap = new Map<string, any>([["task", mockTaskModel]]);
    const res = await sweeper.reconcileWorkflow(intent as any, modelMap, 1);

    assert.equal(res.finalStatus, "QUARANTINED");
    assert.equal(mockOutboxService.persistedCalls.length, 0); // Outbox not called due to epoch violation

    const updated = await mockIntentModel.findOne({ workflowId: "wf-400" });
    assert.equal(updated.status, "QUARANTINED");
  });

  it("9. DWCPRecoveryService acquires exclusive partition lease, reconciles stalled intent, and releases lease", async () => {
    const mockLeaseModel = new MockLeaseModel();
    const leaseManager = new AutonomousLeaseManager({ leaseModel: mockLeaseModel });

    mockTaskModel.setDoc("task-50", {
      _id: "task-50",
      userId: "user-99",
      version: 2,
      recentMutationReceipts: [{ clientMutationId: "step-50" }],
    });

    const stalledIntent = {
      workflowId: "wf-stalled-1",
      userId: "user-99",
      status: "EXECUTING",
      updatedAt: new Date(Date.now() - 40000), // Stalled 40s ago
      steps: [
        {
          stepIndex: 0,
          aggregateType: "task",
          aggregateId: "task-50",
          stepMutationId: "step-50",
          expectedVersion: 1,
        },
      ],
    };
    mockIntentModel.setDoc(stalledIntent);

    const service = new DWCPRecoveryService({
      sweeper,
      intentModel: mockIntentModel,
      leaseManager,
      modelMap: new Map([["task", mockTaskModel]]),
    });

    const results = await service.reconcileStalledWorkflows("user-99", "worker-1", {
      stallThresholdMs: 30000,
      leaseDurationMs: 30000,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].workflowId, "wf-stalled-1");
    assert.equal(results[0].finalStatus, "COMMITTED");

    // Verify lease was released
    const leaseRecord = await leaseManager.getLease("user-99:dwcp:sweeper");
    assert.equal(leaseRecord?.status, "RELEASED");
  });

  it("10. DWCPRecoveryService skips reconciliation cleanly when partition lease is held by another worker", async () => {
    const mockLeaseModel = new MockLeaseModel();
    const leaseManager = new AutonomousLeaseManager({ leaseModel: mockLeaseModel });

    // Worker 1 holds active lease
    await leaseManager.acquireLease("user-contested:dwcp:sweeper", "worker-1", 60000);

    const service = new DWCPRecoveryService({
      sweeper,
      intentModel: mockIntentModel,
      leaseManager,
      modelMap: new Map([["task", mockTaskModel]]),
    });

    // Worker 2 attempts reconciliation
    const results = await service.reconcileStalledWorkflows("user-contested", "worker-2", {
      stallThresholdMs: 30000,
    });

    assert.equal(results.length, 0); // Cleanly skipped
  });
});

