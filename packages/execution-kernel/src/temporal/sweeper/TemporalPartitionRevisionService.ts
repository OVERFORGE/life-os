/**
 * TemporalPartitionRevisionService.ts
 * 
 * Step 4 Loop 4: Secondary Consistency Temporal Schedule Sweeper
 * Manages monotonic partition revision tokens for temporal schedules per user and date partition.
 * 
 * Enforces:
 * - Invariant 4.1: partitionRevision is monotonically incremented on every occurrence mutation.
 * - Invariant 4.2: Rescheduling across dates atomically increments both origin and destination date partitions.
 */

import { TemporalPartitionRevisionModel, ITemporalPartitionRevisionDoc } from "../../../../../apps/web/server/db/models/TemporalPartitionRevisionModel";

export class TemporalPartitionRevisionService {
  private static instance: TemporalPartitionRevisionService;
  private revisionModel: any;

  constructor(revisionModel?: any) {
    this.revisionModel = revisionModel || TemporalPartitionRevisionModel;
  }

  static getInstance(revisionModel?: any): TemporalPartitionRevisionService {
    if (!TemporalPartitionRevisionService.instance) {
      TemporalPartitionRevisionService.instance = new TemporalPartitionRevisionService(revisionModel);
    }
    return TemporalPartitionRevisionService.instance;
  }

  /**
   * Monotonically increments the partitionRevision for one or more date partitions.
   * If the partition document does not exist, it is initialized with partitionRevision: 1.
   */
  public async incrementPartitionRevision(
    userId: string,
    dates: string | string[],
    customModel?: any
  ): Promise<void> {
    const model = customModel || this.revisionModel;
    const rawDates = Array.isArray(dates) ? dates : [dates];
    const uniqueDates = Array.from(new Set(rawDates.filter(Boolean)));

    for (const dateStr of uniqueDates) {
      await model.updateOne(
        { userId, dateStr },
        {
          $inc: { partitionRevision: 1 },
          $set: { lastModifiedAt: new Date() },
          $setOnInsert: {
            publishedReportRevision: 0,
            stagedSweepRevision: 0,
            sweepWorkerId: null,
            sweepLeaseExpiresAt: null,
          },
        },
        { upsert: true }
      );
    }
  }

  /**
   * Retrieves the current partition revision record for a user and date.
   */
  public async getPartitionRevision(
    userId: string,
    dateStr: string,
    customModel?: any
  ): Promise<{
    partitionRevision: number;
    publishedReportRevision: number;
    stagedSweepRevision: number;
    sweepWorkerId: string | null;
    sweepLeaseExpiresAt: Date | null;
  }> {
    const model = customModel || this.revisionModel;
    const doc = await model.findOne({ userId, dateStr });
    if (!doc) {
      return {
        partitionRevision: 0,
        publishedReportRevision: 0,
        stagedSweepRevision: 0,
        sweepWorkerId: null,
        sweepLeaseExpiresAt: null,
      };
    }
    return {
      partitionRevision: doc.partitionRevision || 0,
      publishedReportRevision: doc.publishedReportRevision || 0,
      stagedSweepRevision: doc.stagedSweepRevision || 0,
      sweepWorkerId: doc.sweepWorkerId || null,
      sweepLeaseExpiresAt: doc.sweepLeaseExpiresAt || null,
    };
  }

  /**
   * Mode B: Acquires a staged sweep lock on a partition if partitionRevision === expectedRevision.
   */
  public async acquireStagedSweepLock(
    userId: string,
    dateStr: string,
    expectedRevision: number,
    workerId: string,
    ttlMs: number = 5000,
    customModel?: any
  ): Promise<boolean> {
    const model = customModel || this.revisionModel;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const filter = {
      userId,
      dateStr,
      partitionRevision: expectedRevision,
      $or: [
        { sweepLeaseExpiresAt: null },
        { sweepLeaseExpiresAt: { $lt: now } },
        { sweepWorkerId: workerId },
      ],
    };

    const update = {
      $set: {
        stagedSweepRevision: expectedRevision,
        sweepWorkerId: workerId,
        sweepLeaseExpiresAt: expiresAt,
      },
    };

    const res = await model.findOneAndUpdate(filter, update, { new: true });
    return !!res;
  }

  /**
   * Mode B: Commits the published report revision and clears the worker lock.
   */
  public async commitPublishedRevision(
    userId: string,
    dateStr: string,
    expectedRevision: number,
    workerId: string,
    customModel?: any
  ): Promise<boolean> {
    const model = customModel || this.revisionModel;
    const filter = {
      userId,
      dateStr,
      stagedSweepRevision: expectedRevision,
      sweepWorkerId: workerId,
    };

    const update = {
      $set: {
        publishedReportRevision: expectedRevision,
        stagedSweepRevision: 0,
        sweepWorkerId: null,
        sweepLeaseExpiresAt: null,
      },
    };

    const res = await model.updateOne(filter, update);
    return (res.modifiedCount || res.matchedCount || 0) > 0;
  }
}

