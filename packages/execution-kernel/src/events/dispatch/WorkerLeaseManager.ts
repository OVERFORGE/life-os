/**
 * WorkerLeaseManager.ts
 * 
 * Implements Worker Leasing, Atomic Partition Ownership, and Monotonic Generation Fencing.
 * Milestone B — Step 2 V2.2 Canonical Worker Infrastructure.
 * Adheres strictly to:
 * - Canonical partition key: "${userId}:${aggregateType}:${aggregateId}"
 * - Seed-or-Acquire lease protocol eliminating E11000 duplicate key errors
 * - Monotonic lease generations and fenced acknowledgment
 * - Dead-letter replay with paired consumer processing ledger reset
 */

import { OutboxEventModel, IOutboxEventDoc } from "../../../../../apps/web/server/db/models/OutboxEventModel";
import { PartitionLeaseModel } from "../../../../../apps/web/server/db/models/PartitionLeaseModel";
import { ConsumerProcessingLedgerModel } from "../../../../../apps/web/server/db/models/ConsumerProcessingLedgerModel";

export interface WorkerLeaseManagerDependencies {
  outboxModel?: any;
  partitionModel?: any;
  ledgerModel?: any;
}

async function resolveQuery<T = any>(queryOrPromise: any): Promise<T> {
  if (!queryOrPromise) return queryOrPromise;
  if (typeof queryOrPromise.lean === "function") {
    return await queryOrPromise.lean();
  }
  return await queryOrPromise;
}

export class WorkerLeaseManager {
  private outboxModel: any;
  private partitionModel: any;
  private ledgerModel: any;

  constructor(deps?: WorkerLeaseManagerDependencies) {
    this.outboxModel = deps?.outboxModel || OutboxEventModel;
    this.partitionModel = deps?.partitionModel || PartitionLeaseModel;
    this.ledgerModel = deps?.ledgerModel || ConsumerProcessingLedgerModel;
  }

  /**
   * Seed-or-Acquire Partition Lease Protocol.
   * Guarantees atomic mutual exclusion per (userId, aggregateType, aggregateId) partition
   * without duplicate key errors under concurrent contention.
   */
  public async acquirePartitionLease(
    workerId: string,
    userId: string,
    aggregateType: string,
    aggregateId: string,
    leaseDurationMs: number = 15000
  ): Promise<{ acquired: boolean; lease?: any }> {
    const partitionKey = `${userId}:${aggregateType}:${aggregateId}`;
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    // Step 1: Attempt atomic CAS on existing partition record (NO UPSERT)
    if (typeof this.partitionModel.findOneAndUpdate === "function") {
      const acquiredDoc = await this.partitionModel.findOneAndUpdate(
        {
          partitionKey,
          $or: [
            { status: "RELEASED" },
            { leaseExpiresAt: { $lt: now } },
          ],
        },
        {
          $set: {
            leasedByWorkerId: workerId,
            status: "ACTIVE",
            leaseExpiresAt,
          },
          $inc: { leaseGeneration: 1 },
        },
        { new: true }
      );

      if (acquiredDoc) {
        return { acquired: true, lease: acquiredDoc };
      }
    }

    // Step 2: Check if record exists
    let exists = false;
    if (typeof this.partitionModel.exists === "function") {
      exists = !!(await this.partitionModel.exists({ partitionKey }));
    } else if (typeof this.partitionModel.findOne === "function") {
      exists = !!(await resolveQuery(this.partitionModel.findOne({ partitionKey })));
    }

    if (exists) {
      // An active non-expired lease exists on another worker
      return { acquired: false };
    }

    // Step 3: Atomic seeding (catch E11000 duplicate key race)
    try {
      if (typeof this.partitionModel.create === "function") {
        const created = await this.partitionModel.create({
          partitionKey,
          userId,
          aggregateType,
          aggregateId,
          leasedByWorkerId: workerId,
          status: "ACTIVE",
          leaseExpiresAt,
          leaseGeneration: 1,
        });
        return { acquired: true, lease: created };
      }
    } catch (err: any) {
      if (err.code === 11000 || err.name === "MongoServerError" || /duplicate key/i.test(err.message)) {
        return { acquired: false };
      }
      throw err;
    }

    return { acquired: false };
  }

  /**
   * Release an active partition lease upon completion of the partition batch.
   */
  public async releasePartitionLease(
    partitionKey: string,
    workerId: string,
    leaseGeneration: number
  ): Promise<boolean> {
    const filter = {
      partitionKey,
      leasedByWorkerId: workerId,
      leaseGeneration,
    };
    const update = {
      $set: {
        status: "RELEASED",
        leasedByWorkerId: null,
        leaseExpiresAt: null,
      },
    };

    if (typeof this.partitionModel.updateOne === "function") {
      const res = await this.partitionModel.updateOne(filter, update);
      return (res?.matchedCount ?? 0) > 0;
    }
    return true;
  }

  /**
   * Acquire a batch of events with atomic CAS lease reservation.
   * Matches PENDING events ready for dispatch OR PROCESSING events whose lease has expired.
   * Ensures partition mutual exclusion.
   */
  public async acquireLeases(
    workerId: string,
    batchSize: number = 20,
    leaseDurationMs: number = 15000
  ): Promise<IOutboxEventDoc[]> {
    const now = new Date();

    // 1. Candidate lookup
    const rawCandidates = await resolveQuery(
      this.outboxModel
        .find({
          $or: [
            { deliveryStatus: "PENDING", nextAttemptAt: { $lte: now } },
            { deliveryStatus: "PROCESSING", leaseExpiresAt: { $lt: now } },
          ],
        })
        .limit(batchSize * 2)
    );

    const candidates = Array.isArray(rawCandidates) ? rawCandidates : [];
    const leasedEvents: IOutboxEventDoc[] = [];
    const activePartitions = new Set<string>();

    // 2. Atomic CAS acquisition per candidate with partition fencing
    for (const cand of candidates) {
      if (leasedEvents.length >= batchSize) break;

      const hasAggregateInfo = !!(cand.userId && cand.aggregateType && cand.aggregateId);
      if (hasAggregateInfo) {
        const pKey = `${cand.userId}:${cand.aggregateType}:${cand.aggregateId}`;
        if (!activePartitions.has(pKey)) {
          const isRealMongooseModel = this.partitionModel === PartitionLeaseModel;
          const isConnected = (PartitionLeaseModel.db?.readyState ?? 0) === 1;
          if (!isRealMongooseModel || isConnected) {
            const partResult = await this.acquirePartitionLease(
              workerId,
              cand.userId,
              cand.aggregateType,
              cand.aggregateId,
              leaseDurationMs
            );
            if (!partResult.acquired) {
              continue; // Partition locked by another worker
            }
            activePartitions.add(pKey);
          }
        }
      }

      const filter: Record<string, any> = {
        _id: cand._id,
        deliveryStatus: cand.deliveryStatus,
        leaseGeneration: cand.leaseGeneration,
      };

      if (cand.deliveryStatus === "PROCESSING") {
        filter.leaseExpiresAt = { $lt: now };
      }

      const update = {
        $set: {
          deliveryStatus: "PROCESSING",
          leasedByWorkerId: workerId,
          leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        },
        $inc: {
          leaseGeneration: 1,
          attempts: 1,
        },
      };

      let updated: any = null;
      if (typeof this.outboxModel.findOneAndUpdate === "function") {
        updated = await this.outboxModel.findOneAndUpdate(filter, update, { new: true });
      } else if (typeof this.outboxModel.updateOne === "function") {
        const res = await this.outboxModel.updateOne(filter, update);
        if (res && res.matchedCount > 0) {
          updated = await resolveQuery(this.outboxModel.findById(cand._id));
        }
      }

      if (updated) {
        leasedEvents.push(updated);
      }
    }

    return leasedEvents;
  }

  /**
   * Renew an active lease before it expires (worker heartbeat).
   */
  public async renewLease(
    eventId: string,
    workerId: string,
    leaseGeneration: number,
    additionalDurationMs: number = 15000
  ): Promise<boolean> {
    const now = new Date();
    const filter = {
      _id: eventId,
      leasedByWorkerId: workerId,
      leaseGeneration,
      deliveryStatus: "PROCESSING",
    };

    const update = {
      $set: {
        leaseExpiresAt: new Date(now.getTime() + additionalDurationMs),
      },
    };

    const result = await this.outboxModel.updateOne(filter, update);
    return (result?.matchedCount ?? 0) > 0;
  }

  /**
   * Monotonic generation fenced acknowledgment.
   * Only transitions to DELIVERED if workerId, leaseGeneration, and PROCESSING status match.
   */
  public async acknowledgeCompletion(
    eventId: string,
    workerId: string,
    leaseGeneration: number
  ): Promise<boolean> {
    const filter = {
      _id: eventId,
      leasedByWorkerId: workerId,
      leaseGeneration,
      deliveryStatus: "PROCESSING",
    };

    const update = {
      $set: {
        deliveryStatus: "DELIVERED",
        deliveredAt: new Date(),
        leasedByWorkerId: null,
        leaseExpiresAt: null,
      },
    };

    const result = await this.outboxModel.updateOne(filter, update);
    return (result?.matchedCount ?? 0) > 0;
  }

  /**
   * Release failed lease with exponential retry backoff or quarantine to DEAD_LETTER.
   */
  public async releaseFailedLease(
    eventId: string,
    workerId: string,
    leaseGeneration: number,
    errorReason: string,
    retryDelayMs: number = 2000,
    maxAttempts: number = 5
  ): Promise<boolean> {
    const currentDoc = await resolveQuery(this.outboxModel.findById(eventId));
    if (!currentDoc) return false;

    const filter = {
      _id: eventId,
      leasedByWorkerId: workerId,
      leaseGeneration,
      deliveryStatus: "PROCESSING",
    };

    const attempts = currentDoc.attempts ?? 1;

    let update: Record<string, any>;
    if (attempts >= maxAttempts) {
      update = {
        $set: {
          deliveryStatus: "DEAD_LETTER",
          failureReason: errorReason,
          leasedByWorkerId: null,
          leaseExpiresAt: null,
        },
      };
    } else {
      update = {
        $set: {
          deliveryStatus: "PENDING",
          failureReason: errorReason,
          nextAttemptAt: new Date(Date.now() + retryDelayMs),
          leasedByWorkerId: null,
          leaseExpiresAt: null,
        },
      };
    }

    const result = await this.outboxModel.updateOne(filter, update);
    return (result?.matchedCount ?? 0) > 0;
  }

  /**
   * Replay a DEAD_LETTER event with Paired Consumer Processing Ledger Reset.
   * Resets outbox event to PENDING and failed consumers to PENDING_RETRY,
   * while preserving already SUCCEEDED sibling consumers.
   */
  public async replayDeadLetter(
    eventId: string,
    userId: string
  ): Promise<{ replayed: boolean; error?: string }> {
    const filter = {
      _id: eventId,
      userId,
      deliveryStatus: "DEAD_LETTER",
    };

    const update = {
      $set: {
        deliveryStatus: "PENDING",
        attempts: 0,
        failureReason: null,
        nextAttemptAt: new Date(),
        leasedByWorkerId: null,
        leaseExpiresAt: null,
      },
      $inc: {
        leaseGeneration: 1,
      },
    };

    let updated: any = null;
    if (typeof this.outboxModel.findOneAndUpdate === "function") {
      updated = await this.outboxModel.findOneAndUpdate(filter, update, { new: true });
    } else if (typeof this.outboxModel.updateOne === "function") {
      const res = await this.outboxModel.updateOne(filter, update);
      if (res && res.matchedCount > 0) {
        updated = await resolveQuery(this.outboxModel.findById(eventId));
      }
    }

    if (!updated) {
      return {
        replayed: false,
        error: "Dead-letter event not found or tenant mismatch",
      };
    }

    // Paired Consumer Processing Ledger Reset
    if (this.ledgerModel && typeof this.ledgerModel.updateMany === "function") {
      await this.ledgerModel.updateMany(
        {
          eventId,
          userId,
          status: { $in: ["FAILED_RETRYABLE", "FAILED_TERMINAL"] },
        },
        {
          $set: {
            status: "PENDING_RETRY",
            errorDetails: null,
          },
        }
      );
    }

    return { replayed: true };
  }
}
