/**
 * b2TemporalPropagation.test.ts
 * 
 * Loop 7 (WP3) Verification Suite:
 * - Temporal schedule overlap detection on domain.temporal.rescheduled
 * - Human Governance Invariant: RepairPlan strictly set to PENDING_CONFIRMATION
 * - Clear conflict resolution when schedule becomes conflict-free
 * - Correction B monotonicity guard rejecting older temporal events
 * - Idempotent redelivery handling
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { TemporalConflictConsumer } from "../events/consumers/TemporalConflictConsumer";

class MockCollection {
  public docs: Map<string, any> = new Map();

  findOne(query: Record<string, any>): any {
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) {
        const cloned = JSON.parse(JSON.stringify(doc));
        return {
          ...cloned,
          lean: () => Promise.resolve(cloned),
          then: (resolve: any, reject: any) => Promise.resolve(cloned).then(resolve, reject),
        };
      }
    }
    return {
      lean: () => Promise.resolve(null),
      then: (resolve: any, reject: any) => Promise.resolve(null).then(resolve, reject),
    };
  }

  find(query: Record<string, any>): any {
    const results: any[] = [];
    for (const doc of this.docs.values()) {
      if (this.matchesQuery(doc, query)) {
        results.push(JSON.parse(JSON.stringify(doc)));
      }
    }
    return {
      lean: () => Promise.resolve(results),
      then: (resolve: any, reject: any) => Promise.resolve(results).then(resolve, reject),
    };
  }

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, opts?: any): Promise<any> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        if (update.$set) Object.assign(doc, update.$set);
        return JSON.parse(JSON.stringify(doc));
      }
    }
    if (opts?.upsert) {
      const newDoc = { ...(update.$set || {}) };
      const docId = newDoc._id || newDoc.reportId || `id_${Date.now()}`;
      newDoc._id = docId;
      this.docs.set(docId, newDoc);
      return JSON.parse(JSON.stringify(newDoc));
    }
    return null;
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number; modifiedCount: number }> {
    for (const [id, doc] of this.docs.entries()) {
      if (this.matchesQuery(doc, filter)) {
        if (update.$set) Object.assign(doc, update.$set);
        return { matchedCount: 1, modifiedCount: 1 };
      }
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  private matchesQuery(doc: Record<string, any>, query: Record<string, any>): boolean {
    for (const [k, v] of Object.entries(query)) {
      if (k === "derivedFromCausalSequence" && v && typeof v === "object" && "$lt" in v) {
        if ((doc.derivedFromCausalSequence ?? 0) >= (v as any).$lt) return false;
        continue;
      }
      if (k === "status" && v && typeof v === "object" && "$in" in v) {
        if (!v.$in.includes(doc.status)) return false;
        continue;
      }
      if (doc[k] !== v) return false;
    }
    return true;
  }
}

describe("LOOP 7 (WP3): Temporal Schedule Solver & Governed Conflict Propagation", () => {
  let mockReportColl: MockCollection;
  let mockOccurrenceColl: MockCollection;
  let consumer: TemporalConflictConsumer;

  beforeEach(() => {
    mockReportColl = new MockCollection();
    mockOccurrenceColl = new MockCollection();

    consumer = new TemporalConflictConsumer({
      conflictReportModel: mockReportColl,
      occurrenceModel: mockOccurrenceColl,
    });
  });

  it("TEMP-01: domain.temporal.rescheduled detects interval overlap and generates RepairPlan in PENDING_CONFIRMATION", async () => {
    // Occurrence 1: Hard event 09:00 - 10:00 (540 - 600m)
    mockOccurrenceColl.docs.set("occ_meeting", {
      _id: "occ_meeting",
      occurrenceId: "occ_meeting",
      userId: "usr_alice",
      title: "Board Meeting",
      dateOnly: "2026-10-31",
      rigidity: "UNMOVABLE",
      status: "SCHEDULED",
      plannedInterval: {
        startMinute: 540,
        endMinute: 600,
        durationMinutes: 60,
      },
    });

    // Occurrence 2: Elastic focus block moved into 09:30 - 10:30 (570 - 630m) -> Overlap!
    mockOccurrenceColl.docs.set("occ_focus", {
      _id: "occ_focus",
      occurrenceId: "occ_focus",
      userId: "usr_alice",
      title: "Deep Coding Session",
      dateOnly: "2026-10-31",
      rigidity: "ELASTIC",
      status: "RESCHEDULED",
      plannedInterval: {
        startMinute: 570,
        endMinute: 630,
        durationMinutes: 60,
      },
    });

    const envelope = {
      eventId: "evt_temporal_occ_focus_v2_1_rescheduled",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.temporal.rescheduled",
      aggregateId: "occ_focus",
      aggregateType: "occurrence" as const,
      aggregateVersion: 2,
      eventOrdinal: 1,
      causalSequence: 2001,
      occurredAt: "2026-10-31T09:30:00.000Z",
      recordedAt: "2026-10-31T09:30:01.000Z",
      correlationId: "corr_resched_1",
      source: "calendar_engine",
      payload: {
        occurrenceId: "occ_focus",
        dateOnly: "2026-10-31",
      },
    };

    const res = await consumer.process(envelope as any, 1);
    assert.equal(res.status, "SUCCEEDED");

    const report = Array.from(mockReportColl.docs.values())[0];
    assert.ok(report, "Conflict report must be created");
    assert.equal(report.hasConflicts, true);
    assert.equal(report.conflicts.length, 1);
    assert.equal(report.conflicts[0].overlapMinutes, 30);

    // CRITICAL GOVERNANCE INVARIANT: Must NEVER be auto-confirmed
    assert.ok(report.repairPlan);
    assert.equal(report.repairPlan.status, "PENDING_CONFIRMATION");
    assert.equal(report.repairPlan.requiresConfirmation, true);
    assert.equal(report.repairPlan.proposedAdjustments.length, 1);
    assert.equal(report.repairPlan.proposedAdjustments[0].occurrenceId, "occ_focus");
    assert.equal(report.repairPlan.proposedAdjustments[0].proposedStartMinute, 610); // 600m + 10m buffer
  });

  it("TEMP-02: Non-conflicting reschedule clears conflicts and leaves repairPlan null", async () => {
    // Occurrence 1: 09:00 - 10:00 (540 - 600m)
    mockOccurrenceColl.docs.set("occ_1", {
      _id: "occ_1",
      occurrenceId: "occ_1",
      userId: "usr_alice",
      title: "Team Sync",
      dateOnly: "2026-10-31",
      status: "SCHEDULED",
      plannedInterval: { startMinute: 540, endMinute: 600, durationMinutes: 60 },
    });

    // Occurrence 2: 11:00 - 12:00 (660 - 720m) -> No overlap
    mockOccurrenceColl.docs.set("occ_2", {
      _id: "occ_2",
      occurrenceId: "occ_2",
      userId: "usr_alice",
      title: "Lunch & Learn",
      dateOnly: "2026-10-31",
      status: "SCHEDULED",
      plannedInterval: { startMinute: 660, endMinute: 720, durationMinutes: 60 },
    });

    const envelope = {
      eventId: "evt_temporal_occ_2_v2_1_rescheduled",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.temporal.rescheduled",
      aggregateId: "occ_2",
      aggregateType: "occurrence" as const,
      aggregateVersion: 2,
      eventOrdinal: 1,
      causalSequence: 2001,
      occurredAt: "2026-10-31T11:00:00.000Z",
      recordedAt: "2026-10-31T11:00:01.000Z",
      correlationId: "corr_clear",
      source: "calendar_engine",
      payload: { dateOnly: "2026-10-31" },
    };

    const res = await consumer.process(envelope as any, 1);
    assert.equal(res.status, "SUCCEEDED");

    const report = Array.from(mockReportColl.docs.values())[0];
    assert.equal(report.hasConflicts, false);
    assert.equal(report.conflicts.length, 0);
    assert.equal(report.repairPlan, null);
  });

  it("TEMP-03 (Correction B): Older same-version temporal event is rejected via ALREADY_SUBSUMED", async () => {
    mockReportColl.docs.set("report_usr_alice_2026-10-31", {
      _id: "report_usr_alice_2026-10-31",
      reportId: "report_usr_alice_2026-10-31",
      userId: "usr_alice",
      dateOnly: "2026-10-31",
      hasConflicts: false,
      derivedFromCausalSequence: 4005, // Current state is at sequence 4005
      lastEventId: "evt_newer",
    });

    const olderEvent = {
      eventId: "evt_temporal_occ_old_v4_1_rescheduled",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.temporal.rescheduled",
      aggregateId: "occ_old",
      aggregateType: "occurrence" as const,
      aggregateVersion: 4,
      eventOrdinal: 1,
      causalSequence: 4001, // Stale (< 4005)
      occurredAt: "2026-10-31T09:00:00.000Z",
      recordedAt: "2026-10-31T09:00:01.000Z",
      correlationId: "corr_stale",
      source: "calendar_engine",
      payload: { dateOnly: "2026-10-31" },
    };

    const res = await consumer.process(olderEvent as any, 1);
    assert.equal(res.status, "SKIPPED_STALE", "Older event must be classified as SKIPPED_STALE");

    const report = mockReportColl.docs.get("report_usr_alice_2026-10-31");
    assert.equal(report.derivedFromCausalSequence, 4005, "Causal sequence must remain 4005");
  });

  it("TEMP-04: Idempotent redelivery returns SUCCEEDED", async () => {
    mockReportColl.docs.set("report_usr_alice_2026-10-31", {
      _id: "report_usr_alice_2026-10-31",
      reportId: "report_usr_alice_2026-10-31",
      userId: "usr_alice",
      dateOnly: "2026-10-31",
      hasConflicts: false,
      derivedFromCausalSequence: 2001,
      lastEventId: "evt_temporal_occ_dup_v2_1",
    });

    const duplicateEvent = {
      eventId: "evt_temporal_occ_dup_v2_1",
      userId: "usr_alice",
      category: "DOMAIN_EVENT" as const,
      type: "domain.temporal.rescheduled",
      aggregateId: "occ_dup",
      aggregateType: "occurrence" as const,
      aggregateVersion: 2,
      eventOrdinal: 1,
      causalSequence: 2001,
      occurredAt: "2026-10-31T10:00:00.000Z",
      recordedAt: "2026-10-31T10:00:01.000Z",
      correlationId: "corr_dup",
      source: "calendar_engine",
      payload: { dateOnly: "2026-10-31" },
    };

    const res = await consumer.process(duplicateEvent as any, 1);
    assert.equal(res.status, "SUCCEEDED", "Duplicate event must return SUCCEEDED idempotently");
  });
});
