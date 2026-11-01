/**
 * OutboxStorageService.ts
 * 
 * Implements the Durable Outbox Storage Service for Milestone B — Phase B2.
 * Supports:
 * - Mode A: Replica-Set Multi-Document ACID Transactions
 * - Mode B: Two-Phase Intent Fencing with Monotonic Mutation Epoch Fencing (DIMIP)
 * - Standalone DIMIP Recovery Sweeper (Evidence-Based Recovery Protocol resolving Correction A)
 */

import mongoose, { Model, ClientSession } from "mongoose";
import {
  formatCanonicalEventId,
  calculateCausalSequence,
  CanonicalEventCategory,
  AggregateType,
  ICanonicalEventEnvelope,
} from "../contracts/CanonicalEventContracts";
import {
  OutboxEventModel,
  IOutboxEventDoc,
  OutboxDeliveryStatus,
} from "../../../../../apps/web/server/db/models/OutboxEventModel";
import {
  MutationReceiptModel,
  IMutationReceiptDoc,
} from "../../../../../apps/web/server/db/models/MutationReceiptModel";

export class ConcurrencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConcurrencyConflictError";
  }
}

export class FencedOutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FencedOutError";
  }
}

export class AggregateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AggregateNotFoundError";
  }
}

export interface OutboxEventDraft {
  userId: string;
  category: CanonicalEventCategory;
  type: string;
  aggregateId: string;
  aggregateType: AggregateType;
  aggregateVersion: number;
  eventOrdinal?: number;
  correlationId?: string;
  causalityRef?: string;
  source: string;
  payload: any;
  metadata?: Record<string, any>;
  occurredAt?: Date;
}

export interface ModeACommitParams {
  userId: string;
  aggregateModel: Model<any>;
  aggregateId: string;
  clientMutationId: string;
  diffHash: string;
  expectedVersion: number;
  domainMutation: (session: ClientSession) => Promise<{ updatedDoc: any; newVersion: number }>;
  eventDrafts: OutboxEventDraft[];
}

export interface ModeBCommitParams {
  userId: string;
  aggregateModel: Model<any>;
  aggregateId: string;
  clientMutationId: string;
  diffHash: string;
  expectedVersion: number;
  fencingEpoch: number;
  domainUpdates: Record<string, any>;
  eventDrafts: OutboxEventDraft[];
  isCreation?: boolean;
  isDeletion?: boolean;
}

export interface StandaloneSweeperOptions {
  gracePeriodMs?: number;
  batchSize?: number;
  aggregateModelResolver?: (aggregateType: string) => Model<any> | null;
}

export interface ReconciliationDetail {
  eventId: string;
  clientMutationId?: string;
  outcome: "PROMOTED" | "ABORTED" | "QUARANTINED" | "SKIPPED";
  reason?: string;
}

export interface SweeperReconciliationResult {
  scannedCount: number;
  promotedCount: number;
  abortedCount: number;
  quarantinedCount: number;
  details: ReconciliationDetail[];
}

export interface OutboxStorageServiceDependencies {
  outboxModel?: any;
  receiptModel?: any;
}

export class OutboxStorageService {
  private static instance: OutboxStorageService;
  private outboxModel: any;
  private receiptModel: any;

  constructor(dependencies?: OutboxStorageServiceDependencies) {
    this.outboxModel = dependencies?.outboxModel || OutboxEventModel;
    this.receiptModel = dependencies?.receiptModel || MutationReceiptModel;
  }

  public static getInstance(dependencies?: OutboxStorageServiceDependencies): OutboxStorageService {
    if (!OutboxStorageService.instance || dependencies) {
      OutboxStorageService.instance = new OutboxStorageService(dependencies);
    }
    return OutboxStorageService.instance;
  }

  public setDependencies(dependencies: OutboxStorageServiceDependencies): void {
    if (dependencies.outboxModel) this.outboxModel = dependencies.outboxModel;
    if (dependencies.receiptModel) this.receiptModel = dependencies.receiptModel;
  }

  /**
   * Determine whether the current MongoDB connection supports multi-document transactions.
   */
  public async supportsTransactions(): Promise<boolean> {
    try {
      const client = mongoose.connection.getClient() as any;
      if (!client) return false;
      const topology = client.topology;
      if (!topology) return false;
      const desc = topology.description;
      return desc?.type === "ReplicaSetWithPrimary" || desc?.type === "Sharded" || desc?.type === "LoadBalanced";
    } catch {
      return false;
    }
  }

  /**
   * Mode A: Atomic Multi-Document Transaction commit.
   * Atomically mutates aggregate, writes durable receipt, and saves pending outbox events.
   */
  public async persistWithTransaction(
    params: ModeACommitParams
  ): Promise<{ events: IOutboxEventDoc[]; updatedDoc: any; receipt: IMutationReceiptDoc }> {
    const session = await mongoose.startSession();
    let resultEvents: IOutboxEventDoc[] = [];
    let updatedDoc: any = null;
    let receiptDoc: IMutationReceiptDoc | null = null;

    try {
      await session.withTransaction(async () => {
        // 1. Execute domain mutation
        const mutationRes = await params.domainMutation(session);
        updatedDoc = mutationRes.updatedDoc;
        const newVersion = mutationRes.newVersion;

        // 2. Persist durable mutation receipt
        const receiptId = `${params.userId}:${params.aggregateId}:${params.clientMutationId}`;
        const receipts = await this.receiptModel.create(
          [
            {
              receiptId,
              userId: params.userId,
              aggregateId: params.aggregateId,
              clientMutationId: params.clientMutationId,
              version: newVersion,
              fencingEpoch: 0,
              diffHash: params.diffHash,
              status: "COMMITTED",
              appliedAt: new Date(),
              retentionExpiresAt: new Date(Date.now() + 7 * 86400000), // 7-day retention
            },
          ],
          { session }
        );
        receiptDoc = receipts[0];

        // 3. Persist outbox events in PENDING status
        const eventDocsToCreate = params.eventDrafts.map((draft, idx) => {
          const ordinal = draft.eventOrdinal ?? idx + 1;
          const occurredAt = draft.occurredAt || new Date();
          const discriminator = draft.type.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
          const eventId = formatCanonicalEventId(
            draft.aggregateType,
            draft.aggregateId,
            newVersion,
            ordinal,
            discriminator
          );
          const causalSequence = calculateCausalSequence(newVersion, ordinal);

          return {
            eventId,
            userId: draft.userId,
            category: draft.category,
            type: draft.type,
            aggregateId: draft.aggregateId,
            aggregateType: draft.aggregateType,
            aggregateVersion: newVersion,
            eventOrdinal: ordinal,
            causalSequence,
            occurredAt,
            recordedAt: new Date(),
            correlationId: draft.correlationId || `corr_${draft.aggregateId}_${Date.now()}`,
            causalityRef: draft.causalityRef || null,
            source: draft.source,
            payload: draft.payload,
            metadata: draft.metadata || {},
            deliveryStatus: "PENDING" as OutboxDeliveryStatus,
            leaseGeneration: 0,
            attempts: 0,
            maxAttempts: 5,
            nextAttemptAt: new Date(),
            mutationIntent: {
              clientMutationId: params.clientMutationId,
              expectedVersion: params.expectedVersion,
              fencingEpoch: 0,
              diffHash: params.diffHash,
            },
          };
        });

        resultEvents = await this.outboxModel.create(eventDocsToCreate, { session });

        // Invariant 6.1: Monotonically increment UserGraphRevisionModel on task/goal mutations
        const isGraphMutation = params.eventDrafts.some(
          (d) => ["task", "goal"].includes(String(d.aggregateType).toLowerCase())
        );
        if (isGraphMutation) {
          try {
            const { UserGraphRevisionModel } = await import("../../../../../apps/web/server/db/models/UserGraphRevisionModel");
            await UserGraphRevisionModel.updateOne(
              { userId: params.userId },
              { $inc: { graphRevision: 1 }, $set: { lastUpdatedAt: new Date() } },
              { upsert: true, session }
            );
          } catch {
            // Safe fallback
          }
        }
      });

      return {
        events: resultEvents,
        updatedDoc,
        receipt: receiptDoc!,
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Mode B: Two-Phase Intent Fencing with Monotonic Mutation Epoch Fencing (DIMIP).
   * Safe for Standalone MongoDB without multi-document transactions.
   */
  public async persistWithStandaloneFencing(
    params: ModeBCommitParams
  ): Promise<{ events: IOutboxEventDoc[]; receipt: IMutationReceiptDoc }> {
    const nextVersion = params.expectedVersion + 1;
    const occurredAt = new Date();

    // Step 1: Write PENDING_COMMIT Intent to Outbox
    const preparedEvents = params.eventDrafts.map((draft, idx) => {
      const ordinal = draft.eventOrdinal ?? idx + 1;
      const discriminator = draft.type.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
      const eventId = formatCanonicalEventId(
        draft.aggregateType,
        draft.aggregateId,
        nextVersion,
        ordinal,
        discriminator
      );
      const causalSequence = calculateCausalSequence(nextVersion, ordinal);

      return {
        eventId,
        userId: draft.userId,
        category: draft.category,
        type: draft.type,
        aggregateId: draft.aggregateId,
        aggregateType: draft.aggregateType,
        aggregateVersion: nextVersion,
        eventOrdinal: ordinal,
        causalSequence,
        occurredAt: draft.occurredAt || occurredAt,
        recordedAt: new Date(),
        correlationId: draft.correlationId || `corr_${draft.aggregateId}_${Date.now()}`,
        causalityRef: draft.causalityRef || null,
        source: draft.source,
        payload: draft.payload,
        metadata: draft.metadata || {},
        deliveryStatus: "PENDING_COMMIT" as OutboxDeliveryStatus,
        leaseGeneration: 0,
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        mutationIntent: {
          clientMutationId: params.clientMutationId,
          expectedVersion: params.expectedVersion,
          fencingEpoch: params.fencingEpoch,
          diffHash: params.diffHash,
        },
      };
    });

    const createdEvents = await this.outboxModel.create(preparedEvents);

    // Step 2: Atomic Domain Write to Aggregate Root with Monotonic Epoch & Version Guard
    const filter = {
      _id: params.aggregateId,
      version: params.expectedVersion,
      mutationEpoch: { $lte: params.fencingEpoch },
    };

    const inDocReceipt = {
      clientMutationId: params.clientMutationId,
      version: nextVersion,
      appliedAt: new Date(),
      diffHash: params.diffHash,
    };

    if (params.isCreation) {
      const docToCreate = {
        _id: params.aggregateId,
        ...params.domainUpdates,
        version: nextVersion,
        mutationEpoch: params.fencingEpoch,
        recentMutationReceipts: [inDocReceipt],
      };
      await params.aggregateModel.create(docToCreate);
    } else {
      const updateDoc = params.isDeletion
        ? {
            $set: {
              ...params.domainUpdates,
              status: params.domainUpdates?.status || "deleted",
              deletedAt: params.domainUpdates?.deletedAt || params.domainUpdates?.archivedAt || new Date(),
              archivedAt: params.domainUpdates?.archivedAt || params.domainUpdates?.deletedAt || new Date(),
              version: nextVersion,
              mutationEpoch: params.fencingEpoch,
            },
            $push: {
              recentMutationReceipts: {
                $each: [inDocReceipt],
                $slice: -50,
              },
            },
          }
        : {
            $set: {
              ...params.domainUpdates,
              version: nextVersion,
              mutationEpoch: params.fencingEpoch,
            },
            $push: {
              recentMutationReceipts: {
                $each: [inDocReceipt],
                $slice: -50,
              },
            },
          };

      const updateResult = await params.aggregateModel.updateOne(filter, updateDoc);

      if (updateResult.matchedCount === 0) {
        // Diagnostic check: why did the update not match?
        const query = params.aggregateModel.findById(params.aggregateId);
        const currentDoc = query && typeof (query as any).lean === "function"
          ? await (query as any).lean()
          : await query;
        if (!currentDoc) {
          throw new AggregateNotFoundError(
            `Aggregate with ID ${params.aggregateId} not found.`
          );
        }
        if (currentDoc.mutationEpoch > params.fencingEpoch) {
          throw new FencedOutError(
            `Mutation fenced out: aggregate mutationEpoch (${currentDoc.mutationEpoch}) is greater than request epoch (${params.fencingEpoch}). Recovery sweeper has aborted this intent.`
          );
        }
        if (currentDoc.version !== params.expectedVersion) {
          throw new ConcurrencyConflictError(
            `Concurrency conflict: aggregate version is ${currentDoc.version}, expected ${params.expectedVersion}.`
          );
        }
        throw new ConcurrencyConflictError("Aggregate update did not match expected version/epoch.");
      }
    }

    // Step 3: Write Durable Mutation Receipt
    const receiptId = `${params.userId}:${params.aggregateId}:${params.clientMutationId}`;
    const receipt = await this.receiptModel.findOneAndUpdate(
      { receiptId },
      {
        $setOnInsert: {
          receiptId,
          userId: params.userId,
          aggregateId: params.aggregateId,
          clientMutationId: params.clientMutationId,
          version: nextVersion,
          fencingEpoch: params.fencingEpoch,
          diffHash: params.diffHash,
          status: "COMMITTED",
          appliedAt: new Date(),
          retentionExpiresAt: new Date(Date.now() + 7 * 86400000), // 7-day TTL
        },
      },
      { upsert: true, new: true }
    );

    // Step 4: Promote Outbox Event from PENDING_COMMIT to PENDING
    const eventIds = createdEvents.map((e: any) => e._id);
    await this.outboxModel.updateMany(
      { _id: { $in: eventIds } },
      { $set: { deliveryStatus: "PENDING" } }
    );

    // Reload promoted events
    const promotedEvents = await this.outboxModel.find({ _id: { $in: eventIds } });

    // Invariant 6.1: Monotonically increment UserGraphRevisionModel on task/goal mutations
    const isGraphMutation = params.eventDrafts.some(
      (d) => ["task", "goal"].includes(String(d.aggregateType).toLowerCase())
    );
    if (isGraphMutation) {
      try {
        const { UserGraphRevisionModel } = await import("../../../../../apps/web/server/db/models/UserGraphRevisionModel");
        await UserGraphRevisionModel.updateOne(
          { userId: params.userId },
          { $inc: { graphRevision: 1 }, $set: { lastUpdatedAt: new Date() } },
          { upsert: true }
        );
      } catch {
        // Safe fallback
      }
    }

    return {
      events: promotedEvents,
      receipt,
    };
  }

  /**
   * Standalone DIMIP Recovery Sweeper (Resolves V2.4 Correction A).
   * 
   * Sweeps stale PENDING_COMMIT intents and applies evidence-based classification:
   * - Positive Commit Evidence -> Promote to PENDING
   * - Positive Non-Commit Proof (Atomic Epoch Burn) -> Mark ABORTED
   * - Indeterminate Outcome -> Quarantine to DEAD_LETTER (NEVER infer abort from version alone)
   */
  public async reconcilePendingIntents(
    options?: StandaloneSweeperOptions
  ): Promise<SweeperReconciliationResult> {
    const gracePeriodMs = options?.gracePeriodMs ?? 5000;
    const batchSize = options?.batchSize ?? 50;
    const cutoffTime = new Date(Date.now() - gracePeriodMs);

    const pendingIntents = await this.outboxModel.find({
      deliveryStatus: "PENDING_COMMIT",
      recordedAt: { $lte: cutoffTime },
    }).limit(batchSize);

    const result: SweeperReconciliationResult = {
      scannedCount: pendingIntents.length,
      promotedCount: 0,
      abortedCount: 0,
      quarantinedCount: 0,
      details: [],
    };

    for (const intentEvent of pendingIntents) {
      const intent = intentEvent.mutationIntent;
      const { aggregateId, aggregateType, eventId, userId } = intentEvent;

      if (!intent || !intent.clientMutationId) {
        await this.outboxModel.updateOne(
          { _id: intentEvent._id },
          {
            $set: {
              deliveryStatus: "DEAD_LETTER",
              failureReason: "MALFORMED_MUTATION_INTENT: Missing clientMutationId in intent metadata",
            },
          }
        );
        result.quarantinedCount++;
        result.details.push({
          eventId,
          outcome: "QUARANTINED",
          reason: "Malformed mutation intent",
        });
        continue;
      }

      // Check 1: Durable MutationReceiptModel for positive evidence
      const durableReceipt = await this.receiptModel.findOne({
        aggregateId,
        clientMutationId: intent.clientMutationId,
      });

      if (durableReceipt) {
        if (durableReceipt.status === "COMMITTED") {
          // Positive commit evidence exists!
          await this.outboxModel.updateOne(
            { _id: intentEvent._id },
            { $set: { deliveryStatus: "PENDING" } }
          );
          result.promotedCount++;
          result.details.push({
            eventId,
            clientMutationId: intent.clientMutationId,
            outcome: "PROMOTED",
            reason: "Positive commit evidence found in MutationReceiptModel",
          });
          continue;
        } else if (durableReceipt.status === "ABORTED_BY_RECOVERY") {
          // Previously aborted
          await this.outboxModel.updateOne(
            { _id: intentEvent._id },
            { $set: { deliveryStatus: "ABORTED" } }
          );
          result.abortedCount++;
          result.details.push({
            eventId,
            clientMutationId: intent.clientMutationId,
            outcome: "ABORTED",
            reason: "Mutation marked ABORTED_BY_RECOVERY in MutationReceiptModel",
          });
          continue;
        }
      }

      // Check 2: Inspect Aggregate document directly
      const resolver = options?.aggregateModelResolver;
      const aggregateModel = resolver ? resolver(aggregateType) : null;

      if (!aggregateModel) {
        // Cannot inspect aggregate document without model resolver
        await this.outboxModel.updateOne(
          { _id: intentEvent._id },
          {
            $set: {
              deliveryStatus: "DEAD_LETTER",
              failureReason: `STANDALONE_INTENT_OUTCOME_INDETERMINATE: No aggregate model registered for type '${aggregateType}'`,
            },
          }
        );
        result.quarantinedCount++;
        result.details.push({
          eventId,
          clientMutationId: intent.clientMutationId,
          outcome: "QUARANTINED",
          reason: `Unresolvable aggregate model for type '${aggregateType}'`,
        });
        continue;
      }

      const aggQuery = aggregateModel.findById(aggregateId);
      const aggregateDoc = aggQuery && typeof (aggQuery as any).lean === "function"
        ? await (aggQuery as any).lean()
        : await aggQuery;

      if (!aggregateDoc) {
        await this.outboxModel.updateOne(
          { _id: intentEvent._id },
          {
            $set: {
              deliveryStatus: "DEAD_LETTER",
              failureReason: `STANDALONE_INTENT_OUTCOME_INDETERMINATE: Aggregate '${aggregateId}' not found during recovery`,
            },
          }
        );
        result.quarantinedCount++;
        result.details.push({
          eventId,
          clientMutationId: intent.clientMutationId,
          outcome: "QUARANTINED",
          reason: "Aggregate not found",
        });
        continue;
      }

      // Check in-document recentMutationReceipts
      const inDocMatch = aggregateDoc.recentMutationReceipts?.find(
        (r: any) => r.clientMutationId === intent.clientMutationId
      );

      if (inDocMatch) {
        // Positive commit evidence found in document ring buffer!
        // Reconstruct durable receipt record
        const receiptId = `${userId}:${aggregateId}:${intent.clientMutationId}`;
        await this.receiptModel.findOneAndUpdate(
          { receiptId },
          {
            $setOnInsert: {
              receiptId,
              userId,
              aggregateId,
              clientMutationId: intent.clientMutationId,
              version: inDocMatch.version || (intent.expectedVersion ?? 0) + 1,
              fencingEpoch: intent.fencingEpoch ?? 0,
              diffHash: intent.diffHash ?? "sweeper_reconstructed",
              status: "COMMITTED",
              appliedAt: inDocMatch.appliedAt || new Date(),
              retentionExpiresAt: new Date(Date.now() + 7 * 86400000),
            },
          },
          { upsert: true }
        );

        await this.outboxModel.updateOne(
          { _id: intentEvent._id },
          { $set: { deliveryStatus: "PENDING" } }
        );
        result.promotedCount++;
        result.details.push({
          eventId,
          clientMutationId: intent.clientMutationId,
          outcome: "PROMOTED",
          reason: "Positive commit evidence found in aggregate recentMutationReceipts",
        });
        continue;
      }

      // Check 3: Positive Non-Commit Proof via Monotonic Epoch Fencing
      const docVersion = aggregateDoc.version;
      const docEpoch = aggregateDoc.mutationEpoch ?? 0;

      if (docVersion === intent.expectedVersion && docEpoch === intent.fencingEpoch) {
        // Attempt atomic epoch burn on aggregate root
        const burnResult = await aggregateModel.updateOne(
          {
            _id: aggregateId,
            version: intent.expectedVersion,
            mutationEpoch: intent.fencingEpoch,
          },
          {
            $inc: { mutationEpoch: 1 },
          }
        );

        if (burnResult.matchedCount > 0) {
          // Atomic epoch burn succeeded! The delayed original request is now permanently fenced out.
          const receiptId = `${userId}:${aggregateId}:${intent.clientMutationId}`;
          await this.receiptModel.findOneAndUpdate(
            { receiptId },
            {
              $setOnInsert: {
                receiptId,
                userId,
                aggregateId,
                clientMutationId: intent.clientMutationId,
                version: intent.expectedVersion ?? 0,
                fencingEpoch: intent.fencingEpoch ?? 0,
                diffHash: intent.diffHash ?? "sweeper_aborted",
                status: "ABORTED_BY_RECOVERY",
                appliedAt: new Date(),
                retentionExpiresAt: new Date(Date.now() + 7 * 86400000),
              },
            },
            { upsert: true }
          );

          await this.outboxModel.updateOne(
            { _id: intentEvent._id },
            { $set: { deliveryStatus: "ABORTED" } }
          );
          result.abortedCount++;
          result.details.push({
            eventId,
            clientMutationId: intent.clientMutationId,
            outcome: "ABORTED",
            reason: "Atomic epoch burn succeeded: delayed mutation permanently fenced out",
          });
          continue;
        }
      }

      // Check 4: Indeterminate Outcome Handling (V2.4 Correction A)
      // If version has advanced beyond expectedVersion and receipt is absent from ring buffer,
      // we CANNOT determine whether it committed and was evicted or never committed.
      // We MUST NEVER classify as ABORTED based on version alone.
      await this.outboxModel.updateOne(
        { _id: intentEvent._id },
        {
          $set: {
            deliveryStatus: "DEAD_LETTER",
            failureReason: `STANDALONE_INTENT_OUTCOME_INDETERMINATE: Intent receipt absent and aggregate version (${docVersion}) advanced beyond expected (${intent.expectedVersion}) without positive proof.`,
          },
        }
      );
      result.quarantinedCount++;
      result.details.push({
        eventId,
        clientMutationId: intent.clientMutationId,
        outcome: "QUARANTINED",
        reason: "STANDALONE_INTENT_OUTCOME_INDETERMINATE: aggregate version advanced without positive evidence",
      });
    }

    return result;
  }
}
