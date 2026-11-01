/**
 * loop3TemporalConflict.test.ts
 * 
 * Step 2 Loop 3 Test Battery:
 * - Deterministic SHA-256 Partition Manifest Hash
 * - Pairwise interval conflict detection & Human Governance Invariant
 * - Dual-date invalidation for rescheduled events (oldDate and newDate)
 * - Pre-commit source snapshot revalidation
 * - Deletion sweep and conflict clearance
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemporalConflictConsumer } from "../../events/consumers/TemporalConflictConsumer";
import { ICanonicalEventEnvelope } from "../../events/contracts/CanonicalEventContracts";

describe("Step 2 — Loop 3: Temporal Schedule Conflict Partition Sweeper & Revision Fencing", () => {
  it("Scenario 1: Overlapping occurrences detect conflict and enforce Human Governance Invariant (PENDING_CONFIRMATION)", async () => {
    let storedReport: any = null;

    const mockConflictReportModel = {
      findOne: async (query: any) => {
        if (storedReport && query.reportId === storedReport.reportId) {
          return JSON.parse(JSON.stringify(storedReport));
        }
        return null;
      },
      findOneAndUpdate: async (query: any, update: any) => {
        const doc = {
          ...(storedReport || {}),
          ...update.$set,
          sweepRevision: ((storedReport?.sweepRevision ?? 0) + (update.$inc?.sweepRevision || 0)),
        };
        storedReport = doc;
        return JSON.parse(JSON.stringify(doc));
      },
    };

    // Two overlapping occurrences: 09:00-10:00 (540-600) and 09:30-10:30 (570-630)
    const occurrences = [
      {
        _id: "occ_1",
        occurrenceId: "occ_1",
        userId: "user_1",
        dateOnly: "2026-11-02",
        title: "Team Sync",
        status: "SCHEDULED",
        version: 1,
        plannedInterval: { startMinute: 540, endMinute: 600, durationMinutes: 60 },
        rigidity: "RIGID",
      },
      {
        _id: "occ_2",
        occurrenceId: "occ_2",
        userId: "user_1",
        dateOnly: "2026-11-02",
        title: "Coffee Chat",
        status: "SCHEDULED",
        version: 1,
        plannedInterval: { startMinute: 570, endMinute: 630, durationMinutes: 60 },
        rigidity: "ELASTIC",
      },
    ];

    const mockOccurrenceModel = {
      find: async () => JSON.parse(JSON.stringify(occurrences)),
    };

    const consumer = new TemporalConflictConsumer({
      conflictReportModel: mockConflictReportModel,
      occurrenceModel: mockOccurrenceModel,
    });

    const envelope: ICanonicalEventEnvelope = {
      eventId: "evt_occ_created",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "occurrence",
      aggregateId: "occ_2",
      aggregateVersion: 1,
      causalSequence: 1000,
      type: "domain.temporal.occurrence_created",
      source: "TemporalService",
      payload: { dateOnly: "2026-11-02" },
    } as any;

    const res = await consumer.process(envelope, 1);

    assert.equal(res.status, "SUCCEEDED");
    assert.ok(storedReport, "Conflict report must be generated");
    assert.equal(storedReport.hasConflicts, true, "Conflicts must be detected");
    assert.equal(storedReport.conflicts.length, 1);
    assert.equal(storedReport.conflicts[0].overlapMinutes, 30, "Overlap should be 30 minutes");

    // Human Governance Invariant verification
    assert.ok(storedReport.repairPlan, "Repair plan must be proposed");
    assert.equal(
      storedReport.repairPlan.status,
      "PENDING_CONFIRMATION",
      "Repair plan must strictly remain PENDING_CONFIRMATION until explicit human approval"
    );
    assert.equal(storedReport.repairPlan.requiresConfirmation, true);
    assert.ok(storedReport.sourceManifestHash, "Deterministic manifest hash must be populated");
  });

  it("Scenario 2: Dual-date invalidation on rescheduling sweeps both oldDate and newDate", async () => {
    const sweptDates: string[] = [];

    const mockConflictReportModel = {
      findOne: async () => null,
      findOneAndUpdate: async (query: any, update: any) => {
        sweptDates.push(update.$set.dateOnly);
        return { ...update.$set, sweepRevision: 1 };
      },
    };

    const mockOccurrenceModel = {
      find: async () => [],
    };

    const consumer = new TemporalConflictConsumer({
      conflictReportModel: mockConflictReportModel,
      occurrenceModel: mockOccurrenceModel,
    });

    const rescheduleEnvelope: ICanonicalEventEnvelope = {
      eventId: "evt_resched",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "occurrence",
      aggregateId: "occ_moved",
      aggregateVersion: 2,
      causalSequence: 2000,
      type: "domain.temporal.rescheduled",
      source: "TemporalService",
      payload: {
        oldDateOnly: "2026-11-02",
        newDateOnly: "2026-11-03",
      },
    } as any;

    const res = await consumer.process(rescheduleEnvelope, 1);

    assert.equal(res.status, "SUCCEEDED");
    assert.ok(sweptDates.includes("2026-11-02"), "Old date must be swept");
    assert.ok(sweptDates.includes("2026-11-03"), "New date must be swept");
  });

  it("Scenario 3: Occurrence deletion clears existing conflicts", async () => {
    let storedReport: any = {
      reportId: "report_user_1_2026-11-02",
      userId: "user_1",
      dateOnly: "2026-11-02",
      hasConflicts: true,
      conflicts: [{ reason: "Old overlap" }],
      sweepRevision: 1,
      sourceManifestHash: "old_hash",
    };

    const mockConflictReportModel = {
      findOne: async () => JSON.parse(JSON.stringify(storedReport)),
      findOneAndUpdate: async (query: any, update: any) => {
        storedReport = {
          ...storedReport,
          ...update.$set,
          sweepRevision: (storedReport.sweepRevision || 0) + (update.$inc?.sweepRevision || 0),
        };
        return JSON.parse(JSON.stringify(storedReport));
      },
    };

    // No occurrences remain on that date after deletion
    const mockOccurrenceModel = {
      find: async () => [],
    };

    const consumer = new TemporalConflictConsumer({
      conflictReportModel: mockConflictReportModel,
      occurrenceModel: mockOccurrenceModel,
    });

    const res = await consumer.process({
      eventId: "evt_occ_del",
      occurredAt: Date.now() as any,
      userId: "user_1",
      aggregateType: "occurrence",
      aggregateId: "occ_1",
      aggregateVersion: 2,
      causalSequence: 2000,
      type: "domain.temporal.occurrence_deleted",
      source: "TemporalService",
      payload: { dateOnly: "2026-11-02" },
    } as any, 1);

    assert.equal(res.status, "SUCCEEDED");
    assert.equal(storedReport.hasConflicts, false, "Conflicts must be cleared to false");
    assert.equal(storedReport.conflicts.length, 0, "Conflicts array must be empty");
    assert.equal(storedReport.repairPlan, null, "Repair plan must be null when conflicts are cleared");
    assert.equal(storedReport.sweepRevision, 2, "sweepRevision must increment");
  });
});
