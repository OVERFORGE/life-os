/**
 * b2ConsumerQuarantine.test.ts
 * 
 * Loop 4 (WP2) Verification Suite:
 * - Consumer registration & selective routing by category and type
 * - Sibling consumer failure isolation
 * - Partial acknowledgment tracking via ConsumerProcessingLedger (prevents duplicate execution of succeeded siblings)
 * - Poison pill quarantine to DEAD_LETTER
 * - SKIPPED_STALE ledger recording
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ConsumerRegistry, ICanonicalConsumer } from "../events/consumers/ConsumerRegistry";
import { DurableOutboxDispatcher } from "../events/dispatch/DurableOutboxDispatcher";
import { WorkerLeaseManager } from "../events/dispatch/WorkerLeaseManager";
import { matchesMongoQuery } from "./helpers/mockMongoMatcher";

class MockLedgerCollection {
  public docs: Map<string, any> = new Map();

  async findOne(query: Record<string, any>): Promise<any | null> {
    for (const doc of this.docs.values()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (doc[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) return JSON.parse(JSON.stringify(doc));
    }
    return null;
  }

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, opts?: any): Promise<any> {
    const existing = await this.findOne(filter);
    if (existing) {
      const merged = { ...existing, ...(update.$set || {}) };
      this.docs.set(merged.ledgerKey, merged);
      return JSON.parse(JSON.stringify(merged));
    }
    if (opts?.upsert) {
      const newDoc = { ...(update.$set || {}) };
      this.docs.set(newDoc.ledgerKey, newDoc);
      return JSON.parse(JSON.stringify(newDoc));
    }
    return null;
  }
}

class MockOutboxCollection {
  public docs: Map<string, any> = new Map();

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

  async findById(id: string): Promise<any> {
    const doc = this.docs.get(id);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  async create(docs: any | any[]): Promise<any[]> {
    const arr = Array.isArray(docs) ? docs : [docs];
    return arr.map((item) => {
      const id = item._id || item.eventId || `id_${Date.now()}_${Math.random()}`;
      const doc = { _id: id, ...item };
      this.docs.set(id, doc);
      return JSON.parse(JSON.stringify(doc));
    });
  }

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>): Promise<any | null> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return JSON.parse(JSON.stringify(doc));
      }
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

  private matchesQuery(doc: Record<string, any>, query: Record<string, any>): boolean {
    return matchesMongoQuery(doc, query);
  }

  private applyUpdate(doc: Record<string, any>, update: Record<string, any>): void {
    if (update.$set) Object.assign(doc, update.$set);
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] ?? 0) + (v as number);
      }
    }
  }
}

describe("LOOP 4 (WP2): Consumer Registration, Partial Ack & Dead-Letter Quarantine", () => {
  let mockLedger: MockLedgerCollection;
  let mockOutbox: MockOutboxCollection;
  let registry: ConsumerRegistry;
  let leaseManager: WorkerLeaseManager;

  beforeEach(() => {
    mockLedger = new MockLedgerCollection();
    mockOutbox = new MockOutboxCollection();
    registry = new ConsumerRegistry({ ledgerModel: mockLedger });
    leaseManager = new WorkerLeaseManager({ outboxModel: mockOutbox });
  });

  it("CONSUMER-01: Multiple matching consumers are identified and dispatched by category & type", async () => {
    let consumer1Ran = false;
    let consumer2Ran = false;
    let consumer3Ran = false;

    registry.register({
      name: "TaskDomainConsumer",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["domain.task.completed"],
      process: async () => {
        consumer1Ran = true;
        return { status: "SUCCEEDED" };
      },
    });

    registry.register({
      name: "WildcardDomainConsumer",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["*"],
      process: async () => {
        consumer2Ran = true;
        return { status: "SUCCEEDED" };
      },
    });

    registry.register({
      name: "TelemetryOnlyConsumer",
      targetCategories: ["TELEMETRY_EVENT"],
      targetTypes: ["*"],
      process: async () => {
        consumer3Ran = true;
        return { status: "SUCCEEDED" };
      },
    });

    const envelope = {
      eventId: "evt_task_t1_v1_1_completed",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.task.completed",
      aggregateId: "t1",
      aggregateType: "task" as const,
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      correlationId: "c1",
      source: "kernel",
      payload: {},
    };

    const res = await registry.dispatch(envelope as any, 1);
    assert.equal(res.success, true);
    assert.equal(consumer1Ran, true, "TaskDomainConsumer must execute");
    assert.equal(consumer2Ran, true, "WildcardDomainConsumer must execute");
    assert.equal(consumer3Ran, false, "TelemetryOnlyConsumer must NOT execute");
  });

  it("CONSUMER-02: Sibling consumer isolation & partial acknowledgment on redelivery", async () => {
    let alphaRunCount = 0;
    let betaRunCount = 0;
    let betaShouldFail = true;

    registry.register({
      name: "ConsumerAlpha",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["*"],
      process: async () => {
        alphaRunCount++;
        return { status: "SUCCEEDED" };
      },
    });

    registry.register({
      name: "ConsumerBeta",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["*"],
      process: async () => {
        betaRunCount++;
        if (betaShouldFail) {
          return { status: "FAILED_RETRYABLE", error: "Simulated transient failure in Beta" };
        }
        return { status: "SUCCEEDED" };
      },
    });

    const envelope = {
      eventId: "evt_task_t2_v1_1_completed",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.task.completed",
      aggregateId: "t2",
      aggregateType: "task" as const,
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 1001,
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      correlationId: "c2",
      source: "kernel",
      payload: {},
    };

    // First attempt: Alpha succeeds, Beta fails
    const attempt1 = await registry.dispatch(envelope as any, 1);
    assert.equal(attempt1.success, false, "Attempt 1 overall status must be false because Beta failed");
    assert.equal(alphaRunCount, 1);
    assert.equal(betaRunCount, 1);

    // Verify Alpha was durably recorded as SUCCEEDED in the ledger
    const alphaLedger = await mockLedger.findOne({
      ledgerKey: "usr_alice:ConsumerAlpha:evt_task_t2_v1_1_completed",
    });
    assert.ok(alphaLedger);
    assert.equal(alphaLedger.status, "SUCCEEDED");

    // Second attempt (redelivery): Beta now recovers
    betaShouldFail = false;
    const attempt2 = await registry.dispatch(envelope as any, 2);
    assert.equal(attempt2.success, true);

    // Crucial Invariant: Alpha MUST NOT re-run! (Partial Acknowledgment Isolation)
    assert.equal(alphaRunCount, 1, "ConsumerAlpha must NOT re-execute after prior durable success");
    assert.equal(betaRunCount, 2, "ConsumerBeta must re-execute and now succeed");
    assert.deepEqual(attempt2.skippedConsumers, ["ConsumerAlpha"]);
    assert.deepEqual(attempt2.processedConsumers, ["ConsumerBeta"]);
  });

  it("CONSUMER-03: Poison pill event reaches DEAD_LETTER after maxAttempts without crashing dispatcher", async () => {
    registry.register({
      name: "PoisonConsumer",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["*"],
      process: async () => {
        throw new Error("Fatal parsing crash on corrupt payload");
      },
    });

    await mockOutbox.create({
      _id: "evt_poison",
      eventId: "evt_task_t_bad_v1_1_error",
      userId: "usr_alice",
      category: "DOMAIN_EVENT",
      type: "domain.task.corrupt",
      aggregateId: "t_bad",
      aggregateVersion: 1,
      causalSequence: 1001,
      deliveryStatus: "PENDING",
      nextAttemptAt: new Date(Date.now() - 1000),
      leaseGeneration: 0,
      attempts: 0,
    });

    const dispatcher = new DurableOutboxDispatcher({
      workerId: "test_worker",
      maxAttempts: 3,
      leaseManager,
      consumerHandler: registry.createDispatchHandler(),
    });

    // Run 3 dispatch cycles (simulating retries)
    for (let i = 0; i < 3; i++) {
      // Force nextAttemptAt to past before each cycle to simulate time passing
      const doc = mockOutbox.docs.get("evt_poison");
      doc.nextAttemptAt = new Date(Date.now() - 1000);
      await dispatcher.executeCycle();
    }

    const deadEvent = await mockOutbox.findById("evt_poison");
    assert.equal(deadEvent.deliveryStatus, "DEAD_LETTER");
    assert.match(deadEvent.failureReason, /Fatal parsing crash on corrupt payload/);
  });

  it("CONSUMER-04: SKIPPED_STALE status properly recorded in ledger when consumer encounters older event", async () => {
    registry.register({
      name: "StaleCheckConsumer",
      targetCategories: ["DOMAIN_EVENT"],
      targetTypes: ["*"],
      process: async () => {
        return { status: "SKIPPED_STALE" };
      },
    });

    const envelope = {
      eventId: "evt_goal_g1_v3_1_stale",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.goal.progress_updated",
      aggregateId: "g1",
      aggregateType: "goal" as const,
      aggregateVersion: 3,
      eventOrdinal: 1,
      causalSequence: 3001,
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      correlationId: "c_stale",
      source: "kernel",
      payload: {},
    };

    const res = await registry.dispatch(envelope as any, 1);
    assert.equal(res.success, true);

    const ledger = await mockLedger.findOne({
      ledgerKey: "usr_alice:StaleCheckConsumer:evt_goal_g1_v3_1_stale",
    });
    assert.ok(ledger);
    assert.equal(ledger.status, "SKIPPED_STALE");
  });
});
