/**
 * ObservationPipeline.ts
 * Durable, idempotent ingestion pipeline handling normalization, deduplication, and storage.
 * Part of Phase 2 Continuous Telemetry Engine.
 */

import mongoose from "mongoose";
import { Observation, createFrozenObservation, ObservationType } from "../Observation";
import { ObservationModel } from "../../server/db/models/ObservationModel";
import { ObservationIngestionBatchResult } from "../contracts/ObservationEventContracts";

export type ObservationListener = (observations: Observation[]) => void;

export class ObservationPipeline {
  private static instance: ObservationPipeline;
  private listeners: Set<ObservationListener> = new Set();

  // In-memory cache for fast lookups and resilient offline/test execution
  private inMemoryObservations: Map<string, Observation> = new Map();

  static getInstance(): ObservationPipeline {
    if (!ObservationPipeline.instance) {
      ObservationPipeline.instance = new ObservationPipeline();
    }
    return ObservationPipeline.instance;
  }

  /**
   * Registers a real-time event listener for newly ingested observations.
   */
  public subscribe(listener: ObservationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Ingests a batch of observations with deterministic deduplication and bulk persistence.
   */
  public async ingestObservations(observations: Observation[]): Promise<ObservationIngestionBatchResult> {
    const startTime = performance.now();

    if (!observations || observations.length === 0) {
      return {
        totalSubmitted: 0,
        insertedCount: 0,
        duplicateCount: 0,
        failedCount: 0,
        durationMs: 0,
        observationIds: [],
      };
    }

    // 1. Validation & Local Deduplication within batch
    const uniqueBatchMap = new Map<string, Observation>();
    for (const obs of observations) {
      if (!obs.id || !obs.type || !obs.userId || obs.timestamp === undefined) {
        continue;
      }
      // Ensure normalizedValue bounded between 0 and 1
      const normalizedValue = Math.min(1.0, Math.max(0.0, obs.normalizedValue ?? 0));
      const confidence = Math.min(1.0, Math.max(0.0, obs.confidence ?? 1.0));

      const validatedObs: Observation = {
        ...obs,
        normalizedValue,
        confidence,
      };

      uniqueBatchMap.set(obs.id, validatedObs);
    }

    const uniqueObservations = Array.from(uniqueBatchMap.values());
    const duplicatesInBatch = observations.length - uniqueObservations.length;
    let insertedCount = 0;
    let duplicateCount = duplicatesInBatch;
    let failedCount = 0;

    // 2. Persist to MongoDB if connection is ready
    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      try {
        const operations = uniqueObservations.map((obs) => ({
          updateOne: {
            filter: { id: obs.id },
            update: {
              $setOnInsert: {
                id: obs.id,
                type: obs.type,
                userId: obs.userId,
                timestamp: obs.timestamp,
                generatedAt: obs.generatedAt,
                normalizedValue: obs.normalizedValue,
                rawValue: obs.rawValue,
                unit: obs.unit,
                confidence: obs.confidence,
                metadata: obs.metadata || {},
                provenance: {
                  source: obs.ownership?.sourceCollection || "unknown",
                  sourceId: obs.ownership?.sourceEntityId || obs.id,
                  subsystem: obs.ownership?.originatingSubsystem || "ObservationPipeline",
                  extractedAt: obs.generatedAt,
                },
              },
            },
            upsert: true,
          },
        }));

        const result = await ObservationModel.bulkWrite(operations, { ordered: false });
        insertedCount = result.upsertedCount;
        duplicateCount += result.matchedCount;
      } catch (err: any) {
        // In case of partial failures or duplicate key errors during race conditions
        if (err.writeErrors) {
          failedCount = err.writeErrors.length;
          insertedCount = err.result?.nUpserted ?? 0;
          duplicateCount += (uniqueObservations.length - insertedCount - failedCount);
        } else {
          failedCount = uniqueObservations.length;
        }
      }
    } else {
      // In-memory fallback
      for (const obs of uniqueObservations) {
        if (this.inMemoryObservations.has(obs.id)) {
          duplicateCount++;
        } else {
          this.inMemoryObservations.set(obs.id, obs);
          insertedCount++;
        }
      }
    }

    // Update in-memory cache for fast lookup
    for (const obs of uniqueObservations) {
      this.inMemoryObservations.set(obs.id, obs);
    }

    // 3. Emit to subscribers
    if (this.listeners.size > 0 && uniqueObservations.length > 0) {
      for (const listener of this.listeners) {
        try {
          listener(uniqueObservations);
        } catch (e) {
          // Listeners must never crash pipeline
        }
      }
    }

    const durationMs = Number((performance.now() - startTime).toFixed(2));

    return {
      totalSubmitted: observations.length,
      insertedCount,
      duplicateCount,
      failedCount,
      durationMs,
      observationIds: uniqueObservations.map((o) => o.id),
    };
  }

  /**
   * Retrieves observations for a user within a specified time window.
   */
  public async getObservationsForWindow(
    userId: string,
    startTimestamp: number,
    endTimestamp: number,
    types?: ObservationType[]
  ): Promise<Observation[]> {
    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      const query: any = {
        userId,
        timestamp: { $gte: startTimestamp, $lte: endTimestamp },
      };
      if (types && types.length > 0) {
        query.type = { $in: types };
      }

      const docs = await ObservationModel.find(query)
        .sort({ timestamp: -1 })
        .lean()
        .exec();

      return docs.map((doc: any) =>
        createFrozenObservation({
          id: doc.id,
          type: doc.type as ObservationType,
          userId: doc.userId,
          timestamp: doc.timestamp,
          generatedAt: doc.generatedAt,
          generatedBy: doc.provenance?.subsystem || "ObservationPipeline",
          confidence: doc.confidence ?? 1.0,
          normalizedValue: doc.normalizedValue,
          rawValue: doc.rawValue,
          unit: doc.unit,
          metadata: doc.metadata || {},
          ownership: {
            sourceCollection: doc.provenance?.source || "unknown",
            sourceEntityId: doc.provenance?.sourceId || doc.id,
            originatingSubsystem: doc.provenance?.subsystem || "ContinuousTelemetry",
            createdAt: doc.timestamp,
          },
        })
      );
    }

    // In-memory fallback
    const results: Observation[] = [];
    for (const obs of this.inMemoryObservations.values()) {
      if (
        obs.userId === userId &&
        obs.timestamp >= startTimestamp &&
        obs.timestamp <= endTimestamp &&
        (!types || types.length === 0 || types.includes(obs.type))
      ) {
        results.push(obs);
      }
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clears in-memory cache (primarily for test resets).
   */
  public clearMemoryCache(): void {
    this.inMemoryObservations.clear();
  }
}
