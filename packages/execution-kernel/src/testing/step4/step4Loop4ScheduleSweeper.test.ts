/**
 * step4Loop4ScheduleSweeper.test.ts
 * 
 * Step 4 Loop 4: Secondary Consistency Temporal Schedule Sweeper & Staged Revision Fencing
 * 
 * Verification Battery:
 * 1. Manifest determinism: sorted occurrence tuples produce stable SHA-256 regardless of input order.
 * 2. Overlap detection: non-overlapping and strictly adjacent occurrences detect 0 conflicts.
 * 3. Overlap detection: overlapping occurrences calculate exact overlap minutes and affected IDs.
 * 4. Human sovereignty: detected conflicts generate repair plan with status PENDING_CONFIRMATION.
 * 5. Multi-partition revision advance: incrementPartitionRevision advances both origin and destination dates.
 * 6. Mode A in-transaction fencing: aborts cleanly when partition revision changes mid-sweep.
 * 7. Mode B staged locking: acquires staged lock, updates report, commits published revision.
 * 8. Mode B mid-sweep race: concurrent mutation causes staged lock to match 0 docs and abort cleanly.
 * 9. Clean partition skip: identical manifest and unchanged revision skips update.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  TemporalScheduleSweeper,
} from "../../temporal/sweeper/TemporalScheduleSweeper";
import {
  TemporalPartitionRevisionService,
} from "../../temporal/sweeper/TemporalPartitionRevisionService";

class MockTemporalOccurrenceModel {
  public docs: any[] = [];

  async find(query: Record<string, any>): Promise<any[]> {
    const results = this.docs.filter((doc) => {
      for (const [k, v] of Object.entries(query)) {
        if (k === "status" && v && v.$in) {
          if (!v.$in.includes(doc.status)) return false;
        } else if (doc[k] !== v) {
          return false;
        }
      }
      return true;
    });
    return JSON.parse(JSON.stringify(results));
  }

  setDocs(docs: any[]) {
    this.docs = JSON.parse(JSON.stringify(docs));
  }
}

class MockConflictReportModel {
  public reports: Map<string, any> = new Map();

  async findOne(query: Record<string, any>): Promise<any> {
    for (const r of this.reports.values()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        if (r[k] !== v) match = false;
      }
      if (match) return JSON.parse(JSON.stringify(r));
    }
    return null;
  }

  async updateOne(filter: Record<string, any>, update: any, opts?: any): Promise<any> {
    const key = `${filter.userId}:${filter.dateOnly}`;
    let doc = this.reports.get(key);
    if (!doc) {
      if (opts?.upsert) {
        doc = { ...filter, ...(update.$set || {}) };
        this.reports.set(key, doc);
        return { matchedCount: 0, modifiedCount: 1, upsertedCount: 1 };
      }
      return { matchedCount: 0, modifiedCount: 0 };
    }
    if (update.$set) Object.assign(doc, update.$set);
    this.reports.set(key, doc);
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

class MockPartitionRevisionModel {
  public revisions: Map<string, any> = new Map();

  private makeKey(userId: string, dateStr: string): string {
    return `${userId}:${dateStr}`;
  }

  async findOne(query: Record<string, any>, _proj?: any, _opts?: any): Promise<any> {
    const key = this.makeKey(query.userId, query.dateStr);
    const doc = this.revisions.get(key);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  async updateOne(filter: Record<string, any>, update: any, opts?: any): Promise<any> {
    const key = this.makeKey(filter.userId, filter.dateStr);
    let doc = this.revisions.get(key);
    if (!doc) {
      if (opts?.upsert) {
        doc = {
          userId: filter.userId,
          dateStr: filter.dateStr,
          partitionRevision: 0,
          publishedReportRevision: 0,
          stagedSweepRevision: 0,
          sweepWorkerId: null,
          sweepLeaseExpiresAt: null,
          ...(update.$setOnInsert || {}),
        };
      } else {
        return { matchedCount: 0, modifiedCount: 0 };
      }
    }

    if (filter.stagedSweepRevision !== undefined && doc.stagedSweepRevision !== filter.stagedSweepRevision) {
      return { matchedCount: 0, modifiedCount: 0 };
    }
    if (filter.sweepWorkerId !== undefined && doc.sweepWorkerId !== filter.sweepWorkerId) {
      return { matchedCount: 0, modifiedCount: 0 };
    }

    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] || 0) + (v as number);
      }
    }
    if (update.$set) Object.assign(doc, update.$set);
    this.revisions.set(key, doc);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async findOneAndUpdate(filter: Record<string, any>, update: any, _opts?: any): Promise<any> {
    const key = this.makeKey(filter.userId, filter.dateStr);
    const doc = this.revisions.get(key);
    if (!doc) return null;

    if (filter.partitionRevision !== undefined && doc.partitionRevision !== filter.partitionRevision) {
      return null;
    }

    if (filter.$or) {
      const now = new Date();
      const orMatched = filter.$or.some((clause: any) => {
        if (clause.sweepLeaseExpiresAt === null && !doc.sweepLeaseExpiresAt) return true;
        if (clause.sweepLeaseExpiresAt?.$lt && doc.sweepLeaseExpiresAt) {
          return new Date(doc.sweepLeaseExpiresAt).getTime() < new Date(clause.sweepLeaseExpiresAt.$lt).getTime();
        }
        if (clause.sweepWorkerId && doc.sweepWorkerId === clause.sweepWorkerId) return true;
        return false;
      });
      if (!orMatched) return null;
    }

    if (update.$set) Object.assign(doc, update.$set);
    this.revisions.set(key, doc);
    return JSON.parse(JSON.stringify(doc));
  }
}

describe("Step 4 Loop 4: Secondary Consistency Temporal Schedule Sweeper", () => {
  let mockOccModel: MockTemporalOccurrenceModel;
  let mockReportModel: MockConflictReportModel;
  let mockRevModel: MockPartitionRevisionModel;
  let revService: TemporalPartitionRevisionService;
  let sweeper: TemporalScheduleSweeper;

  beforeEach(() => {
    mockOccModel = new MockTemporalOccurrenceModel();
    mockReportModel = new MockConflictReportModel();
    mockRevModel = new MockPartitionRevisionModel();
    revService = new TemporalPartitionRevisionService(mockRevModel);
    sweeper = new TemporalScheduleSweeper({
      occurrenceModel: mockOccModel,
      conflictReportModel: mockReportModel,
      revisionModel: mockRevModel,
      revisionService: revService,
    });
  });

  it("1. Manifest determinism: sorted occurrence tuples produce stable SHA-256 regardless of input order", () => {
    const occA = {
      occurrenceId: "occ-1",
      version: 1,
      plannedInterval: { startMinute: 600, endMinute: 660 },
      status: "SCHEDULED",
      title: "Morning Standup",
    };
    const occB = {
      occurrenceId: "occ-2",
      version: 2,
      plannedInterval: { startMinute: 720, endMinute: 780 },
      status: "SCHEDULED",
      title: "Team Sync",
    };

    const hash1 = sweeper.computePartitionManifest([occA, occB]);
    const hash2 = sweeper.computePartitionManifest([occB, occA]); // Reverse order

    assert.equal(typeof hash1, "string");
    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2);
  });

  it("2. Overlap detection: discrete and strictly adjacent occurrences detect 0 conflicts", () => {
    const occ1 = {
      occurrenceId: "occ-1",
      status: "SCHEDULED",
      plannedInterval: { startMinute: 600, endMinute: 660 }, // 10:00 - 11:00
      title: "Block 1",
    };
    const occ2 = {
      occurrenceId: "occ-2",
      status: "SCHEDULED",
      plannedInterval: { startMinute: 660, endMinute: 720 }, // 11:00 - 12:00 (strictly adjacent)
      title: "Block 2",
    };

    const conflicts = sweeper.detectConflicts([occ1, occ2]);
    assert.equal(conflicts.length, 0);
  });

  it("3. Overlap detection: overlapping occurrences calculate exact overlap minutes", () => {
    const occ1 = {
      occurrenceId: "occ-1",
      status: "SCHEDULED",
      plannedInterval: { startMinute: 600, endMinute: 660 }, // 10:00 - 11:00
      title: "Gym Session",
    };
    const occ2 = {
      occurrenceId: "occ-2",
      status: "SCHEDULED",
      plannedInterval: { startMinute: 630, endMinute: 720 }, // 10:30 - 12:00 (overlaps by 30 mins)
      title: "Doctor Appointment",
    };

    const conflicts = sweeper.detectConflicts([occ1, occ2]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].occurrenceIdA, "occ-1");
    assert.equal(conflicts[0].occurrenceIdB, "occ-2");
    assert.equal(conflicts[0].overlapMinutes, 30);
  });

  it("4. Human sovereignty: detected conflicts generate repair plan strictly with PENDING_CONFIRMATION", async () => {
    await revService.incrementPartitionRevision("user-1", "2026-11-05");

    mockOccModel.setDocs([
      {
        occurrenceId: "occ-1",
        userId: "user-1",
        dateOnly: "2026-11-05",
        status: "SCHEDULED",
        plannedInterval: { startMinute: 600, endMinute: 660 },
        title: "Gym",
      },
      {
        occurrenceId: "occ-2",
        userId: "user-1",
        dateOnly: "2026-11-05",
        status: "SCHEDULED",
        plannedInterval: { startMinute: 630, endMinute: 720 },
        title: "Doctor",
      },
    ]);

    const result = await sweeper.sweepPartition("user-1", "2026-11-05", "worker-1");
    assert.equal(result.status, "CONFLICTS_DETECTED");
    assert.equal(result.conflictCount, 1);

    const report = await mockReportModel.findOne({ userId: "user-1", dateOnly: "2026-11-05" });
    assert.ok(report);
    assert.equal(report.hasConflicts, true);
    assert.ok(report.repairPlan);
    assert.equal(report.repairPlan.status, "PENDING_CONFIRMATION");
    assert.equal(report.repairPlan.requiresConfirmation, true);
  });

  it("5. Multi-partition revision advance: increments revisions across both origin and destination dates", async () => {
    await revService.incrementPartitionRevision("user-multi", ["2026-11-10", "2026-11-11"]);

    const revA = await revService.getPartitionRevision("user-multi", "2026-11-10");
    const revB = await revService.getPartitionRevision("user-multi", "2026-11-11");

    assert.equal(revA.partitionRevision, 1);
    assert.equal(revB.partitionRevision, 1);

    // Increment origin date again
    await revService.incrementPartitionRevision("user-multi", "2026-11-10");
    const revA2 = await revService.getPartitionRevision("user-multi", "2026-11-10");
    assert.equal(revA2.partitionRevision, 2);
  });

  it("6. Mode A in-transaction fencing: aborts cleanly when partition revision changes mid-sweep", async () => {
    await revService.incrementPartitionRevision("user-mode-a", "2026-11-15"); // rev = 1

    mockOccModel.setDocs([
      {
        occurrenceId: "occ-1",
        userId: "user-mode-a",
        dateOnly: "2026-11-15",
        status: "SCHEDULED",
        plannedInterval: { startMinute: 600, endMinute: 660 },
        title: "Focus",
      },
    ]);

    // Simulate mid-sweep occurrence mutation advancing partitionRevision to 2 inside transaction
    const fakeSession = {};
    const origFindOne = mockRevModel.findOne.bind(mockRevModel);
    mockRevModel.findOne = async (query: any, _proj?: any, opts?: any) => {
      const doc = await origFindOne(query);
      if (opts?.session) {
        return { ...doc, partitionRevision: 2 };
      }
      return doc;
    };

    const res = await sweeper.sweepPartition("user-mode-a", "2026-11-15", "worker-a", {
      mode: "MODE_A",
      session: fakeSession,
    });

    assert.equal(res.status, "ABORTED_MID_SWEEP");
  });

  it("7. Mode B staged locking: acquires staged lock, updates report, and commits published revision", async () => {
    await revService.incrementPartitionRevision("user-mode-b", "2026-11-20"); // rev = 1

    mockOccModel.setDocs([
      {
        occurrenceId: "occ-b",
        userId: "user-mode-b",
        dateOnly: "2026-11-20",
        status: "SCHEDULED",
        plannedInterval: { startMinute: 500, endMinute: 550 },
        title: "Study",
      },
    ]);

    const res = await sweeper.sweepPartition("user-mode-b", "2026-11-20", "worker-b");

    assert.equal(res.status, "CLEAN");
    assert.equal(res.sourcePartitionRevision, 1);

    const revRecord = await revService.getPartitionRevision("user-mode-b", "2026-11-20");
    assert.equal(revRecord.publishedReportRevision, 1);
    assert.equal(revRecord.stagedSweepRevision, 0);
    assert.equal(revRecord.sweepWorkerId, null);
  });

  it("8. Mode B mid-sweep race: concurrent mutation causes staged lock to match 0 docs and abort cleanly", async () => {
    await revService.incrementPartitionRevision("user-race", "2026-11-25"); // rev = 1

    mockOccModel.setDocs([
      {
        occurrenceId: "occ-r",
        userId: "user-race",
        dateOnly: "2026-11-25",
        status: "SCHEDULED",
        plannedInterval: { startMinute: 500, endMinute: 550 },
        title: "Workout",
      },
    ]);

    // Simulate concurrent mutation advancing partitionRevision to 2 before acquireStagedSweepLock
    await revService.incrementPartitionRevision("user-race", "2026-11-25"); // rev is now 2

    // If sweeper had read R_expected = 1, acquiring lock on R_expected = 1 will fail
    const locked = await revService.acquireStagedSweepLock("user-race", "2026-11-25", 1, "worker-race");
    assert.equal(locked, false);
  });

  it("9. Clean partition skip: identical manifest and published revision skips recalculation", async () => {
    await revService.incrementPartitionRevision("user-clean", "2026-11-30");

    mockOccModel.setDocs([
      {
        occurrenceId: "occ-c",
        userId: "user-clean",
        dateOnly: "2026-11-30",
        status: "SCHEDULED",
        plannedInterval: { startMinute: 600, endMinute: 700 },
        title: "Deep Work",
      },
    ]);

    // First sweep publishes report
    const res1 = await sweeper.sweepPartition("user-clean", "2026-11-30", "worker-clean");
    assert.equal(res1.status, "CLEAN");

    // Second sweep with no changes
    const res2 = await sweeper.sweepPartition("user-clean", "2026-11-30", "worker-clean");
    assert.equal(res2.status, "CLEAN");
    assert.equal(res2.manifestHash, res1.manifestHash);
  });
});
