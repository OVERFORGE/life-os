/**
 * step5PerformanceBenchmarks.test.ts
 *
 * LifeOS Step 5: Full-System Integration Testing & Final Acceptance
 * Phase 7 — Performance, Stability & Resource Benchmarks
 *
 * Measures:
 * 1. Kernel Mutation Dispatch Latency (P50, P95 < 50ms, P99).
 * 2. ExecutionGraph Projection Latency & Cache Hit Fast-Path (< 5ms).
 * 3. Outbox Batch Processing Throughput (> 100 events/sec).
 * 4. Autonomous Sweeper & Daemon Tick Processing Duration.
 * 5. Memory Stability & Bounded Heap Allocation under Rapid Iteration.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import {
  KernelCapabilityService,
  ActionProposal,
  IKernelActionAdapter,
} from "../../orchestration/kernel/KernelCapabilityService";
import { ActionAdapterRegistry } from "../../orchestration/kernel/ActionAdapters";
import { ExecutionGraphProjectionService } from "../../events/projections/ExecutionGraphProjectionService";
import { DurableOutboxDispatcher } from "../../events/dispatch/DurableOutboxDispatcher";
import { ConsumerRegistry } from "../../events/consumers/ConsumerRegistry";
import { WorkerLeaseManager } from "../../events/dispatch/WorkerLeaseManager";
import { AutonomousExecutionDaemon } from "../../autonomous/AutonomousExecutionDaemon";
import { AutonomousLeaseManager } from "../../autonomous/AutonomousLeaseManager";
import { TemporalScheduleSweeper } from "../../temporal/sweeper/TemporalScheduleSweeper";
import { TemporalPartitionRevisionService } from "../../temporal/sweeper/TemporalPartitionRevisionService";

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
      sort: () => queryObj,
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
        item.goalId ||
        item.taskId ||
        item.occurrenceId ||
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
        ...filter,
        ...(update.$setOnInsert || {}),
        ...(update.$set || {}),
      };
      this.applyUpdate(newDoc, update);
      const id = String(filter._id || filter.goalId || filter.taskId || `id_${Date.now()}`);
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
        ...filter,
        ...(update.$setOnInsert || {}),
        ...(update.$set || {}),
      };
      this.applyUpdate(newDoc, update);
      const id = String(filter._id || filter.goalId || filter.taskId || `id_${Date.now()}`);
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
  }

  private setDeep(obj: any, path: string, value: any): void {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!cur[part] || typeof cur[part] !== "object") {
        cur[part] = {};
      }
      cur = cur[part];
    }
    cur[parts[parts.length - 1]] = value;
  }

  private getDeep(obj: any, path: string): any {
    const parts = path.split(".");
    let cur = obj;
    for (const part of parts) {
      if (!cur || typeof cur !== "object") return undefined;
      cur = cur[part];
    }
    return cur;
  }
}

describe("Step 5 Phase 7: Performance, Stability & Resource Benchmarks", () => {
  // --------------------------------------------------------------------------
  // BENCHMARK 1: KERNEL MUTATION DISPATCH LATENCY
  // --------------------------------------------------------------------------
  it("Benchmark 1: Kernel Mutation Dispatch Latency meets P95 < 50ms invariant", async () => {
    const registry = new ActionAdapterRegistry();
    const testAdapter: IKernelActionAdapter = {
      actionType: "complete_task",
      validatePreconditions: async () => ({ valid: true }),
      execute: async (action) => ({
        success: true,
        actionId: action.id,
        timestamp: Date.now(),
        targetEntity: {
          entityId: "task_bench_1",
          displayName: "Benchmark Task",
          entityType: "task" as any,
          domain: "productivity" as any,
          status: "completed",
        },
      }),
    };

    registry.register("complete_task", testAdapter);
    const mockAudit = new MockCollection();
    const mockReceipt = new MockCollection();
    const kernel = new KernelCapabilityService(registry, {
      auditModel: mockAudit as any,
      receiptModel: mockReceipt as any,
    });

    const userId = "u_perf_kernel";
    const ITERATIONS = 50;
    const latencies: number[] = [];

    // Warm-up run (3 proposals)
    for (let i = 0; i < 3; i++) {
      await kernel.executeAction(userId, {
        id: `warm_${i}`,
        actionType: "complete_task",
        userId,
        idempotencyKey: `warm_idem_${i}`,
        parameters: { taskId: `warm_${i}` },
        timestamp: Date.now(),
        status: "PROPOSED",
      });
    }

    // Benchmark Run: 50 sequential mutations
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = performance.now();
      const res = await kernel.executeAction(userId, {
        id: `bench_act_${i}`,
        actionType: "complete_task",
        userId,
        idempotencyKey: `bench_idem_${i}`,
        parameters: { taskId: `task_${i}` },
        timestamp: Date.now(),
        status: "PROPOSED",
      });
      const t1 = performance.now();
      assert.equal(res.success, true);
      latencies.push(t1 - t0);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(ITERATIONS * 0.5)];
    const p95 = latencies[Math.floor(ITERATIONS * 0.95)];
    const p99 = latencies[Math.floor(ITERATIONS * 0.99)];

    console.log(`\n  [Benchmark 1] Kernel Mutation Latency (N=${ITERATIONS}):`);
    console.log(`    P50: ${p50.toFixed(2)}ms | P95: ${p95.toFixed(2)}ms | P99: ${p99.toFixed(2)}ms`);

    // Invariant: P95 must be under 50ms in warm in-memory execution harness
    assert.ok(p95 < 50, `P95 latency (${p95.toFixed(2)}ms) must be < 50ms`);
  });

  // --------------------------------------------------------------------------
  // BENCHMARK 2: EXECUTION GRAPH PROJECTION LATENCY (< 5ms CACHE HIT)
  // --------------------------------------------------------------------------
  it("Benchmark 2: ExecutionGraphProjectionService achieves sub-5ms cache hit latency", async () => {
    const mockTasks = new MockCollection();
    const mockGoals = new MockCollection();
    const mockGraphDerived = new MockCollection();
    const mockPartitions = new MockCollection();

    const userId = "u_perf_graph";

    // Seed graph revision 5 for the user
    await mockPartitions.create({
      _id: userId,
      userId,
      graphRevision: 5,
      lastUpdatedAt: new Date(),
    });

    // Seed 10 tasks and 2 goals
    await mockGoals.create([
      { goalId: "g1", userId, title: "Master LifeOS", status: "active", version: 1 },
      { goalId: "g2", userId, title: "Physical Mastery", status: "active", version: 1 },
    ]);

    const taskDocs = [];
    for (let i = 0; i < 10; i++) {
      taskDocs.push({
        _id: `t_${i}`,
        taskId: `t_${i}`,
        userId,
        goalId: i < 5 ? "g1" : "g2",
        title: `Task #${i}`,
        status: i === 0 ? "completed" : "pending",
        dependencies: i > 0 ? [`t_${i - 1}`] : [],
        version: 1,
      });
    }
    await mockTasks.create(taskDocs);

    const graphService = new ExecutionGraphProjectionService({
      derivedModel: mockGraphDerived as any,
      revisionModel: mockPartitions as any,
      taskModel: mockTasks as any,
      goalModel: mockGoals as any,
    });

    // 1. Cold Rebuild
    const coldStart = performance.now();
    const coldResult = await graphService.getGraph(userId);
    const coldDuration = performance.now() - coldStart;
    assert.equal(coldResult.source, "COLD_REBUILD");
    assert.ok(coldResult.graph.nodes.length >= 10);

    // 2. Warm Cache Hit Benchmark (50 repetitions)
    const cacheHitLatencies: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      const warmResult = await graphService.getGraph(userId);
      const t1 = performance.now();
      assert.equal(warmResult.source, "CACHE_HIT");
      cacheHitLatencies.push(t1 - t0);
    }

    cacheHitLatencies.sort((a, b) => a - b);
    const hitP50 = cacheHitLatencies[Math.floor(cacheHitLatencies.length * 0.5)];
    const hitP95 = cacheHitLatencies[Math.floor(cacheHitLatencies.length * 0.95)];

    console.log(`\n  [Benchmark 2] Execution Graph Projection Latency:`);
    console.log(`    Cold Rebuild: ${coldDuration.toFixed(2)}ms`);
    console.log(`    Warm Cache Hit P50: ${hitP50.toFixed(2)}ms | P95: ${hitP95.toFixed(2)}ms`);

    // Invariant: Cache hit must be under 5ms
    assert.ok(hitP95 < 5.0, `Cache hit P95 (${hitP95.toFixed(2)}ms) must be < 5.0ms`);
  });

  // --------------------------------------------------------------------------
  // BENCHMARK 3: OUTBOX BATCH PROCESSING THROUGHPUT
  // --------------------------------------------------------------------------
  it("Benchmark 3: Outbox batch processing throughput handles 100 events", async () => {
    const mockOutbox = new MockCollection();
    const mockLedger = new MockCollection();
    const mockPartitions = new MockCollection();

    const leaseManager = new WorkerLeaseManager({
      outboxModel: mockOutbox as any,
      partitionModel: mockPartitions as any,
      ledgerModel: mockLedger as any,
    });

    const registry = new ConsumerRegistry({
      ledgerModel: mockLedger as any,
    });

    let processedCount = 0;

    registry.register({
      name: "bench_consumer",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["domain.benchmark.event"],
      process: async () => {
        processedCount++;
        return { status: "SUCCEEDED" };
      },
    });

    const dispatcher = new DurableOutboxDispatcher({
      workerId: "bench_dispatcher_worker",
      leaseManager,
      consumerHandler: registry.createDispatchHandler(),
      batchSize: 100,
      pollIntervalMs: 100,
    });

    // Ingest 100 benchmark events
    const BATCH_SIZE = 100;
    const now = Date.now();
    const events = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      events.push({
        eventId: `evt_bench_${i}`,
        userId: "u_perf_outbox",
        category: "DOMAIN_EVENT",
        type: "domain.benchmark.event",
        aggregateId: `agg_${i}`,
        aggregateType: "BenchmarkEntity",
        aggregateVersion: 1,
        eventOrdinal: 1,
        causalSequence: i + 1,
        occurredAt: new Date(now),
        deliveryStatus: "PENDING",
        leaseGeneration: 0,
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(now),
      });
    }
    await mockOutbox.create(events);

    const t0 = performance.now();
    const dispatchResult = await dispatcher.executeCycle();
    const t1 = performance.now();
    const totalDurationMs = t1 - t0;

    const throughputPerSec = (BATCH_SIZE / totalDurationMs) * 1000;

    console.log(`\n  [Benchmark 3] Outbox Batch Dispatch Throughput:`);
    console.log(`    Dispatched ${BATCH_SIZE} events in ${totalDurationMs.toFixed(2)}ms`);
    console.log(`    Throughput: ${throughputPerSec.toFixed(0)} events/sec`);

    assert.equal(processedCount, BATCH_SIZE);
    assert.equal(dispatchResult.succeededCount, BATCH_SIZE);
    assert.equal(dispatchResult.failedCount, 0);
  });

  // --------------------------------------------------------------------------
  // BENCHMARK 4: AUTONOMOUS SWEEPER & DAEMON TICK PROCESSING DURATION
  // --------------------------------------------------------------------------
  it("Benchmark 4: Autonomous sweeper and daemon tick execution latency remains low", async () => {
    const userId = "u_perf_sweeper";

    const mockOccurrences = new MockCollection();
    const mockConflictReports = new MockCollection();
    const mockPartitionRevs = new MockCollection();
    const mockLeases = new MockCollection();

    const revService = new TemporalPartitionRevisionService(mockPartitionRevs as any);

    // Seed initial partition revision
    await mockPartitionRevs.create({
      _id: `${userId}:2026-11-02`,
      userId,
      dateStr: "2026-11-02",
      partitionRevision: 1,
      publishedReportRevision: 0,
      sweepLeaseExpiresAt: null,
      sweepWorkerId: null,
    });

    const sweeper = new TemporalScheduleSweeper({
      occurrenceModel: mockOccurrences as any,
      conflictReportModel: mockConflictReports as any,
      revisionModel: mockPartitionRevs as any,
      revisionService: revService,
    });

    const leaseManager = new AutonomousLeaseManager({ leaseModel: mockLeases as any });
    const daemon = new AutonomousExecutionDaemon({
      userId,
      workerId: "daemon_bench",
      leaseManager,
    });

    // Seed 20 occurrences
    const occs = [];
    for (let i = 0; i < 20; i++) {
      occs.push({
        occurrenceId: `occ_bench_${i}`,
        userId,
        dateOnly: "2026-11-02",
        status: "SCHEDULED",
        plannedInterval: {
          dateOnly: "2026-11-02",
          startMinute: 480 + i * 30,
          endMinute: 510 + i * 30,
          durationMinutes: 30,
          startIsoUtc: new Date(Date.now() + i * 30 * 60000).toISOString(),
          endIsoUtc: new Date(Date.now() + (i * 30 + 30) * 60000).toISOString(),
          timezone: "UTC",
          isMidnightCrossing: false,
        },
        version: 1,
      });
    }
    await mockOccurrences.create(occs);

    // 1. Measure Temporal Sweeper
    const tSweeper0 = performance.now();
    const sweepRes = await sweeper.sweepPartition(userId, "2026-11-02", "worker_bench");
    const tSweeper1 = performance.now();
    const sweeperDuration = tSweeper1 - tSweeper0;

    // 2. Measure Daemon Tick
    const tDaemon0 = performance.now();
    let handlerExecuted = false;
    const daemonRes = await daemon.tickUser(
      { userId, timezone: "UTC" },
      {
        categoryA: async () => {
          handlerExecuted = true;
          return { tasksExecuted: 5 };
        },
        categoryB: async () => ({ interventionsCreated: 1 }),
      }
    );
    const tDaemon1 = performance.now();
    const daemonDuration = tDaemon1 - tDaemon0;

    console.log(`\n  [Benchmark 4] Autonomous Sweeper & Daemon Tick Latency:`);
    console.log(`    Temporal Sweeper Duration: ${sweeperDuration.toFixed(2)}ms`);
    console.log(`    Daemon Tick Duration: ${daemonDuration.toFixed(2)}ms`);

    assert.equal(sweepRes.status, "CLEAN");
    assert.equal(daemonRes.executed, true);
    assert.equal(daemonRes.categoryAExecuted, true);
    assert.equal(handlerExecuted, true);
    assert.ok(sweeperDuration < 500, "Sweeper partition duration must be < 500ms");
    assert.ok(daemonDuration < 500, "Daemon tick duration must be < 500ms");
  });

  // --------------------------------------------------------------------------
  // BENCHMARK 5: MEMORY STABILITY & BOUNDED HEAP CONSUMPTION
  // --------------------------------------------------------------------------
  it("Benchmark 5: Heap memory remains bounded over rapid sequential operations", async () => {
    const registry = new ActionAdapterRegistry();
    registry.register("complete_task", {
      actionType: "complete_task",
      validatePreconditions: async () => ({ valid: true }),
      execute: async (p) => ({ success: true, actionId: p.id, timestamp: Date.now() }),
    });

    const mockAudit = new MockCollection();
    const mockReceipt = new MockCollection();
    const kernel = new KernelCapabilityService(registry, {
      auditModel: mockAudit as any,
      receiptModel: mockReceipt as any,
    });

    const userId = "u_mem_test";
    const CYCLES = 200;

    if (global.gc) global.gc();
    const initialHeap = process.memoryUsage().heapUsed;

    for (let i = 0; i < CYCLES; i++) {
      await kernel.executeAction(userId, {
        id: `mem_act_${i}`,
        actionType: "complete_task",
        userId,
        idempotencyKey: `mem_idem_${i}`,
        parameters: { index: i, note: "Memory stability test iteration" },
        timestamp: Date.now(),
        status: "PROPOSED",
      });
    }

    if (global.gc) global.gc();
    const finalHeap = process.memoryUsage().heapUsed;
    const deltaMb = (finalHeap - initialHeap) / (1024 * 1024);

    console.log(`\n  [Benchmark 5] Memory Stability over ${CYCLES} operations:`);
    console.log(`    Initial Heap: ${(initialHeap / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`    Final Heap:   ${(finalHeap / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`    Heap Delta:   ${deltaMb.toFixed(2)} MB`);

    // Invariant: Heap growth over 200 light in-memory actions must remain bounded (< 50 MB without forced GC)
    assert.ok(deltaMb < 50, `Heap delta (${deltaMb.toFixed(2)} MB) must be < 50 MB`);
  });
});
