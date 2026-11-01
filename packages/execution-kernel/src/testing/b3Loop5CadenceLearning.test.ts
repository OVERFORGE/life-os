/**
 * b3Loop5CadenceLearning.test.ts
 * 
 * Milestone B — Phase B3: Work Package 3 / Loop 5
 * Persistent Day-Segmented Cadence Learning & Modulo-1440 Circular Math Verification
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  CadenceLearningEngine,
  computeCircularMeanMinute,
} from "../temporal/cadence/CadenceLearningEngine";
import { CadenceProfileRepository } from "../temporal/cadence/CadenceProfileRepository";
import { ExecutionChronicleEntry } from "../temporal/contracts/TemporalContracts";

class MockMemoryCollection<T extends Record<string, any>> {
  public docs: Map<string, T> = new Map();

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

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, opts?: any): Promise<any> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        if (update.$set) Object.assign(doc, update.$set);
        return JSON.parse(JSON.stringify(doc));
      }
    }
    if (opts?.upsert) {
      const newDoc: any = { _id: filter._id || filter.userId || `id_${Date.now()}` };
      if (update.$set) Object.assign(newDoc, update.$set);
      this.docs.set(String(newDoc._id), newDoc);
      return JSON.parse(JSON.stringify(newDoc));
    }
    return null;
  }

  private matchesQuery(doc: any, query: Record<string, any>): boolean {
    for (const [k, v] of Object.entries(query)) {
      if (doc[k] !== v) return false;
    }
    return true;
  }
}

describe("B3 WP3 Loop 5: Persistent Day-Segmented Cadence Learning", () => {
  let mockCadenceColl: MockMemoryCollection<any>;
  let repository: CadenceProfileRepository;
  let engine: CadenceLearningEngine;

  beforeEach(() => {
    mockCadenceColl = new MockMemoryCollection();
    repository = new CadenceProfileRepository({
      cadenceProfileModel: mockCadenceColl,
    });
    engine = CadenceLearningEngine.getInstance();
  });

  it("B3-LOOP5-01: Modulo-1440 circular averaging correctly calculates midnight-crossing bedtime", () => {
    // Bedtime observations: 23:45 (1425 min) and 00:15 (15 min)
    const observations = [
      { minute: 1425, weight: 1.0 },
      { minute: 15, weight: 1.0 },
    ];

    const result = computeCircularMeanMinute(observations);

    // Correct circular mean is 0 (midnight: 00:00)
    // Naive linear average would be (1425 + 15)/2 = 720 (12:00 PM NOON)!
    assert.equal(result.meanMinute, 0, "Midnight-crossing mean must resolve to 00:00 midnight (0 min)");
    assert(result.varianceMinutes <= 30, "Variance should reflect +-15 min dispersion");
  });

  it("B3-LOOP5-02: Modulo-1440 circular averaging accurately preserves daytime schedules", () => {
    // Morning routines: 09:00 (540 min) and 09:30 (570 min)
    const observations = [
      { minute: 540, weight: 1.0 },
      { minute: 570, weight: 1.0 },
    ];

    const result = computeCircularMeanMinute(observations);
    assert.equal(result.meanMinute, 555, "Standard daytime average must resolve to 09:15 AM (555 min)");
    assert(result.varianceMinutes <= 30);
  });

  it("B3-LOOP5-03: deriveDayCadenceProfiles strictly segments routines by day of week", () => {
    // Monday is 2026-10-26 (UTC), Tuesday is 2026-10-27 (UTC)
    const mondayWorkout: ExecutionChronicleEntry = {
      chronicleId: "chron_mon_1",
      userId: "usr_alice",
      occurrenceId: "occ_mon_1",
      entityType: "workout",
      title: "Gym Workout",
      startedAtMs: new Date("2026-10-26T07:00:00Z").getTime(), // Monday 07:00 UTC (420 min)
      endedAtMs: new Date("2026-10-26T08:00:00Z").getTime(),
      durationMinutes: 60,
      interruptionsCount: 0,
      source: "web_manual",
      createdAt: Date.now(),
    };

    const tuesdayDeepWork: ExecutionChronicleEntry = {
      chronicleId: "chron_tue_1",
      userId: "usr_alice",
      occurrenceId: "occ_tue_1",
      entityType: "task",
      title: "Deep Work Focus",
      startedAtMs: new Date("2026-10-27T10:00:00Z").getTime(), // Tuesday 10:00 UTC (600 min)
      endedAtMs: new Date("2026-10-27T12:00:00Z").getTime(),
      durationMinutes: 120,
      interruptionsCount: 0,
      source: "web_manual",
      createdAt: Date.now(),
    };

    const dayProfiles = engine.deriveDayCadenceProfiles(
      "usr_alice",
      [mondayWorkout, tuesdayDeepWork],
      "UTC",
      new Date("2026-10-28T00:00:00Z").getTime()
    );

    const mondayProfile = dayProfiles.get(1)!;
    const tuesdayProfile = dayProfiles.get(2)!;

    assert.equal(mondayProfile.routines.length, 1);
    assert.equal(mondayProfile.routines[0].title, "Gym workout");
    assert.equal(mondayProfile.routines[0].category, "GYM");
    assert.equal(mondayProfile.routines[0].targetStartMinute, 420);

    assert.equal(tuesdayProfile.routines.length, 1);
    assert.equal(tuesdayProfile.routines[0].title, "Deep work focus");
    assert.equal(tuesdayProfile.routines[0].category, "FOCUS");
    assert.equal(tuesdayProfile.routines[0].targetStartMinute, 600);

    // Monday has zero focus routines, Tuesday has zero gym routines
    assert.ok(!mondayProfile.routines.some((r) => r.category === "FOCUS"));
    assert.ok(!tuesdayProfile.routines.some((r) => r.category === "GYM"));
  });

  it("B3-LOOP5-04: CadenceProfileRepository persists and loads day patterns per user", async () => {
    const mondayWorkout: ExecutionChronicleEntry = {
      chronicleId: "chron_mon_2",
      userId: "usr_bob",
      occurrenceId: "occ_mon_2",
      entityType: "workout",
      title: "Gym Workout",
      startedAtMs: new Date("2026-10-26T07:00:00Z").getTime(),
      endedAtMs: new Date("2026-10-26T08:00:00Z").getTime(),
      durationMinutes: 60,
      interruptionsCount: 0,
      source: "web_manual",
      createdAt: Date.now(),
    };

    const dayProfiles = engine.deriveDayCadenceProfiles(
      "usr_bob",
      [mondayWorkout],
      "UTC"
    );

    await repository.saveDayPatterns("usr_bob", dayProfiles);

    const savedDoc = await repository.getProfile("usr_bob");
    assert.ok(savedDoc);
    assert.equal(savedDoc.userId, "usr_bob");
    assert.equal(savedDoc.dayPatterns.length, 7);

    const savedMonday = savedDoc.dayPatterns.find((p: any) => p.dayOfWeek === 1);
    assert.ok(savedMonday);
    assert.equal(savedMonday.routines.length, 1);
    assert.equal(savedMonday.routines[0].title, "Gym workout");
    assert.equal(savedMonday.routines[0].targetStartMinute, 420);
  });
});
