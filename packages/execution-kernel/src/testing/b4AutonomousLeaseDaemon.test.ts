import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AutonomousLeaseManager } from "../autonomous/AutonomousLeaseManager";
import { AutonomousExecutionDaemon } from "../autonomous/AutonomousExecutionDaemon";
import { parseFencingTokenString, validateFencingEpoch } from "../autonomous/FencingToken";

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

  async create(docs: any | any[], _opts?: any): Promise<any[]> {
    const arr = Array.isArray(docs) ? docs : [docs];
    const created = arr.map((item) => {
      const id = String(item._id || item.userId || `id_${Date.now()}_${Math.random()}`);
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
      if (k === "_id" || k === "userId") {
        if (String(doc[k]) !== String(v)) return false;
        continue;
      }
      if (k === "$or" && Array.isArray(v)) {
        const matchesAny = v.some((subQ) => this.matchesQuery(doc, subQ));
        if (!matchesAny) return false;
        continue;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
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
  }
}

describe("Milestone B4 — Loop 3: Distributed Lease Fencing & Heartbeat", () => {
  let mockLeaseColl: MockMemoryCollection<any>;
  let leaseManager: AutonomousLeaseManager;
  const testUserId = "usr_b4_lease_test";

  beforeEach(() => {
    mockLeaseColl = new MockMemoryCollection();
    leaseManager = new AutonomousLeaseManager({ leaseModel: mockLeaseColl });
  });

  it("B4-L3-01: Idempotent lease creation and initial acquisition", async () => {
    const token = await leaseManager.acquireLease(testUserId, "worker-A", 10000);
    assert.ok(token);
    assert.equal(token.epoch, 1);
    assert.equal(token.workerId, "worker-A");
    assert.equal(token.token, "epoch:1:worker:worker-A");

    const parsed = parseFencingTokenString(token.token);
    assert.ok(parsed);
    assert.equal(parsed.epoch, 1);
    assert.equal(parsed.workerId, "worker-A");

    const leaseDoc = await leaseManager.getLease(testUserId);
    assert.ok(leaseDoc);
    assert.equal(leaseDoc.status, "ACTIVE");
    assert.equal(leaseDoc.epoch, 1);
    assert.equal(leaseDoc.leaseHolder, "worker-A");
  });

  it("B4-L3-02: Mutual exclusion prevents concurrent acquisition while active", async () => {
    const tokenA = await leaseManager.acquireLease(testUserId, "worker-A", 10000);
    assert.ok(tokenA);

    // Worker B attempts acquisition while Worker A holds active lease
    const tokenB = await leaseManager.acquireLease(testUserId, "worker-B", 10000);
    assert.equal(tokenB, null);

    const isAActive = await leaseManager.isLeaseActive(testUserId, "worker-A", tokenA.epoch);
    assert.equal(isAActive, true);
  });

  it("B4-L3-03: Heartbeat renewal extends expiration without incrementing epoch", async () => {
    const tokenA = await leaseManager.acquireLease(testUserId, "worker-A", 10000);
    assert.ok(tokenA);
    assert.equal(tokenA.epoch, 1);

    const renewedToken = await leaseManager.renewLease(testUserId, "worker-A", tokenA.epoch, 20000);
    assert.ok(renewedToken);
    assert.equal(renewedToken.epoch, 1);
    assert.ok(renewedToken.expiresAt.getTime() > tokenA.expiresAt.getTime());
  });

  it("B4-L3-04: Expiration enables takeover with strictly monotonic epoch increment", async () => {
    const tokenA = await leaseManager.acquireLease(testUserId, "worker-A", 50);
    assert.ok(tokenA);
    assert.equal(tokenA.epoch, 1);

    // Simulate expiration by setting expiresAt in the past
    await mockLeaseColl.updateOne(
      { userId: testUserId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );

    // Worker B acquires expired lease
    const tokenB = await leaseManager.acquireLease(testUserId, "worker-B", 10000);
    assert.ok(tokenB);
    assert.equal(tokenB.epoch, 2);
    assert.equal(tokenB.workerId, "worker-B");
    assert.equal(tokenB.token, "epoch:2:worker:worker-B");
  });

  it("B4-L3-05: Fencing rejection prevents superseded worker from renewing or modifying", async () => {
    const tokenA = await leaseManager.acquireLease(testUserId, "worker-A", 50);
    assert.ok(tokenA);
    assert.equal(tokenA.epoch, 1);

    // Fast-forward expiration and Worker B takeover at epoch 2
    await mockLeaseColl.updateOne(
      { userId: testUserId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );
    const tokenB = await leaseManager.acquireLease(testUserId, "worker-B", 10000);
    assert.ok(tokenB);
    assert.equal(tokenB.epoch, 2);

    // Stalled worker A attempts renewal with stale epoch 1
    const staleRenew = await leaseManager.renewLease(testUserId, "worker-A", tokenA.epoch, 10000);
    assert.equal(staleRenew, null);

    // Validate fencing epoch check against aggregate epoch
    const validation = validateFencingEpoch(tokenA, 2);
    assert.equal(validation.valid, false);
    assert.ok(validation.reason?.includes("superseded"));
  });

  it("B4-L3-06: AutonomousExecutionDaemon step lifecycle and release on stop", async () => {
    let cycleExecutedCount = 0;
    let lastTokenSeen: any = null;

    const daemon = new AutonomousExecutionDaemon({
      userId: testUserId,
      workerId: "daemon-worker-1",
      leaseManager,
      leaseTtlMs: 5000,
      onCycle: async (token) => {
        cycleExecutedCount++;
        lastTokenSeen = token;
      },
    });

    const stepResult = await daemon.step();
    assert.equal(stepResult.executed, true);
    assert.equal(cycleExecutedCount, 1);
    assert.ok(lastTokenSeen);
    assert.equal(lastTokenSeen.epoch, 1);
    assert.equal(lastTokenSeen.workerId, "daemon-worker-1");

    // Daemon release on stop
    await daemon.stop();
    assert.equal(daemon.getActiveToken(), null);

    const leaseDoc = await leaseManager.getLease(testUserId);
    assert.equal(leaseDoc?.status, "RELEASED");
  });
});

