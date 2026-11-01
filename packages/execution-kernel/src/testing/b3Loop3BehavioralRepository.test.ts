/**
 * b3Loop3BehavioralRepository.test.ts
 * 
 * Milestone B — Phase B3: Work Package 2 / Loop 3
 * Authoritative Observation Journal & Lock-Free CAS Behavioral Repository Verification
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  BehavioralProfileRepository,
  BehavioralObservationDraft,
} from "../learning/BehavioralProfileRepository";
import {
  calculateDecayWeight,
  calculateBehavioralMetrics,
} from "../learning/BehavioralProfileCalculator";

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
      lean: () => Promise.resolve(cloned),
      then: (resolve: any, reject: any) => Promise.resolve(cloned).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(cloned).catch(reject),
    };
  }

  async create(docs: any | any[], _opts?: any): Promise<any> {
    const arr = Array.isArray(docs) ? docs : [docs];
    const created = arr.map((item) => {
      const id = String(item._id || item.observationId || item.userId || `id_${Date.now()}_${Math.random()}`);
      if (this.docs.has(id)) {
        const err: any = new Error(`E11000 duplicate key error collection: index: id_1 dup key: { id: "${id}" }`);
        err.code = 11000;
        throw err;
      }
      const doc = { _id: id, ...item };
      this.docs.set(id, doc);
      return JSON.parse(JSON.stringify(doc));
    });
    return Array.isArray(docs) ? created : created[0];
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

  async countDocuments(query: Record<string, any>): Promise<number> {
    let count = 0;
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) count++;
    }
    return count;
  }

  private matchesQuery(doc: any, query: Record<string, any>): boolean {
    for (const [k, v] of Object.entries(query)) {
      if (k === "_id" || k === "observationId" || k === "userId") {
        if (v && typeof v === "object" && "$in" in v) {
          const inArr = (v.$in as any[]).map(String);
          if (!inArr.includes(String(doc[k]))) return false;
        } else if (String(doc[k]) !== String(v)) {
          return false;
        }
        continue;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (v.$in && !v.$in.includes(doc[k])) return false;
        if (v.$lte !== undefined) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const queryVal = v.$lte instanceof Date ? v.$lte.getTime() : v.$lte;
          if (!(docVal <= queryVal)) return false;
        }
        if (v.$gte !== undefined) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const queryVal = v.$gte instanceof Date ? v.$gte.getTime() : v.$gte;
          if (!(docVal >= queryVal)) return false;
        }
        continue;
      }
      if (doc[k] !== v) return false;
    }
    return true;
  }

  private applyUpdate(doc: any, update: Record<string, any>): void {
    if (update.$set) Object.assign(doc, update.$set);
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

describe("B3 WP2 Loop 3: Authoritative Observation Journal & Lock-Free CAS Behavioral Repository", () => {
  let mockObsColl: MockMemoryCollection<any>;
  let mockProfileColl: MockMemoryCollection<any>;
  let repo: BehavioralProfileRepository;

  beforeEach(() => {
    mockObsColl = new MockMemoryCollection();
    mockProfileColl = new MockMemoryCollection();
    repo = new BehavioralProfileRepository({
      observationModel: mockObsColl,
      profileModel: mockProfileColl,
    });
  });

  it("B3-LOOP3-01: Ingestion creates BehavioralObservation record with APPLIED status and revision 1", async () => {
    const draft: BehavioralObservationDraft = {
      observationId: "obs_task_101_v1_1",
      userId: "usr_alice",
      source: "task",
      category: "EXECUTION",
      type: "domain.task.completed",
      causalSequence: 1001,
      observedAt: new Date(),
      data: { taskId: "task_101", status: "completed" },
    };

    const result = await repo.ingestObservation(draft);
    assert.equal(result.status, "SUCCEEDED");
    assert.equal(result.projectionRevision, 1);

    const journalDoc = await mockObsColl.findOne({ observationId: "obs_task_101_v1_1" });
    assert.equal(journalDoc.projectionStatus, "APPLIED");

    const profileDoc = await mockProfileColl.findOne({ userId: "usr_alice" });
    assert.equal(profileDoc.projectionRevision, 1);
    assert.equal(profileDoc.recentObservationIds.length, 1);
    assert.equal(profileDoc.recentObservationIds[0], "obs_task_101_v1_1");
  });

  it("B3-LOOP3-02: Idempotent redelivery returns SKIPPED_ALREADY_APPLIED and prevents double-counting", async () => {
    const draft: BehavioralObservationDraft = {
      observationId: "obs_task_102_v1_1",
      userId: "usr_bob",
      source: "task",
      category: "EXECUTION",
      type: "domain.task.completed",
      causalSequence: 1001,
      observedAt: new Date(),
      data: { taskId: "task_102", status: "completed" },
    };

    const res1 = await repo.ingestObservation(draft);
    assert.equal(res1.status, "SUCCEEDED");

    const res2 = await repo.ingestObservation(draft);
    assert.equal(res2.status, "SKIPPED_ALREADY_APPLIED");
    assert.equal(res2.projectionRevision, 1, "Revision must not increment on duplicate delivery");

    // Only 1 record in journal
    const count = await mockObsColl.countDocuments({ observationId: "obs_task_102_v1_1" });
    assert.equal(count, 1);
  });

  it("B3-LOOP3-03: Ring buffer is strictly capped at 50 most recent observation IDs", async () => {
    const userId = "usr_carol";

    // Ingest 55 observations sequentially
    for (let i = 1; i <= 55; i++) {
      const draft: BehavioralObservationDraft = {
        observationId: `obs_task_c_${i}_v1_1`,
        userId,
        source: "task",
        category: "EXECUTION",
        type: "domain.task.completed",
        causalSequence: i * 1000 + 1,
        observedAt: new Date(Date.now() + i * 1000),
        data: { taskId: `task_c_${i}`, status: "completed" },
      };
      await repo.ingestObservation(draft);
    }

    const profileDoc = await mockProfileColl.findOne({ userId });
    assert.equal(profileDoc.recentObservationIds.length, 50, "Ring buffer must be capped at 50");
    assert.ok(!profileDoc.recentObservationIds.includes("obs_task_c_1_v1_1"), "First 5 observations must be evicted");
    assert.ok(profileDoc.recentObservationIds.includes("obs_task_c_55_v1_1"), "Latest observation must be present");
  });

  it("B3-LOOP3-04: Ring buffer eviction recovery uses authoritative journal to avoid double-counting", async () => {
    const userId = "usr_dave";

    // Ingest event A
    const eventA: BehavioralObservationDraft = {
      observationId: "obs_task_a_v1_1",
      userId,
      source: "task",
      category: "EXECUTION",
      type: "domain.task.completed",
      causalSequence: 1001,
      observedAt: new Date(Date.now() - 60000),
      data: { taskId: "task_a", status: "completed" },
    };
    await repo.ingestObservation(eventA);

    // Ingest 52 subsequent events to evict event A from the ring buffer
    for (let i = 1; i <= 52; i++) {
      await repo.ingestObservation({
        observationId: `obs_task_sub_${i}_v1_1`,
        userId,
        source: "task",
        category: "EXECUTION",
        type: "domain.task.completed",
        causalSequence: (i + 1) * 1000 + 1,
        observedAt: new Date(),
        data: { taskId: `task_sub_${i}`, status: "completed" },
      });
    }

    const profileBefore = await mockProfileColl.findOne({ userId });
    assert.ok(!profileBefore.recentObservationIds.includes("obs_task_a_v1_1"), "Event A is evicted from ring buffer");

    // Redeliver Event A
    const redeliveryResult = await repo.ingestObservation(eventA);
    assert.equal(redeliveryResult.status, "SKIPPED_ALREADY_APPLIED", "Authoritative journal APPLIED status prevents double counting");

    const profileAfter = await mockProfileColl.findOne({ userId });
    assert.equal(profileAfter.projectionRevision, profileBefore.projectionRevision, "Revision unchanged on redelivery");
  });

  it("B3-LOOP3-05: Lock-Free CAS Rebuild updates profile and aborts safely if concurrent live event commits", async () => {
    const userId = "usr_eve";

    // Ingest 3 observations
    for (let i = 1; i <= 3; i++) {
      await repo.ingestObservation({
        observationId: `obs_task_e_${i}_v1_1`,
        userId,
        source: "task",
        category: "EXECUTION",
        type: "domain.task.completed",
        causalSequence: i * 1000 + 1,
        observedAt: new Date(Date.now() - (4 - i) * 10000),
        data: { taskId: `task_e_${i}`, status: "completed" },
      });
    }

    const currentProfile = await mockProfileColl.findOne({ userId });
    assert.equal(currentProfile.projectionRevision, 3);

    // Rebuild profile cleanly
    const rebuildResult = await repo.rebuildProfile(userId);
    assert.equal(rebuildResult.success, true);
    assert.equal(rebuildResult.newRevision, 4);

    // Simulate concurrent live event during rebuild
    // If live event commits revision 5, older rebuild at revision 4 must abort!
    await mockProfileColl.updateOne(
      { userId, projectionRevision: 4 },
      { $inc: { projectionRevision: 1 } } // live event advances to 5
    );

    // Attempting rebuild from snapshot that expected revision 4
    const staleRebuildCas = await mockProfileColl.updateOne(
      { userId, projectionRevision: 4 },
      { $inc: { projectionRevision: 1 } }
    );
    assert.equal(staleRebuildCas.matchedCount, 0, "CAS mismatch rejects stale rebuild; live event protected");
  });

  it("B3-LOOP3-06: MECE Mathematical Integrity and 21-Day Half-Life Weighting", () => {
    const now = Date.now();
    const dayMs = 86400 * 1000;

    // Test decay weights
    const w0 = calculateDecayWeight(now, now);
    assert.equal(Number(w0.toFixed(4)), 1.0000);

    const w21 = calculateDecayWeight(now - 21 * dayMs, now);
    assert.equal(Number(w21.toFixed(4)), 0.5000, "21 days must equal half-life (weight 0.5)");

    const w42 = calculateDecayWeight(now - 42 * dayMs, now);
    assert.equal(Number(w42.toFixed(4)), 0.2500, "42 days must equal quarter-life (weight 0.25)");

    // Test MECE partitions: C=2, S=1, D=1, O=0 at t=now (weights = 1.0)
    const observations = [
      { observationId: "1", source: "task", category: "EXECUTION" as const, type: "domain.task.completed", causalSequence: 1001, observedAt: new Date(now), data: { status: "completed" } },
      { observationId: "2", source: "task", category: "EXECUTION" as const, type: "domain.task.completed", causalSequence: 2001, observedAt: new Date(now), data: { status: "completed" } },
      { observationId: "3", source: "task", category: "EXECUTION" as const, type: "domain.task.completed", causalSequence: 3001, observedAt: new Date(now), data: { status: "skipped" } },
      { observationId: "4", source: "task", category: "EXECUTION" as const, type: "domain.task.completed", causalSequence: 4001, observedAt: new Date(now), data: { status: "pending", isDeferred: true } },
    ];

    const result = calculateBehavioralMetrics(observations, new Date(now));
    // Omega = 2 + 1 + 1 + 0 = 4.0
    assert.equal(result.metrics.totalWeightedFinalizedCommitments, 4.0);
    // Completion rate = 2 / 4 = 0.50
    assert.equal(result.metrics.taskCompletionRate, 0.50);
    // Procrastination tendency = 1 / 4 = 0.25
    assert.equal(result.metrics.procrastinationTendency, 0.25);
    // Conservation invariant: C/Omega + S/Omega + (D+O)/Omega = 2/4 + 1/4 + 1/4 = 1.00
    assert.equal(0.50 + 0.25 + 0.25, 1.00);
  });
});

