/**
 * step1TemporalIntegration.test.ts
 * 
 * Step 1 Verification Suite: Temporal Reality & Conflict Detection Integration (WP4 / WP5)
 * Tests:
 * 1. Safe backfill migration utility: backfillTemporalFencing repairs mutationEpoch and recentMutationReceipts
 * 2. ScheduleOccurrenceAdapter: Persists via persistWithStandaloneFencing (version: 1), emits domain.temporal.scheduled
 * 3. RescheduleOccurrenceAdapter: Fenced update advancing version, emits domain.temporal.rescheduled
 * 4. CancelOccurrenceAdapter: Fenced update setting status CANCELLED, emits domain.temporal.deleted
 * 5. TemporalConflictConsumer: Subscribes to domain.temporal.scheduled and detects interval overlap in PENDING_CONFIRMATION
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ScheduleOccurrenceAdapter,
  RescheduleOccurrenceAdapter,
  CancelOccurrenceAdapter,
} from "../temporal/adapters/TemporalActionAdapters";
import { backfillTemporalFencing } from "../temporal/migration/backfillTemporalFencing";
import { TemporalConflictConsumer } from "../events/consumers/TemporalConflictConsumer";
import { OutboxStorageService } from "../events/persistence/OutboxStorageService";
import { ActionProposal } from "../orchestration/contracts/ActionProposalContracts";
import { matchesMongoQuery } from "./helpers/mockMongoMatcher";

class MockTemporalCollection<T extends Record<string, any>> {
  public docs: Map<string, T> = new Map();

  find(query: Record<string, any>): any {
    let results: any[] = [];
    for (const doc of this.docs.values()) {
      if (matchesMongoQuery(doc, query)) {
        results.push(JSON.parse(JSON.stringify(doc)));
      }
    }
    const queryObj = {
      limit: (n: number) => {
        results = results.slice(0, n);
        return queryObj;
      },
      lean: () => Promise.resolve(results),
      then: (resolve: any, reject: any) => Promise.resolve(results).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(results).catch(reject),
    };
    return queryObj;
  }

  async findOne(query: Record<string, any>): Promise<T | null> {
    for (const doc of this.docs.values()) {
      if (matchesMongoQuery(doc, query)) {
        const cloned = JSON.parse(JSON.stringify(doc));
        return {
          ...cloned,
          lean: () => Promise.resolve(cloned),
        };
      }
    }
    return null;
  }

  findById(id: string): any {
    const doc = this.docs.get(String(id));
    const cloned = doc ? JSON.parse(JSON.stringify(doc)) : null;
    const queryObj = {
      lean: () => Promise.resolve(cloned),
      then: (resolve: any, reject: any) => Promise.resolve(cloned).then(resolve, reject),
      catch: (reject: any) => Promise.resolve(cloned).catch(reject),
    };
    return queryObj;
  }

  async create(docs: any | any[], _opts?: any): Promise<any[]> {
    const arr = Array.isArray(docs) ? docs : [docs];
    const created = arr.map((item) => {
      const id = String(item._id || item.eventId || item.receiptId || item.occurrenceId || `id_${Date.now()}_${Math.random()}`);
      const doc = { _id: id, ...item };
      this.docs.set(id, doc);
      return JSON.parse(JSON.stringify(doc));
    });
    return created;
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number; modifiedCount: number }> {
    for (const [id, doc] of this.docs.entries()) {
      if (matchesMongoQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return { matchedCount: 1, modifiedCount: 1 };
      }
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  async updateMany(filter: Record<string, any>, update: Record<string, any>): Promise<{ matchedCount: number; modifiedCount: number }> {
    let count = 0;
    for (const [id, doc] of this.docs.entries()) {
      if (matchesMongoQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        count++;
      }
    }
    return { matchedCount: count, modifiedCount: count };
  }

  async findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, opts?: any): Promise<T | null> {
    for (const [id, doc] of this.docs.entries()) {
      if (matchesMongoQuery(doc, filter)) {
        this.applyUpdate(doc, update);
        return JSON.parse(JSON.stringify(doc));
      }
    }
    if (opts?.upsert) {
      const newDoc = { ...(update.$setOnInsert || {}), ...(update.$set || {}) } as any;
      const docId = String(newDoc._id || newDoc.receiptId || newDoc.eventId || newDoc.reportId || `id_${Date.now()}`);
      newDoc._id = docId;
      this.docs.set(docId, newDoc);
      return JSON.parse(JSON.stringify(newDoc));
    }
    return null;
  }

  private applyUpdate(doc: Record<string, any>, update: Record<string, any>): void {
    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) {
        doc[k] = v;
      }
    }
    if (update.$inc) {
      for (const [k, v] of Object.entries(update.$inc)) {
        doc[k] = (doc[k] || 0) + (v as number);
      }
    }
    if (update.$push) {
      for (const [k, v] of Object.entries(update.$push)) {
        if (!Array.isArray(doc[k])) doc[k] = [];
        if (v && typeof v === "object" && "$each" in v) {
          doc[k].push(...(v as any).$each);
          if (typeof (v as any).$slice === "number" && (v as any).$slice < 0) {
            doc[k] = doc[k].slice((v as any).$slice);
          }
        } else {
          doc[k].push(v);
        }
      }
    }
  }
}

describe("Step 1: Temporal Reality & Conflict Integration", () => {
  let mockOccurrenceModel: MockTemporalCollection<any>;
  let mockSeriesModel: MockTemporalCollection<any>;
  let mockOutboxModel: MockTemporalCollection<any>;
  let mockReceiptModel: MockTemporalCollection<any>;
  let mockConflictReportModel: MockTemporalCollection<any>;
  let outboxService: OutboxStorageService;

  beforeEach(() => {
    mockOccurrenceModel = new MockTemporalCollection();
    mockSeriesModel = new MockTemporalCollection();
    mockOutboxModel = new MockTemporalCollection();
    mockReceiptModel = new MockTemporalCollection();
    mockConflictReportModel = new MockTemporalCollection();

    outboxService = new OutboxStorageService({
      outboxModel: mockOutboxModel,
      receiptModel: mockReceiptModel,
    });
  });

  it("TEMP-01: backfillTemporalFencing repairs mutationEpoch and recentMutationReceipts without clobbering version", async () => {
    // Populate unversioned occurrences
    await mockOccurrenceModel.create({
      _id: "occ_legacy_01",
      occurrenceId: "occ_legacy_01",
      userId: "usr_alice",
      title: "Legacy Routine Block",
      dateOnly: "2026-10-31",
      version: 1, // Already at version 1
      // mutationEpoch is missing!
      // recentMutationReceipts is missing!
    });

    await mockOccurrenceModel.create({
      _id: "occ_legacy_02",
      occurrenceId: "occ_legacy_02",
      userId: "usr_alice",
      title: "Legacy Work Session",
      dateOnly: "2026-10-31",
      version: 1,
      mutationEpoch: 0, // epoch exists
      // recentMutationReceipts is missing!
    });

    // Test dry run
    const dryReport = await backfillTemporalFencing(mockOccurrenceModel as any, { dryRun: true });
    assert.equal(dryReport.totalScanned, 2);
    assert.equal(dryReport.repairedEpochCount, 1);
    assert.equal(dryReport.repairedReceiptsCount, 2);

    // Verify dry run did not mutate DB
    const preDoc1 = await mockOccurrenceModel.findById("occ_legacy_01");
    assert.equal(preDoc1.mutationEpoch, undefined);

    // Execute real backfill
    const report = await backfillTemporalFencing(mockOccurrenceModel as any, { dryRun: false });
    assert.equal(report.totalScanned, 2);
    assert.equal(report.errors.length, 0);

    // Verify repaired state
    const doc1 = await mockOccurrenceModel.findById("occ_legacy_01");
    assert.equal(doc1.version, 1, "version must remain preserved");
    assert.equal(doc1.mutationEpoch, 0, "mutationEpoch must be repaired to 0");
    assert.deepEqual(doc1.recentMutationReceipts, [], "recentMutationReceipts must be initialized to []");

    const doc2 = await mockOccurrenceModel.findById("occ_legacy_02");
    assert.equal(doc2.mutationEpoch, 0);
    assert.deepEqual(doc2.recentMutationReceipts, []);
  });

  it("TEMP-02: ScheduleOccurrenceAdapter persists via persistWithStandaloneFencing and emits domain.temporal.scheduled", async () => {
    const adapter = new ScheduleOccurrenceAdapter({
      occurrenceModel: mockOccurrenceModel,
      outboxService,
    });

    const proposal: ActionProposal = {
      id: "prop_sched_01",
      domain: "productivity",
      actionType: "schedule_occurrence",
      payload: {
        title: "Sprint Planning",
        dateOnly: "2026-10-31",
        startTime: "10:00",
        durationMinutes: 60,
        locationCategory: "HOME",
      },
      rationale: "Bi-weekly sprint planning",
      reversibility: "atomic_single_doc",
      idempotencyKey: "idemp_sched_01",
    };

    const pre = await adapter.validatePreconditions(proposal, "usr_alice");
    assert.equal(pre.valid, true);

    const result = await adapter.execute(proposal, "usr_alice");
    assert.equal(result.success, true);
    assert.equal(result.status, "SCHEDULED");

    // Verify occurrence in database
    const saved = await mockOccurrenceModel.findOne({ userId: "usr_alice", title: "Sprint Planning" });
    assert.ok(saved);
    assert.equal(saved.version, 1);
    assert.equal(saved.mutationEpoch, 0);
    assert.equal(saved.recentMutationReceipts.length, 1);

    // Verify canonical outbox event
    const outbox = await mockOutboxModel.find({ type: "domain.temporal.scheduled" });
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].payload.title, "Sprint Planning");
    assert.equal(outbox[0].payload.dateOnly, "2026-10-31");
  });

  it("TEMP-03: RescheduleOccurrenceAdapter advances version and emits domain.temporal.rescheduled", async () => {
    // Pre-populate occurrence at 10:00 - 11:00 (600 - 660m)
    const existing = (
      await mockOccurrenceModel.create({
        _id: "occ_to_reschedule",
        occurrenceId: "occ_to_reschedule",
        userId: "usr_alice",
        title: "Client Consultation",
        dateOnly: "2026-10-31",
        plannedInterval: {
          dateOnly: "2026-10-31",
          startMinute: 600,
          endMinute: 660,
          durationMinutes: 60,
          startIsoUtc: "2026-10-31T10:00:00Z",
          endIsoUtc: "2026-10-31T11:00:00Z",
          timezone: "UTC",
          isMidnightCrossing: false,
        },
        rigidity: "ELASTIC",
        status: "SCHEDULED",
        version: 1,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      })
    )[0];

    const adapter = new RescheduleOccurrenceAdapter({
      occurrenceModel: mockOccurrenceModel,
      outboxService,
    });

    const proposal: ActionProposal = {
      id: "prop_resched_01",
      domain: "productivity",
      actionType: "reschedule_occurrence",
      payload: {
        occurrenceId: "occ_to_reschedule",
        newDateOnly: "2026-10-31",
        newStartTime: "14:00",
        newDurationMinutes: 60,
        timezone: "UTC",
      },
      rationale: "Client requested afternoon slot",
      reversibility: "atomic_single_doc",
      idempotencyKey: "idemp_resched_01",
    };

    const res = await adapter.execute(proposal, "usr_alice");
    assert.equal(res.success, true);
    assert.equal(res.status, "RESCHEDULED");
    assert.equal(res.newPlannedInterval.startMinute, 840); // 14:00

    const inDb = await mockOccurrenceModel.findById(existing._id);
    assert.equal(inDb.version, 2);
    assert.equal(inDb.status, "RESCHEDULED");
    assert.equal(inDb.plannedInterval.startMinute, 840);

    const outbox = await mockOutboxModel.find({ type: "domain.temporal.rescheduled" });
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].payload.occurrenceId, "occ_to_reschedule");
  });

  it("TEMP-04: CancelOccurrenceAdapter advances version and emits domain.temporal.deleted", async () => {
    const existing = (
      await mockOccurrenceModel.create({
        _id: "occ_to_cancel",
        occurrenceId: "occ_to_cancel",
        userId: "usr_alice",
        title: "Doctor Appointment",
        dateOnly: "2026-10-31",
        plannedInterval: {
          dateOnly: "2026-10-31",
          startMinute: 540,
          endMinute: 600,
          durationMinutes: 60,
          startIsoUtc: "2026-10-31T09:00:00Z",
          endIsoUtc: "2026-10-31T10:00:00Z",
          timezone: "UTC",
          isMidnightCrossing: false,
        },
        rigidity: "ELASTIC",
        status: "SCHEDULED",
        version: 1,
        mutationEpoch: 0,
        recentMutationReceipts: [],
      })
    )[0];

    const adapter = new CancelOccurrenceAdapter({
      occurrenceModel: mockOccurrenceModel,
      outboxService,
    });

    const proposal: ActionProposal = {
      id: "prop_cancel_01",
      domain: "productivity",
      actionType: "cancel_occurrence",
      payload: {
        occurrenceId: "occ_to_cancel",
        status: "CANCELLED",
      },
      rationale: "Doctor called to cancel",
      reversibility: "atomic_single_doc",
      idempotencyKey: "idemp_cancel_01",
    };

    const res = await adapter.execute(proposal, "usr_alice");
    assert.equal(res.success, true);
    assert.equal(res.status, "CANCELLED");

    const inDb = await mockOccurrenceModel.findById(existing._id);
    assert.equal(inDb.status, "CANCELLED");
    assert.equal(inDb.version, 2);

    const outbox = await mockOutboxModel.find({ type: "domain.temporal.deleted" });
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].payload.occurrenceId, "occ_to_cancel");
    assert.equal(outbox[0].payload.status, "CANCELLED");
  });

  it("TEMP-05: TemporalConflictConsumer receives domain.temporal.scheduled and detects interval overlap in PENDING_CONFIRMATION", async () => {
    const dateOnly = "2026-10-31";
    const userId = "usr_alice";

    // Pre-existing scheduled block: 10:00 - 11:00 (600 - 660m)
    await mockOccurrenceModel.create({
      _id: "occ_existing_slot",
      occurrenceId: "occ_existing_slot",
      userId,
      title: "Existing Deep Work",
      dateOnly,
      rigidity: "UNMOVABLE",
      status: "SCHEDULED",
      plannedInterval: {
        startMinute: 600,
        endMinute: 660,
        durationMinutes: 60,
      },
      version: 1,
    });

    // New conflicting block scheduled at 10:30 - 11:30 (630 - 690m) -> 30-minute collision!
    await mockOccurrenceModel.create({
      _id: "occ_conflicting_slot",
      occurrenceId: "occ_conflicting_slot",
      userId,
      title: "Emergency Team Sync",
      dateOnly,
      rigidity: "ELASTIC",
      status: "SCHEDULED",
      plannedInterval: {
        startMinute: 630,
        endMinute: 690,
        durationMinutes: 60,
      },
      version: 1,
    });

    const consumer = new TemporalConflictConsumer({
      conflictReportModel: mockConflictReportModel,
      occurrenceModel: mockOccurrenceModel,
    });

    const envelope: any = {
      eventId: "evt_temporal_sched_01",
      userId,
      category: "DOMAIN_EVENT",
      type: "domain.temporal.scheduled",
      aggregateId: "occ_conflicting_slot",
      aggregateType: "TemporalOccurrence",
      aggregateVersion: 1,
      eventOrdinal: 1,
      causalSequence: 100,
      occurredAt: new Date("2026-10-31T09:00:00Z"),
      payload: {
        occurrenceId: "occ_conflicting_slot",
        dateOnly,
      },
    };

    const res = await consumer.process(envelope, 1);
    assert.equal(res.status, "SUCCEEDED");

    const report = await mockConflictReportModel.findOne({ reportId: `report_${userId}_${dateOnly}` });
    assert.ok(report);
    assert.equal(report.hasConflicts, true);
    assert.equal(report.conflicts.length, 1);
    assert.equal(report.conflicts[0].overlapMinutes, 30);
    assert.ok(report.repairPlan);
    assert.equal(report.repairPlan.status, "PENDING_CONFIRMATION");

    // Idempotent redelivery test
    const redelivery = await consumer.process(envelope, 1);
    assert.equal(redelivery.status, "SUCCEEDED");
  });
});

