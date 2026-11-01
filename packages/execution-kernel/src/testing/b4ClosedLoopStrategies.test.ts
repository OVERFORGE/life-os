import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DualTierScheduler } from "../autonomous/DualTierScheduler";
import { MorningBriefingStrategy } from "../autonomous/strategies/MorningBriefingStrategy";
import { ScheduleRebalancerStrategy } from "../autonomous/strategies/ScheduleRebalancerStrategy";
import { CircadianEnergyAlignmentStrategy } from "../autonomous/strategies/CircadianEnergyAlignmentStrategy";
import { AutonomousStrategyRegistry } from "../autonomous/strategies/AutonomousStrategyRegistry";
import { ProactiveActionJournal } from "../proactive/ProactiveActionJournal";

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
        continue;
      }
      if (doc[k] !== v) return false;
    }
    return true;
  }
}

describe("Milestone B4 — Loop 5: Closed-Loop Adaptive Strategies & Dual-Tier Scheduler", () => {
  let scheduler: DualTierScheduler;
  const testUserId = "usr_b4_loop5_test";

  beforeEach(() => {
    scheduler = new DualTierScheduler();
  });

  it("B4-L5-01: DualTierScheduler Tier 1 completes in <5ms with in-memory gating", () => {
    const res = scheduler.evaluateTier1(testUserId, {
      isQuietHours: false,
    });

    assert.ok(res.executionDurationMs < 5.0, `Tier 1 took ${res.executionDurationMs}ms (exceeded 5ms budget)`);
    assert.equal(res.shouldRunTier2, true);
  });

  it("B4-L5-02: DualTierScheduler adaptive backoff: 15m -> 30m -> 60m -> 120m on idle cycles", () => {
    assert.equal(scheduler.getCurrentBackoffMinutes(testUserId), 15);

    // Idle cycle 1
    scheduler.recordCycleOutcome(testUserId, 0);
    assert.equal(scheduler.getCurrentBackoffMinutes(testUserId), 30);

    // Idle cycle 2
    scheduler.recordCycleOutcome(testUserId, 0);
    assert.equal(scheduler.getCurrentBackoffMinutes(testUserId), 60);

    // Idle cycle 3
    scheduler.recordCycleOutcome(testUserId, 0);
    assert.equal(scheduler.getCurrentBackoffMinutes(testUserId), 120);

    // Idle cycle 4 (capped at max 120m)
    scheduler.recordCycleOutcome(testUserId, 0);
    assert.equal(scheduler.getCurrentBackoffMinutes(testUserId), 120);
  });

  it("B4-L5-03: DualTierScheduler high-priority event arrival immediately resets backoff to baseline (15m)", () => {
    // Backoff to 120m
    scheduler.recordCycleOutcome(testUserId, 0);
    scheduler.recordCycleOutcome(testUserId, 0);
    scheduler.recordCycleOutcome(testUserId, 0);
    assert.equal(scheduler.getCurrentBackoffMinutes(testUserId), 120);

    // High priority event arrives
    scheduler.notifyEvent(testUserId, true);
    assert.equal(scheduler.getCurrentBackoffMinutes(testUserId), 15);

    const evalRes = scheduler.evaluateTier1(testUserId, { isQuietHours: false });
    assert.equal(evalRes.shouldRunTier2, true);
    assert.equal(evalRes.reason, "HIGH_PRIORITY_EVENT_PENDING");
  });

  it("B4-L5-04: MorningBriefingStrategy generates morning orientation during active window", async () => {
    const morningStrategy = new MorningBriefingStrategy();
    const morningDate = new Date("2026-11-01T08:30:00Z"); // 8:30 AM UTC window

    const candidates = await morningStrategy.evaluate({
      userId: testUserId,
      now: morningDate,
      pendingTasks: [
        { _id: "t1", title: "Review B4 Architecture", priority: "high", status: "pending" },
        { _id: "t2", title: "Walk dog", priority: "low", status: "pending" },
      ],
      scheduleOccurrences: [
        { _id: "occ1", title: "Team Standup", startTime: "2026-11-01T09:00:00Z", endTime: "2026-11-01T09:30:00Z" },
      ],
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].domain, "SCHEDULE");
    assert.equal(candidates[0].autonomyLevel, "L1");
    assert.equal(candidates[0].urgency, "MEDIUM");
    assert.ok((candidates[0].proposal as any).title.includes("Morning Briefing"));
  });

  it("B4-L5-05: ScheduleRebalancerStrategy detects overlapping calendar occurrences and overdue tasks", async () => {
    const rebalancer = new ScheduleRebalancerStrategy();
    const now = new Date("2026-11-01T14:00:00Z");

    const candidates = await rebalancer.evaluate({
      userId: testUserId,
      now,
      pendingTasks: [
        { _id: "t_overdue", title: "Submit Taxes", dueDate: "2026-10-30", status: "pending" },
      ],
      scheduleOccurrences: [
        { _id: "m1", title: "Meeting 1", startTime: "2026-11-01T14:00:00Z", endTime: "2026-11-01T15:00:00Z" },
        { _id: "m2", title: "Meeting 2 (Overlapping)", startTime: "2026-11-01T14:30:00Z", endTime: "2026-11-01T15:30:00Z" },
      ],
    });

    assert.equal(candidates.length, 2);
    // Overlap conflict
    assert.equal(candidates[0].domain, "SCHEDULE");
    assert.equal(candidates[0].urgency, "HIGH");
    assert.ok((candidates[0].proposal as any).title.includes("Resolve Calendar Conflict"));

    // Overdue tasks
    assert.equal(candidates[1].domain, "TASK");
    assert.equal(candidates[1].autonomyLevel, "L2");
    assert.ok((candidates[1].proposal as any).title.includes("Roll 1 Overdue Tasks"));
  });

  it("B4-L5-06: CircadianEnergyAlignmentStrategy maps high-demand tasks to empirical energy peaks", async () => {
    const circadian = new CircadianEnergyAlignmentStrategy();
    const peakDate = new Date("2026-11-01T09:30:00Z"); // 9:30 AM UTC (In 9-12 peak)

    const candidates = await circadian.evaluate({
      userId: testUserId,
      now: peakDate,
      behavioralProfile: {
        cadenceMetrics: {
          peakStartHour: 9,
          peakEndHour: 12,
        },
      },
      pendingTasks: [
        { _id: "t_deep", title: "Implement DWCP Recovery Engine", priority: "high", metadata: { energyCost: 5 } },
      ],
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].domain, "FOCUS");
    assert.ok((candidates[0].proposal as any).title.includes("Protect Peak Focus Block"));
  });

  it("B4-L5-07: AutonomousStrategyRegistry end-to-end evaluation filters suppressed actions during quiet hours", async () => {
    const mockColl = new MockMemoryCollection();
    const journal = new ProactiveActionJournal({ model: mockColl });
    const registry = new AutonomousStrategyRegistry({ journal });

    const now = new Date("2026-11-01T08:30:00Z"); // 8:30 AM UTC
    const input = {
      userId: testUserId,
      now,
      pendingTasks: [
        { _id: "t1", title: "Deep Work Task", priority: "high", status: "pending" },
      ],
      scheduleOccurrences: [],
    };

    // 1. Quiet Hours active: standard actions are suppressed
    const quietResults = await registry.evaluateAll(input, { isQuietHours: true });
    assert.equal(quietResults.length, 0);

    // 2. Normal Hours: approved actions flow through
    const normalResults = await registry.evaluateAll(input, {
      isQuietHours: false,
      cognitiveLoad: 0.2,
    });
    assert.ok(normalResults.length > 0);
    assert.ok(normalResults[0].costEvaluation.shouldInterrupt);
  });
});
