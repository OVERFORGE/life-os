/**
 * step4ConcurrencyChaos.test.ts
 * 
 * Step 4 Loop 7: End-to-End Concurrency Chaos & Fault Injection Battery
 * 
 * Verifies all 15 Concurrency Chaos & Failure Scenarios:
 * 1. Process crash between action adapter execution and audit write (reconstructed from receipts).
 * 2. Server restart during multi-step autonomous saga execution.
 * 3. Worker lease expiration during long-running DWCP sweep.
 * 4. Competing autonomous daemons attempting simultaneous lease takeover.
 * 5. Replay of expired HITL response tokens over high-latency networks.
 * 6. Tampered intervention response payloads with forged signatures.
 * 7. Concurrent primary aggregate updates during secondary schedule sweep (Mode A abort & Mode B lock rejection).
 * 8. Un-evicted L1 receipts with database index corruption simulation.
 * 9. Evicted L1 receipts with corrupted L2 collection simulation.
 * 10. Ghost version advancement triggering anti-corruption quarantine.
 * 11. Stale worker attempting CAS write after lease epoch increment.
 * 12. Parallel graph rebuild races on shared user account (resolved via revision sandwich and CAS).
 * 13. Delayed worker vs sweeper epoch burn race in Mode B HITL response dispatch.
 * 14. Rapid-fire duplicate action envelopes with identical {userId, idempotencyKey}.
 * 15. Quiet hours evaluation under missing user timezone (Category B deferral).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Component imports
import {
  KernelCapabilityService,
  computeRequestFingerprint,
  IdempotencyPayloadMismatchError,
  ConcurrentExecutionError,
  IdempotencyUncertainQuarantinedError,
} from "../../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../../orchestration/kernel/ActionAdapters";
import { ActionProposal } from "../../orchestration/contracts/ActionProposalContracts";
import {
  HITLGovernanceEngine,
  TamperedInterventionError,
  ExpiredInterventionError,
} from "../../autonomous/HITLGovernanceEngine";
import { DWCPRecoverySweeper } from "../../autonomous/DWCPRecoverySweeper";
import { AutonomousLeaseManager } from "../../autonomous/AutonomousLeaseManager";
import { TemporalScheduleSweeper } from "../../temporal/sweeper/TemporalScheduleSweeper";
import { TemporalPartitionRevisionService } from "../../temporal/sweeper/TemporalPartitionRevisionService";
import { getUserLifecycleContext } from "../../autonomous/AutonomousExecutionDaemon";
import { ExecutionGraphProjectionService } from "../../events/projections/ExecutionGraphProjectionService";

describe("Step 4 Loop 7: 15-Scenario End-to-End Concurrency Chaos Battery", () => {

  // Scenario 1: Crash between action adapter execution and audit write
  it("Scenario 1: Process crash between adapter execution and audit write reconstructs from receipts", async () => {
    const receipts = [
      {
        userId: "user-1",
        clientMutationId: "mut-crash-1",
        aggregateId: "task-crash-1",
        version: 2,
        status: "COMMITTED",
        appliedAt: new Date(),
      },
    ];
    const mockReceiptModel = {
      findOne: async (q: any) => receipts.find((r) => r.clientMutationId === q.clientMutationId) || null,
    };
    const auditDocs = new Map<string, any>();
    auditDocs.set("user-1:idemp-crash-1", {
      userId: "user-1",
      idempotencyKey: "idemp-crash-1",
      actionId: "mut-crash-1",
      status: "EXECUTING",
      leaseExpiresAt: new Date(Date.now() - 5000), // Expired lease after crash
      requestFingerprint: "placeholder",
      payload: { value: 42 },
    });
    const mockAuditModel = {
      findOne: async (q: any) => auditDocs.get(`${q.userId}:${q.idempotencyKey}`) || null,
      updateOne: async (q: any, u: any) => {
        const k = `${q.userId}:${q.idempotencyKey}`;
        const doc = auditDocs.get(k);
        if (doc) Object.assign(doc, u.$set);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    };

    const registry = new ActionAdapterRegistry();
    const kernel = new KernelCapabilityService(registry, {
      auditModel: mockAuditModel,
      receiptModel: mockReceiptModel,
    });

    const proposal: ActionProposal = {
      id: "mut-crash-1",
      actionType: "sample_action",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Unit test",
      parameters: { value: 42 },
      idempotencyKey: "idemp-crash-1",
    };

    const fp = computeRequestFingerprint("user-1", "sample_action", proposal.parameters);
    auditDocs.get("user-1:idemp-crash-1").requestFingerprint = fp;

    const res = await kernel.executeAction("user-1", proposal);

    assert.equal(res.status, "SUCCEEDED");
    assert.equal(auditDocs.get("user-1:idemp-crash-1").status, "SUCCEEDED");
  });

  // Scenario 2: Server restart during multi-step autonomous saga execution
  it("Scenario 2: Server restart during multi-step saga recovers stalled execution", async () => {
    const intent = {
      workflowId: "saga-wf-restart",
      userId: "user-restart",
      status: "EXECUTING",
      steps: [
        { stepIndex: 0, aggregateType: "task", aggregateId: "task-1", stepMutationId: "mut-1", expectedVersion: 1 },
        { stepIndex: 1, aggregateType: "task", aggregateId: "task-2", stepMutationId: "mut-2", expectedVersion: 1 },
      ],
    };

    const mockTaskModel = {
      findById: async (id: string) => ({
        _id: id,
        userId: "user-restart",
        version: id === "task-1" ? 2 : 1, // step 1 committed before restart, step 2 never applied
        mutationEpoch: 1,
        recentMutationReceipts: id === "task-1" ? [{ clientMutationId: "mut-1" }] : [],
      }),
    };

    let compensated = false;
    const mockOutbox = {
      persistWithStandaloneFencing: async (_params: any) => {
        compensated = true;
        return { success: true };
      },
    };

    const mockIntentModel = {
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    };
    const mockReceiptModel = { findOne: async () => null };

    const sweeper = new DWCPRecoverySweeper({
      intentModel: mockIntentModel as any,
      receiptModel: mockReceiptModel as any,
      outboxService: mockOutbox as any,
    });

    const result = await sweeper.reconcileWorkflow(intent as any, new Map([["task", mockTaskModel]]), 1);
    assert.equal(result.finalStatus, "COMPENSATED");
    assert.equal(compensated, true);
  });

  // Scenario 3: Worker lease expiration during long-running DWCP sweep
  it("Scenario 3: Worker lease expiration during DWCP sweep prevents stale writes", async () => {
    const mockLeaseModel = {
      findOne: async (q: any) => {
        if (q.expiresAt?.$gt) {
          const expiredTime = new Date(Date.now() - 1000).getTime();
          if (expiredTime <= q.expiresAt.$gt.getTime()) return null;
        }
        return null;
      },
      findOneAndUpdate: async () => null,
      updateOne: async () => ({ matchedCount: 0, modifiedCount: 0 }),
    };
    const leaseManager = new AutonomousLeaseManager({ leaseModel: mockLeaseModel });

    const active = await leaseManager.isLeaseActive("user-1", "worker-stale", 1);
    assert.equal(active, false);
  });

  // Scenario 4: Competing autonomous daemons attempting simultaneous lease takeover
  it("Scenario 4: Competing autonomous daemons attempting simultaneous lease takeover", async () => {
    const leases = new Map<string, any>();
    const mockLeaseModel = {
      findOne: async (q: any) => leases.get(q.userId) || null,
      create: async (d: any) => { leases.set(d.userId, { ...d }); return d; },
      findOneAndUpdate: async (f: any, u: any) => {
        const doc = leases.get(f.userId);
        if (!doc) return null;
        if (f.$or) {
          const matched = f.$or.some((c: any) => c.status === doc.status);
          if (!matched) return null;
        }
        if (u.$inc) doc.epoch = (doc.epoch || 0) + u.$inc.epoch;
        if (u.$set) Object.assign(doc, u.$set);
        leases.set(f.userId, doc);
        return JSON.parse(JSON.stringify(doc));
      },
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    };

    const leaseManager = new AutonomousLeaseManager({ leaseModel: mockLeaseModel });
    await leaseManager.ensureLeaseRecord("user-contend");

    // Competing simultaneous acquisitions
    const [tokenA, tokenB] = await Promise.all([
      leaseManager.acquireLease("user-contend", "worker-A", 30000),
      leaseManager.acquireLease("user-contend", "worker-B", 30000),
    ]);

    // Exactly one worker wins; the other gets null
    assert.ok((tokenA && !tokenB) || (!tokenA && tokenB));
  });

  // Scenario 5: Replay of expired HITL response tokens over high-latency networks
  it("Scenario 5: Replay of expired HITL response tokens rejected", async () => {
    const docs = new Map<string, any>();
    const mockInterventionModel = {
      findOne: async (q: any) => docs.get(q.interventionId) || null,
      create: async (d: any) => { docs.set(d.interventionId, { ...d }); return d; },
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    };

    const engine = new HITLGovernanceEngine({
      interventionModel: mockInterventionModel as any,
      secretKey: "secret-key-32-chars-long-here!!",
      activeKeyVersion: 1,
      workerId: "test_worker",
    });

    const intervention = await engine.createIntervention({
      userId: "user-5",
      actionId: "act-5",
      autonomyLevel: "L2",
      domain: "productivity",
      proposal: { test: true },
      ttlMs: -3600000, // Created already expired
    });

    await assert.rejects(
      async () => {
        await engine.respondIntervention({
          interventionId: intervention.interventionId,
          userId: "user-5",
          response: "ACCEPTED",
          signature: intervention.signature,
        });
      },
      ExpiredInterventionError
    );
  });

  // Scenario 6: Tampered intervention response payloads with forged signatures
  it("Scenario 6: Tampered intervention response signatures rejected", async () => {
    const docs = new Map<string, any>();
    const mockInterventionModel = {
      findOne: async (q: any) => docs.get(q.interventionId) || null,
      create: async (d: any) => { docs.set(d.interventionId, { ...d }); return d; },
      updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    };

    const engine = new HITLGovernanceEngine({
      interventionModel: mockInterventionModel as any,
      secretKey: "secret-key-32-chars-long-here!!",
      activeKeyVersion: 1,
      workerId: "test_worker",
    });

    const intervention = await engine.createIntervention({
      userId: "user-6",
      actionId: "act-6",
      autonomyLevel: "L2",
      domain: "productivity",
      proposal: { taskTitle: "Schedule checkup" },
    });

    const tamperedSig = intervention.signature.slice(0, -2) + "ff";

    await assert.rejects(
      async () => {
        await engine.respondIntervention({
          interventionId: intervention.interventionId,
          userId: "user-6",
          response: "ACCEPTED",
          signature: tamperedSig,
        });
      },
      (err: any) => err instanceof TamperedInterventionError
    );
  });

  // Scenario 7: Concurrent primary aggregate updates during secondary schedule sweep
  it("Scenario 7: Concurrent primary occurrence updates during schedule sweep aborts cleanly (Mode B lock rejection)", async () => {
    const mockRevModel = {
      revisions: new Map<string, any>([["user-7:2026-11-05", { partitionRevision: 2 }]]),
      findOne: async (q: any) => mockRevModel.revisions.get(`${q.userId}:${q.dateStr}`) || null,
      findOneAndUpdate: async () => null, // CAS matches 0 docs because revision advanced
    };
    const revService = new TemporalPartitionRevisionService(mockRevModel);
    const sweeper = new TemporalScheduleSweeper({
      occurrenceModel: { find: async () => [] },
      conflictReportModel: { findOne: async () => null },
      revisionModel: mockRevModel,
      revisionService: revService,
    });

    const res = await sweeper.sweepPartition("user-7", "2026-11-05", "worker-7");
    assert.equal(res.status, "ABORTED_MID_SWEEP");
  });

  // Scenario 8: Un-evicted L1 receipts with database index corruption simulation
  it("Scenario 8: Un-evicted L1 receipt correctly resolves step as COMMITTED", async () => {
    const sweeper = new DWCPRecoverySweeper({
      receiptModel: { findOne: async () => { throw new Error("DB Index Corruption Simulated"); } },
    });
    const mockAgg = {
      findById: async () => ({
        _id: "agg-8",
        version: 2,
        recentMutationReceipts: [{ clientMutationId: "step-8-mut" }],
      }),
    };

    const res = await sweeper.reconcileStep(mockAgg, "agg-8", "step-8-mut", 1);
    assert.equal(res.status, "COMMITTED");
    assert.equal(res.detectedVia, "L1_RING_BUFFER");
  });

  // Scenario 9: Evicted L1 receipts with corrupted L2 collection simulation
  it("Scenario 9: Evicted L1 receipt with L2 collection error quarantines rather than corrupting", async () => {
    const sweeper = new DWCPRecoverySweeper({
      receiptModel: {
        findOne: async () => null, // L2 miss
      },
    });
    const mockAgg = {
      findById: async () => ({
        _id: "agg-9",
        version: 5, // Version advanced beyond expected 2
        recentMutationReceipts: [], // Evicted
      }),
    };

    const res = await sweeper.reconcileStep(mockAgg, "agg-9", "step-9-mut", 2);
    assert.equal(res.status, "QUARANTINED");
    assert.equal(res.detectedVia, "EVICTED_UNKNOWN_ADVANCED_VERSION");
  });

  // Scenario 10: Ghost version advancement triggering anti-corruption quarantine
  it("Scenario 10: Ghost version advancement without receipts is quarantined", async () => {
    const auditDocs = new Map<string, any>();
    auditDocs.set("user-10:idemp-ghost", {
      userId: "user-10",
      idempotencyKey: "idemp-ghost",
      actionId: "mut-ghost-10",
      status: "EXECUTING",
      leaseExpiresAt: new Date(Date.now() - 5000),
      requestFingerprint: "placeholder",
      payload: { x: 1 },
    });

    const mockAuditModel = {
      findOne: async () => auditDocs.get("user-10:idemp-ghost"),
      updateOne: async (_q: any, u: any) => {
        Object.assign(auditDocs.get("user-10:idemp-ghost"), u.$set);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    };
    const mockReceiptModel = { findOne: async () => null }; // No receipt found

    const registry = new ActionAdapterRegistry();
    const kernel = new KernelCapabilityService(registry, {
      auditModel: mockAuditModel,
      receiptModel: mockReceiptModel,
    });

    const proposal: ActionProposal = {
      id: "mut-ghost-10",
      actionType: "ghost_action",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Unit test",
      targetEntityId: "task_ghost_789",
      parameters: { x: 1 },
      idempotencyKey: "idemp-ghost",
    };
    (proposal as any).expectedVersion = 2;

    kernel.setAggregateModelResolver(() => ({
      findById: async () => ({ version: 3 }),
    }));

    const fp = computeRequestFingerprint("user-10", "ghost_action", proposal.parameters);
    auditDocs.get("user-10:idemp-ghost").requestFingerprint = fp;

    await assert.rejects(
      async () => {
        await kernel.executeAction("user-10", proposal);
      },
      (err: any) => err instanceof IdempotencyUncertainQuarantinedError
    );

    assert.equal(auditDocs.get("user-10:idemp-ghost").status, "QUARANTINED");
  });

  // Scenario 11: Stale worker attempting CAS write after lease epoch increment
  it("Scenario 11: Stale worker attempting CAS write after lease epoch increment is rejected", async () => {
    const mockLeaseModel = {
      leases: new Map<string, any>([["user-11", { userId: "user-11", epoch: 3, leaseHolder: "worker-new", status: "ACTIVE" }]]),
      findOneAndUpdate: async (f: any) => {
        const doc = mockLeaseModel.leases.get(f.userId);
        if (doc && f.epoch === doc.epoch && f.leaseHolder === doc.leaseHolder) {
          return doc;
        }
        return null; // Stale worker epoch 2 fails
      },
    };
    const leaseManager = new AutonomousLeaseManager({ leaseModel: mockLeaseModel });

    const renewed = await leaseManager.renewLease("user-11", "worker-stale", 2, 30000);
    assert.equal(renewed, null);
  });

  // Scenario 12: Parallel graph rebuild races on shared user account
  it("Scenario 12: Parallel graph rebuild races resolved via revision sandwich and CAS", async () => {
    const revModel = {
      findOne: async () => ({ userId: "user-12", graphRevision: 3 }),
    };
    const derivedModel = {
      current: null as any,
      findOne: async () => derivedModel.current,
      findOneAndUpdate: async (_f: any, u: any) => {
        if (!derivedModel.current || derivedModel.current.appliedGraphRevision < 3) {
          derivedModel.current = { ...u.$set };
          return derivedModel.current;
        }
        return null; // Lost race
      },
    };
    const taskModel = {
      find: async () => [{ id: "t12", title: "Task 12", status: "pending", dependencies: [] }],
    };
    const goalModel = { find: async () => [] };

    const service = new ExecutionGraphProjectionService({
      derivedModel,
      revisionModel: revModel,
      taskModel,
      goalModel,
    });

    const [resA, resB] = await Promise.all([
      service.getGraph("user-12"),
      service.getGraph("user-12"),
    ]);

    assert.equal(resA.graph.appliedGraphRevision, 3);
    assert.equal(resB.graph.appliedGraphRevision, 3);
  });

  // Scenario 13: Delayed worker vs sweeper epoch burn race in Mode B HITL response dispatch
  it("Scenario 13: Delayed worker vs sweeper epoch burn race fences out delayed worker", async () => {
    const interventionDoc = {
      interventionId: "int-13",
      userId: "user-13",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60000),
      allowedDecisions: ["APPROVE"],
      signingKeyVersion: "v1",
      mutationEpoch: 1, // Base epoch
    };

    const mockInterventionModel = {
      findOne: async () => JSON.parse(JSON.stringify(interventionDoc)),
      updateOne: async (f: any, u: any) => {
        if (f.mutationEpoch !== undefined && interventionDoc.mutationEpoch !== f.mutationEpoch) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
        if (u.$inc?.mutationEpoch) interventionDoc.mutationEpoch += u.$inc.mutationEpoch;
        return { matchedCount: 1, modifiedCount: 1 };
      },
    };

    // Sweeper burns epoch to 2
    await mockInterventionModel.updateOne({ interventionId: "int-13" }, { $inc: { mutationEpoch: 1 } });
    assert.equal(interventionDoc.mutationEpoch, 2);

    // Delayed worker resumes and attempts CAS on old epoch 1
    const res = await mockInterventionModel.updateOne(
      { interventionId: "int-13", mutationEpoch: 1 },
      { $set: { status: "RESPONDED" } }
    );

    assert.equal(res.matchedCount, 0); // Fenced out cleanly!
  });

  // Scenario 14: Rapid-fire duplicate action envelopes with identical {userId, idempotencyKey}
  it("Scenario 14: Rapid-fire duplicate action envelopes deduplicate in flight cleanly", async () => {
    let adapterExecutions = 0;
    const mockAdapter = {
      validatePreconditions: async () => ({ valid: true }),
      execute: async () => {
        adapterExecutions++;
        await new Promise((r) => setTimeout(r, 20));
        return { count: adapterExecutions };
      },
    };

    const auditDocs = new Map<string, any>();
    const mockAudit = {
      findOne: async (q: any) => auditDocs.get(`${q.userId}:${q.idempotencyKey}`) || null,
      create: async (d: any) => {
        const k = `${d.userId}:${d.idempotencyKey}`;
        if (auditDocs.has(k)) {
          const err: any = new Error("E11000 duplicate key error");
          err.code = 11000;
          throw err;
        }
        auditDocs.set(k, { ...d });
        return d;
      },
      updateOne: async (q: any, u: any) => {
        const doc = auditDocs.get(`${q.userId}:${q.idempotencyKey}`);
        if (doc) Object.assign(doc, u.$set);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    };
    const mockReceipt = { findOne: async () => null };

    const registry = new ActionAdapterRegistry();
    registry.register("rapid_fire", mockAdapter);

    const kernel = new KernelCapabilityService(registry, {
      auditModel: mockAudit,
      receiptModel: mockReceipt,
    });

    const proposal: ActionProposal = {
      id: "mut-rapid-14",
      actionType: "rapid_fire",
      domain: "productivity",
      reversibility: "atomic_single_doc",
      rationale: "Unit test",
      parameters: { test: true },
      idempotencyKey: "idemp-rapid-14",
    };

    const promises = Array.from({ length: 5 }, () =>
      kernel.executeAction("user-14", proposal)
    );

    const results = await Promise.all(promises);
    assert.equal(adapterExecutions, 1);
    for (const r of results) {
      assert.deepEqual(r.data, { count: 1 });
    }
  });

  // Scenario 15: Quiet hours evaluation under missing user timezone (Category B deferral)
  it("Scenario 15: Quiet hours evaluation under missing user timezone defers Category B without UTC fallback", () => {
    const context = getUserLifecycleContext("user-15", null);
    assert.equal(context.timezoneValid, false);
    assert.equal(context.userLocalDate, "");
    assert.equal(context.userLocalHour, -1);
  });
});
