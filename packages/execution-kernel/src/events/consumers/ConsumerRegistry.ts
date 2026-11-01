/**
 * ConsumerRegistry.ts
 * 
 * Implements Consumer Registration, Partial Acknowledgment Tracking, and Isolation.
 * Resolves WP2 / Loop 4 requirements:
 * - Consumer registry with category and event type matching
 * - Sibling consumer isolation: failure in one consumer does not rollback or re-execute succeeded siblings
 * - Durable ConsumerProcessingLedger tracking to prevent duplicate downstream execution
 * - Outbox dispatcher integration hook
 */

import {
  ICanonicalEventEnvelope,
  CanonicalEventCategory,
  ConsumerExecutionStatus,
} from "../contracts/CanonicalEventContracts";
import {
  ConsumerProcessingLedgerModel,
  IConsumerProcessingLedgerDoc,
} from "../../../../../apps/web/server/db/models/ConsumerProcessingLedgerModel";

export interface ICanonicalConsumer {
  name: string;
  targetCategories: CanonicalEventCategory[];
  targetTypes: string[]; // Specific types or ["*"]
  process(
    envelope: ICanonicalEventEnvelope,
    leaseGeneration: number
  ): Promise<{
    status: ConsumerExecutionStatus;
    error?: string;
  }>;
}

export interface ConsumerRegistryDependencies {
  ledgerModel?: any;
}

export class ConsumerRegistry {
  private consumers: Map<string, ICanonicalConsumer> = new Map();
  private ledgerModel: any;

  constructor(deps?: ConsumerRegistryDependencies) {
    this.ledgerModel = deps?.ledgerModel || ConsumerProcessingLedgerModel;
  }

  /**
   * Register a consumer.
   */
  public register(consumer: ICanonicalConsumer): void {
    if (this.consumers.has(consumer.name)) {
      throw new Error(`Consumer with name '${consumer.name}' is already registered.`);
    }
    this.consumers.set(consumer.name, consumer);
  }

  /**
   * Unregister a consumer by name.
   */
  public unregister(name: string): void {
    this.consumers.delete(name);
  }

  /**
   * Clear all registered consumers.
   */
  public clear(): void {
    this.consumers.clear();
  }

  /**
   * Get all registered consumers matching the envelope's category and type.
   */
  public getMatchingConsumers(envelope: ICanonicalEventEnvelope): ICanonicalConsumer[] {
    const matches: ICanonicalConsumer[] = [];
    for (const consumer of this.consumers.values()) {
      const categoryMatch =
        consumer.targetCategories.length === 0 ||
        consumer.targetCategories.includes(envelope.category);

      const typeMatch =
        consumer.targetTypes.includes("*") ||
        consumer.targetTypes.includes(envelope.type);

      if (categoryMatch && typeMatch) {
        matches.push(consumer);
      }
    }
    return matches;
  }

  /**
   * Dispatch an event to all matching consumers with partial acknowledgment isolation.
   */
  public async dispatch(
    envelope: ICanonicalEventEnvelope,
    leaseGeneration: number
  ): Promise<{ success: boolean; error?: string; processedConsumers: string[]; skippedConsumers: string[] }> {
    const matchingConsumers = this.getMatchingConsumers(envelope);
    if (matchingConsumers.length === 0) {
      return { success: true, processedConsumers: [], skippedConsumers: [] };
    }

    let anyFailed = false;
    const errors: string[] = [];
    const processedConsumers: string[] = [];
    const skippedConsumers: string[] = [];

    for (const consumer of matchingConsumers) {
      const ledgerKey = `${envelope.userId}:${consumer.name}:${envelope.eventId}`;

      // Check durable processing ledger for prior completion (Partial Acknowledgment)
      const query = this.ledgerModel.findOne({ ledgerKey });
      const existingLedger = query && typeof query.lean === "function" ? await query.lean() : await query;
      if (
        existingLedger &&
        (existingLedger.status === "SUCCEEDED" || existingLedger.status === "SKIPPED_STALE")
      ) {
        // Consumer already successfully processed this event during a prior attempt
        skippedConsumers.push(consumer.name);
        continue;
      }

      const start = Date.now();
      try {
        const result = await consumer.process(envelope, leaseGeneration);
        const durationMs = Date.now() - start;

        await this.ledgerModel.findOneAndUpdate(
          { ledgerKey },
          {
            $set: {
              ledgerKey,
              userId: envelope.userId,
              consumerName: consumer.name,
              eventId: envelope.eventId,
              aggregateId: envelope.aggregateId,
              aggregateVersion: envelope.aggregateVersion,
              causalSequence: envelope.causalSequence,
              status: result.status,
              executionDurationMs: durationMs,
              leaseGeneration,
              errorDetails: result.error || null,
              processedAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );

        if (result.status === "FAILED_RETRYABLE" || result.status === "FAILED_TERMINAL") {
          anyFailed = true;
          errors.push(`${consumer.name}: ${result.error || result.status}`);
        } else {
          processedConsumers.push(consumer.name);
        }
      } catch (err: any) {
        const durationMs = Date.now() - start;
        await this.ledgerModel.findOneAndUpdate(
          { ledgerKey },
          {
            $set: {
              ledgerKey,
              userId: envelope.userId,
              consumerName: consumer.name,
              eventId: envelope.eventId,
              aggregateId: envelope.aggregateId,
              aggregateVersion: envelope.aggregateVersion,
              causalSequence: envelope.causalSequence,
              status: "FAILED_RETRYABLE",
              executionDurationMs: durationMs,
              leaseGeneration,
              errorDetails: err?.message || "Unhandled exception in consumer",
              processedAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );

        anyFailed = true;
        errors.push(`${consumer.name}: ${err?.message || "Consumer exception"}`);
      }
    }

    if (anyFailed) {
      return {
        success: false,
        error: errors.join(" | "),
        processedConsumers,
        skippedConsumers,
      };
    }

    return {
      success: true,
      processedConsumers,
      skippedConsumers,
    };
  }

  /**
   * Helper to create a consumer handler directly pluggable into DurableOutboxDispatcher.
   */
  public createDispatchHandler() {
    return async (envelope: any, leaseGeneration: number) => {
      const res = await this.dispatch(envelope, leaseGeneration);
      return {
        success: res.success,
        error: res.error,
      };
    };
  }
}
