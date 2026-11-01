import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  KernelCapabilityService,
  IdempotencyPayloadMismatchError,
  ConcurrentExecutionError,
  IdempotencyUncertainQuarantinedError,
  canonicalJsonStringify,
  computeRequestFingerprint,
} from "../../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry, IActionAdapter } from "../../orchestration/kernel/ActionAdapters";
import { ActionProposal } from "../../orchestration/contracts/ActionProposalContracts";

class MockAuditModel {
  public docs: Map<string, any> = new Map();

  private getKey(userId: string, idempotencyKey: string): string {
    return `${userId}:${idempotencyKey}`;
  }

  async findOne(query: { userId: string; idempotencyKey: string }): Promise<any> {
    const key = this.getKey(query.userId, query.idempotencyKey);
    const doc = this.docs.get(key);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  async create(doc: any): Promise<any> {
    const key = this.getKey(doc.userId, doc.idempotencyKey);
    if (this.docs.has(key)) {
      const err: any = new Error(`E11000 duplicate key error collection: index: userId_1_idempotencyKey_1 dup key`);
      err.code = 11000;
      throw err;
    }
    const saved = JSON.parse(JSON.stringify({ _id: `audit_${Date.now()}_${Math.random()}`, ...doc }));
    this.docs.set(key, saved);
    return saved;
  }

  async updateOne(filter: { userId: string; idempotencyKey: string }, update: any): Promise<{ matchedCount: number; modifiedCount: number }> {
    const key = this.getKey(filter.userId, filter.idempotencyKey);
    const existing = this.docs.get(key);
    if (!existing) {
      return { matchedCount: 0, modifiedCount: 0 };
    }
    if (update.$set) {
      Object.assign(existing, update.$set);
    }
    if (update.$inc) {
      for (const [field, incVal] of Object.entries(update.$inc)) {
        existing[field] = (existing[field] || 0) + (incVal as number);
      }
    }
    this.docs.set(key, existing);
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

class MockReceiptModel {
  public receipts: Map<string, any> = new Map();

  private getKey(userId: string, clientMutationId: string): string {
    return `${userId}:${clientMutationId}`;
  }

  async findOne(query: { userId: string; clientMutationId: string }): Promise<any> {
    const key = this.getKey(query.userId, query.clientMutationId);
    const doc = this.receipts.get(key);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  addReceipt(userId: string, clientMutationId: string, receiptData: any): void {
    const key = this.getKey(userId, clientMutationId);
    this.receipts.set(key, {
      receiptId: `rcpt_${Date.now()}`,
      userId,
      clientMutationId,
      status: "COMMITTED",
      version: 2,
      fencingEpoch: 1,
      appliedAt: new Date(),
      ...receiptData,
    });
  }
}

describe("Step 4 Loop 1: Durable Kernel Idempotency & Audit Store", () => {
  let registry: ActionAdapterRegistry;
  let auditModel: MockAuditModel;
  let receiptModel: MockReceiptModel;
  let kernel: KernelCapabilityService;
  let adapterExecutionCount: number;

  beforeEach(() => {
    registry = new ActionAdapterRegistry();
    adapterExecutionCount = 0;

    const mockAdapter: IActionAdapter = {
      actionType: "create_task",
      validatePreconditions: async () => ({ valid: true }),
      execute: async (action, userId) => {
        adapterExecutionCount++;
        return {
          success: true,
          taskId: "task_123",
          taskTitle: action.parameters?.title || "Test Task",
          timestamp: Date.now(),
        };
      },
      compensate: async () => ({ compensated: true }),
    };

    registry.register("create_task", mockAdapter);
    auditModel = new MockAuditModel();
    receiptModel = new MockReceiptModel();
    kernel = new KernelCapabilityService(registry, {
      auditModel,
      receiptModel,
      workerId: "test_worker_1",
    });
  });

  it("canonicalJsonStringify produces deterministic string regardless of key order", () => {
    const objA = { z: 1, a: 2, m: { y: "hello", x: "world" } };
    const objB = { a: 2, m: { x: "world", y: "hello" }, z: 1 };
    assert.equal(canonicalJsonStringify(objA), canonicalJsonStringify(objB));
    assert.equal(
      canonicalJsonStringify(objA),
      '{"a":2,"m":{"x":"world","y":"hello"},"z":1}'
    );
  });

  it("computeRequestFingerprint generates identical SHA-256 for identical logical payloads", () => {
    const fp1 = computeRequestFingerprint("user_1", "create_task", { title: "Buy groceries", priority: 1 });
    const fp2 = computeRequestFingerprint("user_1", "create_task", { priority: 1, title: "Buy groceries" });
    assert.equal(fp1, fp2);
    assert.match(fp1, /^[0-9a-f]{64}$/);
  });

  it("executes action cleanly and writes through to ActionAuditRecordModel in SUCCEEDED state", async () => {
    const proposal: ActionProposal = {
      id: "prop_001",
      actionType: "create_task",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Unit test",
      parameters: { title: "Build LifeOS" },
      idempotencyKey: "idemp_test_001",
    };

    const result = await kernel.executeAction("user_1", proposal);
    assert.equal(result.success, true);
    assert.equal(result.status, "SUCCEEDED");
    assert.equal(adapterExecutionCount, 1);

    // Verify DB write-through
    const dbDoc = await auditModel.findOne({ userId: "user_1", idempotencyKey: "idemp_test_001" });
    assert.ok(dbDoc, "Audit record must be saved in database");
    assert.equal(dbDoc.status, "SUCCEEDED");
    assert.equal(dbDoc.actionId, "prop_001");
    assert.ok(dbDoc.requestFingerprint);
  });

  it("test_idempotency_survives_process_restart: returns cached receipt from DB without re-running adapter", async () => {
    const proposal: ActionProposal = {
      id: "prop_restart",
      actionType: "create_task",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Process restart test",
      parameters: { title: "Durable Task" },
      idempotencyKey: "idemp_restart",
    };

    // First execution
    const res1 = await kernel.executeAction("user_1", proposal);
    assert.equal(res1.success, true);
    assert.equal(adapterExecutionCount, 1);

    // Simulate process crash / restart: clear in-memory L1 cache
    kernel.clearAuditStore();

    // Second execution with identical key and payload
    const res2 = await kernel.executeAction("user_1", proposal);
    assert.equal(res2.success, true);
    assert.equal(res2.idempotent, true);
    assert.equal(adapterExecutionCount, 1, "Adapter must NOT re-execute on replay after memory reset");
    assert.equal(res2.data.taskId, "task_123");
  });

  it("test_idempotency_payload_mismatch_rejected: rejects altered payload with IdempotencyPayloadMismatchError", async () => {
    const proposalOriginal: ActionProposal = {
      id: "prop_orig",
      actionType: "create_task",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Original payload",
      parameters: { title: "Original Title" },
      idempotencyKey: "idemp_tamper_test",
    };

    await kernel.executeAction("user_1", proposalOriginal);

    const proposalTampered: ActionProposal = {
      id: "prop_tampered",
      actionType: "create_task",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Tampered payload",
      parameters: { title: "Hacked Altered Title" },
      idempotencyKey: "idemp_tamper_test",
    };

    await assert.rejects(
      async () => {
        await kernel.executeAction("user_1", proposalTampered);
      },
      IdempotencyPayloadMismatchError,
      "Must throw IdempotencyPayloadMismatchError when payload is modified for same idempotencyKey"
    );
  });

  it("test_idempotency_concurrent_in_flight_deduplication: 10 concurrent requests execute adapter exactly ONCE", async () => {
    const proposal: ActionProposal = {
      id: "prop_concur",
      actionType: "create_task",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Concurrency test",
      parameters: { title: "Concurrent Task" },
      idempotencyKey: "idemp_concurrent_storm",
    };

    // Fire 10 simultaneous requests
    const promises = Array.from({ length: 10 }, () => kernel.executeAction("user_1", proposal));
    const results = await Promise.all(promises);

    assert.equal(adapterExecutionCount, 1, "Adapter must execute exactly once under 10 concurrent requests");
    for (const res of results) {
      assert.equal(res.success, true);
      assert.equal(res.status, "SUCCEEDED");
      assert.equal(res.data.taskId, "task_123");
    }
  });

  it("test_idempotency_active_lease_returns_concurrent_error: rejects if executing under active lease", async () => {
    // Stage an active execution lease in DB from another worker
    await auditModel.create({
      userId: "user_1",
      idempotencyKey: "idemp_active_lease",
      actionId: "prop_other",
      actionType: "create_task",
      requestFingerprint: computeRequestFingerprint("user_1", "create_task", { title: "In Flight" }),
      status: "EXECUTING",
      workerId: "worker_other_server",
      leaseExpiresAt: new Date(Date.now() + 10000), // active for 10s
      fencingEpoch: 1,
      timestamp: Date.now(),
    });

    const proposal: ActionProposal = {
      id: "prop_conflict",
      actionType: "create_task",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Conflict check",
      parameters: { title: "In Flight" },
      idempotencyKey: "idemp_active_lease",
    };

    await assert.rejects(
      async () => {
        await kernel.executeAction("user_1", proposal);
      },
      ConcurrentExecutionError,
      "Must throw ConcurrentExecutionError when action is active on another worker"
    );
  });

  it("test_idempotency_crash_recovery_reconciliation: recovers crashed mutation via MutationReceiptModel", async () => {
    const proposal: ActionProposal = {
      id: "prop_crashed",
      actionType: "create_task",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Crash recovery",
      parameters: { title: "Recovered Task", priority: "HIGH" },
      idempotencyKey: "idemp_crashed",
    };

    const fp = computeRequestFingerprint("user_1", "create_task", proposal.parameters);

    // Simulate crashed execution: audit record stuck in EXECUTING with expired lease
    await auditModel.create({
      userId: "user_1",
      idempotencyKey: "idemp_crashed",
      actionId: "prop_crashed",
      actionType: "create_task",
      requestFingerprint: fp,
      status: "EXECUTING",
      workerId: "dead_worker",
      leaseExpiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago!
      fencingEpoch: 1,
      timestamp: Date.now() - 10000,
    });

    // Domain mutation did commit before crash: receipt exists in MutationReceiptModel!
    receiptModel.addReceipt("user_1", "prop_crashed", {
      aggregateId: "task_reconstructed_456",
      version: 1,
    });

    // Replay request
    const result = await kernel.executeAction("user_1", proposal);

    assert.equal(result.success, true);
    assert.equal(result.status, "SUCCEEDED");
    assert.equal(result.idempotent, true);
    assert.equal(adapterExecutionCount, 0, "Adapter must NOT re-execute when receipt exists");
    assert.equal(result.data.reconstructed, true);
    assert.equal(result.data.targetEntityId, "task_reconstructed_456");
    assert.equal(result.data.title, "Recovered Task");

    // Verify DB was updated to SUCCEEDED
    const updated = await auditModel.findOne({ userId: "user_1", idempotencyKey: "idemp_crashed" });
    assert.equal(updated.status, "SUCCEEDED");
  });

  it("test_idempotency_quarantines_ghost_version: aggregate advanced without receipt", async () => {
    const proposal: ActionProposal = {
      id: "prop_ghost",
      actionType: "create_task",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Ghost version test",
      targetEntityId: "task_ghost_789",
      parameters: { title: "Ghost Task" },
      idempotencyKey: "idemp_ghost",
    };
    (proposal as any).expectedVersion = 2;

    const fp = computeRequestFingerprint("user_1", "create_task", proposal.parameters);

    // Stalled in EXECUTING past lease TTL
    await auditModel.create({
      userId: "user_1",
      idempotencyKey: "idemp_ghost",
      actionId: "prop_ghost",
      actionType: "create_task",
      requestFingerprint: fp,
      status: "EXECUTING",
      workerId: "dead_worker",
      leaseExpiresAt: new Date(Date.now() - 5000),
      fencingEpoch: 1,
      timestamp: Date.now() - 10000,
    });

    // Mock aggregate resolver returning version 3 (> expectedVersion 2)
    kernel.setAggregateModelResolver((actionType) => ({
      findById: async () => ({ version: 3 }),
    }));

    await assert.rejects(
      async () => {
        await kernel.executeAction("user_1", proposal);
      },
      IdempotencyUncertainQuarantinedError,
      "Must quarantine when aggregate version advanced without receipt"
    );

    const doc = await auditModel.findOne({ userId: "user_1", idempotencyKey: "idemp_ghost" });
    assert.equal(doc.status, "QUARANTINED");
  });

  it("test_idempotency_compound_key_multi_tenant_isolation: user A and B do not collide on same idempotencyKey", async () => {
    const propUserA: ActionProposal = {
      id: "prop_user_a",
      actionType: "create_task",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Tenant A",
      parameters: { title: "User A Task" },
      idempotencyKey: "shared_key_123",
    };

    const propUserB: ActionProposal = {
      id: "prop_user_b",
      actionType: "create_task",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Tenant B",
      parameters: { title: "User B Task" },
      idempotencyKey: "shared_key_123",
    };

    const resA = await kernel.executeAction("user_A", propUserA);
    const resB = await kernel.executeAction("user_B", propUserB);

    assert.equal(resA.success, true);
    assert.equal(resB.success, true);
    assert.equal(adapterExecutionCount, 2, "Both tenants must execute independently on compound key {userId, idempotencyKey}");

    const docA = await auditModel.findOne({ userId: "user_A", idempotencyKey: "shared_key_123" });
    const docB = await auditModel.findOne({ userId: "user_B", idempotencyKey: "shared_key_123" });
    assert.ok(docA);
    assert.ok(docB);
    assert.notEqual(docA.actionId, docB.actionId);
  });
});
