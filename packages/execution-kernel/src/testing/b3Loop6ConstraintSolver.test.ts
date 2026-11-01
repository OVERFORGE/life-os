/**
 * b3Loop6ConstraintSolver.test.ts
 * 
 * Milestone B — Phase B3: Work Package 3 / Loop 6
 * Dynamic Constraint Memory & Schedule Solver Injection Verification
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ScheduleSolver } from "../temporal/solver/ScheduleSolver";
import { ConstraintProfileRepository } from "../temporal/constraints/ConstraintProfileRepository";
import { DayCadenceProfile, TemporalOccurrence } from "../temporal/contracts/TemporalContracts";

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

describe("B3 WP3 Loop 6: Dynamic Constraint Memory & Schedule Solver Injection", () => {
  let mockConstraintColl: MockMemoryCollection<any>;
  let repository: ConstraintProfileRepository;
  let solver: ScheduleSolver;

  beforeEach(() => {
    mockConstraintColl = new MockMemoryCollection();
    repository = new ConstraintProfileRepository({
      constraintProfileModel: mockConstraintColl,
    });
    solver = ScheduleSolver.getInstance();
  });

  it("B3-LOOP6-01: ConstraintProfileRepository persists and retrieves learned focus windows per user", async () => {
    const userId = "usr_alice";
    const sampleWindows = [
      { startMinute: 600, endMinute: 720, score: 0.95 }, // 10:00 - 12:00
      { startMinute: 840, endMinute: 960, score: 0.85 }, // 14:00 - 16:00
    ];

    await repository.saveProfile(userId, {
      availabilityWindows: sampleWindows,
      recurringConstraints: [],
    });

    const retrieved = await repository.getLearnedFocusWindows(userId);
    assert.equal(retrieved.length, 2);
    assert.equal(retrieved[0].startMinute, 600);
    assert.equal(retrieved[0].score, 0.95);
  });

  it("B3-LOOP6-02: ScheduleSolver boosts suitability for deep work within learned focus windows", () => {
    const cadenceProfile: DayCadenceProfile = {
      dayOfWeek: 1 as any, // Monday
      baselineWakeMinute: 480,
      baselineSleepMinute: 1410,
      routines: [],
      preferredFocusWindows: [
        { startMinute: 600, endMinute: 720 }, // 10:00 AM - 12:00 PM peak focus
      ],
      commuteEstimates: [],
      sampleCount: 10,
      updatedAt: Date.now(),
    };

    // Deep work session placed inside focus window (10:00 - 11:30 AM = 600 to 690 min)
    const slotInFocus = solver.evaluateCandidateSlot(
      "2026-10-26",
      600,
      90,
      [],
      undefined,
      600, // Ideal time matches
      "UTC",
      cadenceProfile,
      "work_session"
    );

    // General activity placed at same time without focus boost
    const slotGeneral = solver.evaluateCandidateSlot(
      "2026-10-26",
      600,
      90,
      [],
      undefined,
      600,
      "UTC",
      cadenceProfile,
      "general"
    );

    assert.equal(slotInFocus.suitabilityScore, 100);
    // When slot is outside focus window or not deep work, it gets standard base score (100)
    // Now let's compare placing with deviation:
    const slotDeviatedInFocus = solver.evaluateCandidateSlot(
      "2026-10-26",
      660, // 60 min deviation from ideal 600, but still INSIDE focus window (600-720)
      60,
      [],
      undefined,
      600,
      "UTC",
      cadenceProfile,
      "work_session"
    );

    const slotDeviatedOutsideFocus = solver.evaluateCandidateSlot(
      "2026-10-26",
      780, // 60 min deviation from ideal 720, and OUTSIDE focus window
      60,
      [],
      undefined,
      720,
      "UTC",
      cadenceProfile,
      "work_session"
    );

    // slotDeviatedInFocus gets -10 proximity penalty +15 focus window boost -> 100
    // slotDeviatedOutsideFocus gets -10 proximity penalty -> 90
    assert(slotDeviatedInFocus.suitabilityScore > slotDeviatedOutsideFocus.suitabilityScore,
      `In-focus slot score (${slotDeviatedInFocus.suitabilityScore}) must exceed outside-focus score (${slotDeviatedOutsideFocus.suitabilityScore})`
    );
  });

  it("B3-LOOP6-03: ScheduleSolver repair prioritizes empirical peak focus blocks", () => {
    const existingMeeting: TemporalOccurrence = {
      occurrenceId: "occ_meet_1",
      seriesId: "ser_1",
      userId: "usr_alice",
      title: "Team Standup",
      dateOnly: "2026-10-26",
      plannedInterval: {
        dateOnly: "2026-10-26",
        startMinute: 600,
        endMinute: 630, // 10:00 - 10:30 collides with ideal start 600
        durationMinutes: 30,
        startIsoUtc: "2026-10-26T10:00:00Z",
        endIsoUtc: "2026-10-26T10:30:00Z",
        timezone: "UTC",
        isMidnightCrossing: false,
      },
      status: "SCHEDULED",
      kind: "event" as any,
      locationContext: { kind: "physical" } as any,
      rigidity: "UNMOVABLE",
      version: 1,
      overrideType: "NONE",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const cadenceProfile: DayCadenceProfile = {
      dayOfWeek: 1 as any,
      baselineWakeMinute: 480,
      baselineSleepMinute: 1410,
      routines: [],
      preferredFocusWindows: [
        { startMinute: 630, endMinute: 750 }, // 10:30 - 12:30 Focus Window
      ],
      commuteEstimates: [],
      sampleCount: 10,
      updatedAt: Date.now(),
    };

    // User asks for deep work session at 10:00 AM (collides with meeting)
    const result = solver.solvePlacement({
      dateOnly: "2026-10-26",
      idealStartMinute: 600,
      durationMinutes: 60,
      existingOccurrences: [existingMeeting],
      allowLocalRepair: true,
      activityType: "work_session",
      cadenceProfile,
    });

    assert.equal(result.feasible, true);
    assert.equal(result.repairAttempted, true);
    // Repaired slot should be at 10:30 AM (630 min), right inside the focus window!
    assert.equal(result.selectedSlot?.startMinute, 630);
    assert.equal(result.selectedSlot?.endMinute, 690);
  });
});
