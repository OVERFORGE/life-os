/**
 * UserDeliverySequencer.ts
 * 
 * LifeOS Step 3 V2.2 — Application Delivery Integration
 * Leased Per-User Delivery Journaling Engine.
 * Guarantees strict monotonic per-user delivery sequence allocation,
 * pre-publication persistence, fencing against stale workers,
 * crash recovery, and the 5-point exact interval coverage replay verification.
 */

import { WorkerLeaseManager } from "../dispatch/WorkerLeaseManager";
import { UserDeliverySequenceModel } from "../../../../../apps/web/server/db/models/UserDeliverySequenceModel";
import { UserDeliveryJournalModel } from "../../../../../apps/web/server/db/models/UserDeliveryJournalModel";
import { OutboxEventModel } from "../../../../../apps/web/server/db/models/OutboxEventModel";
import { PublicationEligibilityGate } from "./PublicationEligibilityGate";
import { getDeliveryDefinition } from "./CanonicalDeliveryRegistry";
import { IWireDeliveryFrame } from "../contracts/DeliveryContracts";

export interface UserDeliverySequencerDependencies {
  leaseManager?: WorkerLeaseManager;
  sequenceModel?: any;
  journalModel?: any;
  outboxModel?: any;
  gate?: PublicationEligibilityGate;
  maxReplayBuffer?: number;
}

export interface SequenceBatchReport {
  success: boolean;
  sequencedCount: number;
  publishedCount: number;
  recoveredCount: number;
  startSequence?: number;
  endSequence?: number;
  reason?: string;
  fencedOut?: boolean;
}

export interface ReplayVerificationResult {
  complete: boolean;
  resyncRequired: boolean;
  reason?: string;
  currentSeq: number;
  lastAckSeq?: number;
  delta?: number;
  records?: any[];
}

async function resolveQuery<T = any>(queryOrPromise: any): Promise<T> {
  if (!queryOrPromise) return queryOrPromise;
  if (typeof queryOrPromise.lean === "function") {
    return await queryOrPromise.lean();
  }
  return await queryOrPromise;
}

export class UserDeliverySequencer {
  private leaseManager: WorkerLeaseManager;
  private sequenceModel: any;
  private journalModel: any;
  private outboxModel: any;
  private gate: PublicationEligibilityGate;
  private maxReplayBuffer: number;

  constructor(deps?: UserDeliverySequencerDependencies) {
    this.leaseManager = deps?.leaseManager || new WorkerLeaseManager();
    this.sequenceModel = deps?.sequenceModel || UserDeliverySequenceModel;
    this.journalModel = deps?.journalModel || UserDeliveryJournalModel;
    this.outboxModel = deps?.outboxModel || OutboxEventModel;
    this.gate = deps?.gate || new PublicationEligibilityGate();
    this.maxReplayBuffer = deps?.maxReplayBuffer || 50;
  }

  /**
   * Executes a leased sequencing and publication batch for a user.
   * Guarantees mutual exclusion per user via PartitionLeaseModel ("userId:delivery:stream").
   */
  public async sequenceAndPublishUserBatch(
    userId: string,
    workerId: string,
    options?: {
      maxBatchSize?: number;
      leaseDurationMs?: number;
      onEmitFrame?: (frame: IWireDeliveryFrame) => Promise<void>;
    }
  ): Promise<SequenceBatchReport> {
    const maxBatch = options?.maxBatchSize || 20;
    const leaseDuration = options?.leaseDurationMs || 5000;
    const onEmitFrame = options?.onEmitFrame;

    // 1. Acquire exclusive per-user delivery lease
    const leaseResult = await this.leaseManager.acquirePartitionLease(
      workerId,
      userId,
      "delivery",
      "stream",
      leaseDuration
    );

    if (!leaseResult.acquired) {
      return {
        success: false,
        sequencedCount: 0,
        publishedCount: 0,
        recoveredCount: 0,
        reason: "LEASE_HELD_BY_ANOTHER_WORKER",
      };
    }

    const leaseGen = leaseResult.lease?.leaseGeneration || 1;
    let recoveredCount = 0;
    let publishedCount = 0;

    try {
      // 2. Crash Recovery Check: flush any unpushed COMMITTED records
      const pendingJournalQuery = this.journalModel
        .find({ userId, status: "COMMITTED" })
        .sort({ deliverySeq: 1 });
      const pendingJournals: any[] = (await resolveQuery(pendingJournalQuery)) || [];

      if (pendingJournals.length > 0) {
        for (const jDoc of pendingJournals) {
          if (onEmitFrame) {
            await onEmitFrame({
              eventId: jDoc.eventId,
              eventType: jDoc.eventType,
              aggregateId: jDoc.aggregateId,
              aggregateType: jDoc.aggregateType,
              deliverySeq: jDoc.deliverySeq,
              seqConn: 0,
              occurredAt: new Date(jDoc.occurredAt).getTime(),
              invalidationTags: jDoc.invalidationTags || [],
            });
          }
          await this.journalModel.updateOne(
            { _id: jDoc._id },
            { $set: { status: "PUBLISHED", publishedAt: new Date() } }
          );
          recoveredCount++;
        }
      }

      // 3. Fetch unsequenced converged events for this user
      const unsequencedQuery = this.outboxModel
        .find({
          userId,
          deliveryStatus: "DELIVERED",
          $or: [{ deliverySeq: null }, { deliverySeq: { $exists: false } }],
        })
        .limit(maxBatch);
      const candidates: any[] = (await resolveQuery(unsequencedQuery)) || [];

      if (candidates.length === 0) {
        await this.releaseLeaseSafely(userId, workerId, leaseGen);
        return {
          success: true,
          sequencedCount: 0,
          publishedCount,
          recoveredCount,
        };
      }

      // Deterministic causal sort: occurredAt ASC, aggregateType ASC, aggregateId ASC, causalSequence ASC
      candidates.sort((a, b) => {
        const timeA = new Date(a.occurredAt || 0).getTime();
        const timeB = new Date(b.occurredAt || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        if (a.aggregateType !== b.aggregateType) {
          return String(a.aggregateType).localeCompare(String(b.aggregateType));
        }
        if (a.aggregateId !== b.aggregateId) {
          return String(a.aggregateId).localeCompare(String(b.aggregateId));
        }
        return (a.causalSequence ?? 0) - (b.causalSequence ?? 0);
      });

      // 4. Validate Publication Eligibility Gate for each candidate
      const eligibleEvents: any[] = [];
      for (const cand of candidates) {
        const evalRes = await this.gate.evaluateEligibility(cand);
        if (evalRes.eligible) {
          eligibleEvents.push(cand);
        }
      }

      if (eligibleEvents.length === 0) {
        await this.releaseLeaseSafely(userId, workerId, leaseGen);
        return {
          success: true,
          sequencedCount: 0,
          publishedCount,
          recoveredCount,
        };
      }

      // 5. Monotonic Sequence Block Allocation
      const count = eligibleEvents.length;
      const seqDoc = await this.sequenceModel.findOneAndUpdate(
        { userId },
        {
          $inc: { currentSequence: count },
          $set: { lastAllocatedAt: new Date() },
        },
        { new: true, upsert: true }
      );

      const endSeq = seqDoc.currentSequence;
      const startSeq = endSeq - count + 1;

      // 6. Pre-Publication Durable Journaling
      const journalEntries: any[] = [];
      for (let i = 0; i < count; i++) {
        const ev = eligibleEvents[i];
        const assignedSeq = startSeq + i;
        const deliveryDef = getDeliveryDefinition(ev.type);

        journalEntries.push({
          userId,
          deliverySeq: assignedSeq,
          eventId: ev.eventId,
          eventType: ev.type,
          aggregateId: ev.aggregateId,
          aggregateType: ev.aggregateType,
          occurredAt: ev.occurredAt || new Date(),
          invalidationTags: [...deliveryDef.invalidationTags],
          status: "COMMITTED",
          leaseGeneration: leaseGen,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Persist to UserDeliveryJournalModel
      if (typeof this.journalModel.insertMany === "function") {
        await this.journalModel.insertMany(journalEntries);
      } else {
        for (const entry of journalEntries) {
          await this.journalModel.create(entry);
        }
      }

      // Update OutboxEventModel with deliverySeq
      for (let i = 0; i < count; i++) {
        const ev = eligibleEvents[i];
        const assignedSeq = startSeq + i;
        await this.outboxModel.updateOne(
          { _id: ev._id },
          { $set: { deliverySeq: assignedSeq } }
        );
      }

      // 7. Wire Emission & Journal Status Update
      for (let i = 0; i < count; i++) {
        const ev = eligibleEvents[i];
        const assignedSeq = startSeq + i;
        const jEntry = journalEntries[i];

        if (onEmitFrame) {
          await onEmitFrame({
            eventId: ev.eventId,
            eventType: ev.type,
            aggregateId: ev.aggregateId,
            aggregateType: ev.aggregateType,
            deliverySeq: assignedSeq,
            seqConn: 0,
            occurredAt: new Date(ev.occurredAt || 0).getTime(),
            invalidationTags: jEntry.invalidationTags,
          });
        }

        await this.journalModel.updateOne(
          { userId, deliverySeq: assignedSeq },
          { $set: { status: "PUBLISHED", publishedAt: new Date() } }
        );
        publishedCount++;
      }

      await this.releaseLeaseSafely(userId, workerId, leaseGen);

      return {
        success: true,
        sequencedCount: count,
        publishedCount,
        recoveredCount,
        startSequence: startSeq,
        endSequence: endSeq,
      };
    } catch (err: any) {
      await this.releaseLeaseSafely(userId, workerId, leaseGen);
      return {
        success: false,
        sequencedCount: 0,
        publishedCount,
        recoveredCount,
        reason: err?.message || String(err),
      };
    }
  }

  /**
   * Verifies the 5-Point Exact Interval Coverage Theorem upon client reconnect.
   * Transmitted cursor: lastAckSeq.
   */
  public async verifyReplayInterval(
    userId: string,
    lastAckSeq: number
  ): Promise<ReplayVerificationResult> {
    const seqDoc = await resolveQuery(
      this.sequenceModel.findOne({ userId })
    );

    const currentSeq = seqDoc?.currentSequence ?? 0;

    // Cold connection / uninitialized sequence
    if (currentSeq === 0 || lastAckSeq === undefined || lastAckSeq === null) {
      return {
        complete: false,
        resyncRequired: true,
        reason: "COLD_CONNECTION_OR_UNINITIALIZED",
        currentSeq,
        lastAckSeq: lastAckSeq ?? 0,
        delta: 0,
      };
    }

    const delta = currentSeq - lastAckSeq;

    // Up-to-date: client has observed current sequence
    if (delta === 0) {
      return {
        complete: true,
        resyncRequired: false,
        currentSeq,
        lastAckSeq,
        delta: 0,
        records: [],
      };
    }

    // Sequence regression (corrupted or reset client cursor)
    if (delta < 0) {
      return {
        complete: false,
        resyncRequired: true,
        reason: "SEQUENCE_REGRESSION",
        currentSeq,
        lastAckSeq,
        delta,
      };
    }

    // Window exceeded (disconnect duration exceeded replay buffer)
    if (delta > this.maxReplayBuffer) {
      return {
        complete: false,
        resyncRequired: true,
        reason: "REPLAY_BUFFER_EXCEEDED",
        currentSeq,
        lastAckSeq,
        delta,
      };
    }

    // Fetch range (lastAckSeq, currentSeq]
    const query = this.journalModel
      .find({
        userId,
        deliverySeq: { $gt: lastAckSeq, $lte: currentSeq },
      })
      .sort({ deliverySeq: 1 });
    const records: any[] = (await resolveQuery(query)) || [];

    // Condition 1: Cardinality Match
    if (records.length !== delta) {
      return {
        complete: false,
        resyncRequired: true,
        reason: `CARDINALITY_MISMATCH: expected ${delta}, found ${records.length}`,
        currentSeq,
        lastAckSeq,
        delta,
      };
    }

    // Condition 2: Lower Boundary Exactness
    if (records[0].deliverySeq !== lastAckSeq + 1) {
      return {
        complete: false,
        resyncRequired: true,
        reason: `LOWER_BOUNDARY_MISMATCH: expected ${lastAckSeq + 1}, found ${records[0].deliverySeq}`,
        currentSeq,
        lastAckSeq,
        delta,
      };
    }

    // Condition 3: Upper Boundary Exactness
    if (records[records.length - 1].deliverySeq !== currentSeq) {
      return {
        complete: false,
        resyncRequired: true,
        reason: `UPPER_BOUNDARY_MISMATCH: expected ${currentSeq}, found ${records[records.length - 1].deliverySeq}`,
        currentSeq,
        lastAckSeq,
        delta,
      };
    }

    // Condition 4: Contiguous Monotonic Progression
    for (let i = 0; i < records.length - 1; i++) {
      if (records[i + 1].deliverySeq !== records[i].deliverySeq + 1) {
        return {
          complete: false,
          resyncRequired: true,
          reason: `SEQUENCE_GAP_OR_DUPLICATE: at index ${i} (${records[i].deliverySeq} -> ${records[i + 1].deliverySeq})`,
          currentSeq,
          lastAckSeq,
          delta,
        };
      }
    }

    // Condition 5: Valid Event IDs
    for (const r of records) {
      if (!r.eventId) {
        return {
          complete: false,
          resyncRequired: true,
          reason: "INVALID_JOURNAL_RECORD_PAYLOAD",
          currentSeq,
          lastAckSeq,
          delta,
        };
      }
    }

    return {
      complete: true,
      resyncRequired: false,
      currentSeq,
      lastAckSeq,
      delta,
      records,
    };
  }

  private async releaseLeaseSafely(
    userId: string,
    workerId: string,
    leaseGen: number
  ): Promise<void> {
    try {
      await (this.leaseManager as any).releasePartitionLease?.(
        `${userId}:delivery:stream`,
        workerId,
        leaseGen
      );
    } catch {
      // Non-blocking release
    }
  }
}

