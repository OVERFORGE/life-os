import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ProactiveActionJournal, ProactiveActionDraft } from "../proactive/ProactiveActionJournal";
import { InterruptionCostEvaluator } from "../proactive/InterruptionCostEvaluator";
import { IProactiveCandidate } from "../proactive/contracts/ProactiveContracts";

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
      const id = String(item._id || item.actionId || `id_${Date.now()}_${Math.random()}`);
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

  private matchesQuery(doc: any, query: Record<string, any>): boolean {
    for (const [k, v] of Object.entries(query)) {
      if (k === "_id" || k === "actionId" || k === "userId" || k === "dedupKey") {
        if (String(doc[k]) !== String(v)) return false;
        continue;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (v.$gte !== undefined) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const queryVal = v.$gte instanceof Date ? v.$gte.getTime() : v.$gte;
          if (!(docVal >= queryVal)) return false;
        }
        if (v.$lte !== undefined) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const queryVal = v.$lte instanceof Date ? v.$lte.getTime() : v.$lte;
          if (!(docVal <= queryVal)) return false;
        }
        continue;
      }
      if (doc[k] !== v) return false;
    }
    return true;
  }

  private applyUpdate(doc: any, update: Record<string, any>): void {
    if (update.$set) Object.assign(doc, update.$set);
  }
}

describe("Milestone B4 — Loop 4: Durable Action Journal & Cost Engine", () => {
  let mockColl: MockMemoryCollection<any>;
  let journal: ProactiveActionJournal;
  let evaluator: InterruptionCostEvaluator;
  const testUserId = "usr_b4_proactive_test";

  beforeEach(() => {
    mockColl = new MockMemoryCollection();
    journal = new ProactiveActionJournal({ model: mockColl });
    evaluator = InterruptionCostEvaluator.getInstance();
  });

  it("B4-L4-01: ProactiveActionJournal records candidate and transitions through lifecycle", async () => {
    const draft: ProactiveActionDraft = {
      actionId: "act_b4_001",
      userId: testUserId,
      candidateId: "cand_001",
      autonomyLevel: "L3",
      domain: "SCHEDULE",
      triggerRule: "rule_morning_rebalance",
      confidenceScore: 0.92,
      actionValueScore: 0.85,
      interruptionCostScore: 0.25,
      dedupKey: "dedup_rebalance_20261101",
    };

    const created = await journal.recordCandidate(draft);
    assert.equal(created.actionId, "act_b4_001");
    assert.equal(created.executionCommitted, false);
    assert.equal(created.notificationDispatched, false);

    // Mark dispatched
    const dispatched = await journal.markDispatched("act_b4_001");
    assert.equal(dispatched, true);

    // Record execution outcome
    const committed = await journal.recordExecutionOutcome("act_b4_001", { committed: true });
    assert.equal(committed, true);

    // Record user feedback
    const feedback = await journal.recordUserFeedback("act_b4_001", "APPROVED");
    assert.equal(feedback, true);

    // Verify persisted state
    const doc = await mockColl.findOne({ actionId: "act_b4_001" });
    assert.ok(doc);
    assert.equal(doc.notificationDispatched, true);
    assert.equal(doc.executionCommitted, true);
    assert.equal(doc.userResponse, "APPROVED");
  });

  it("B4-L4-02: Deduplication window prevents repeated proactive triggering within cooldown", async () => {
    const dedupKey = "dedup_hydration_check";
    const now = Date.now();

    await journal.recordCandidate({
      actionId: "act_b4_002",
      userId: testUserId,
      candidateId: "cand_002",
      autonomyLevel: "L2",
      domain: "HEALTH",
      triggerRule: "rule_hydration",
      confidenceScore: 0.88,
      actionValueScore: 0.70,
      interruptionCostScore: 0.30,
      dedupKey,
      executedAt: now - 1000 * 60 * 30, // 30 minutes ago
    });

    // 1-hour cooldown window: 30 mins ago is duplicate
    const isDup = await journal.isDuplicate(dedupKey, 1000 * 60 * 60);
    assert.equal(isDup, true);

    // 15-minute cooldown window: 30 mins ago has expired
    const isDupExpired = await journal.isDuplicate(dedupKey, 1000 * 60 * 15);
    assert.equal(isDupExpired, false);
  });

  it("B4-L4-03: Interruption cost is mathematically strictly bounded within [0.0, 1.0]", () => {
    const candidate: IProactiveCandidate = {
      candidateId: "cand_high_fatigue",
      userId: testUserId,
      autonomyLevel: "L2",
      urgency: "MEDIUM",
      domain: "TASK",
      proposal: {} as any,
      rationale: "Extreme load check",
      requiredConfidence: 0.8,
      dedupKey: "dedup_fatigue",
      actionValueScore: 0.8,
      estimatedInterruptionCost: 0.5,
      confidenceScore: 0.9,
      createdAt: Date.now(),
    };

    // Extreme context: meeting, deep work, maximum cognitive load, high notification fatigue
    const evalResult = evaluator.evaluate(candidate, {
      inMeeting: true,
      inDeepWork: true,
      cognitiveLoad: 1.0,
      recentNotificationCountToday: 20,
      isQuietHours: false,
    });

    assert.ok(evalResult.cost >= 0.0, `Cost ${evalResult.cost} is below 0.0`);
    assert.ok(evalResult.cost <= 1.0, `Cost ${evalResult.cost} exceeds 1.0`);
    assert.equal(evalResult.shouldInterrupt, false);
  });

  it("B4-L4-04: Strict Emergency Bypass: ONLY CRITICAL_EMERGENCY overrides quiet hours/DND", () => {
    const emergencyCandidate: IProactiveCandidate = {
      candidateId: "cand_emergency",
      userId: testUserId,
      autonomyLevel: "L5",
      urgency: "CRITICAL_EMERGENCY",
      domain: "SYSTEM",
      proposal: {} as any,
      rationale: "Server fire / security compromise",
      requiredConfidence: 0.9,
      dedupKey: "dedup_fire",
      actionValueScore: 1.0,
      estimatedInterruptionCost: 0.0,
      confidenceScore: 1.0,
      createdAt: Date.now(),
    };

    const res = evaluator.evaluate(emergencyCandidate, {
      isQuietHours: true,
    });

    assert.equal(res.shouldInterrupt, true);
    assert.equal(res.cost, 0.0);
    assert.ok(res.rationale.includes("strictly overrides Quiet Hours"));
  });

  it("B4-L4-05: Non-critical actions (CRITICAL, HIGH, MEDIUM) are strictly suppressed during Quiet Hours", () => {
    const criticalCandidate: IProactiveCandidate = {
      candidateId: "cand_critical_non_emergency",
      userId: testUserId,
      autonomyLevel: "L3",
      urgency: "CRITICAL", // Not CRITICAL_EMERGENCY!
      domain: "SCHEDULE",
      proposal: {} as any,
      rationale: "Urgent schedule sync",
      requiredConfidence: 0.9,
      dedupKey: "dedup_sync",
      actionValueScore: 0.95,
      estimatedInterruptionCost: 0.2,
      confidenceScore: 0.95,
      createdAt: Date.now(),
    };

    const res = evaluator.evaluate(criticalCandidate, {
      isQuietHours: true,
    });

    assert.equal(res.shouldInterrupt, false);
    assert.equal(res.cost, 1.0);
    assert.ok(res.rationale.includes("Suppressed due to active quiet hours"));
  });

  it("B4-L4-06: Conservative Unknown State Handling defaults to high cost (0.85) when user context is omitted", () => {
    const standardCandidate: IProactiveCandidate = {
      candidateId: "cand_unknown_context",
      userId: testUserId,
      autonomyLevel: "L2",
      urgency: "MEDIUM",
      domain: "TASK",
      proposal: {} as any,
      rationale: "Follow up on pending task",
      requiredConfidence: 0.8,
      dedupKey: "dedup_task_followup",
      actionValueScore: 0.70,
      estimatedInterruptionCost: 0.3,
      confidenceScore: 0.85,
      createdAt: Date.now(),
    };

    // No context passed (system is blind to user state)
    const res = evaluator.evaluate(standardCandidate, null);

    assert.equal(res.cost, 0.85);
    assert.equal(res.shouldInterrupt, false);
    assert.ok(res.rationale.includes("Conservative high-cost suppression"));
  });
});

