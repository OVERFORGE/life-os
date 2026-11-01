/**
 * BehavioralProfileRepository.ts
 * 
 * Milestone B — Phase B3: Work Package 2 / Loop 3
 * Authoritative Observation Journal & Lock-Free CAS Behavioral Profile Repository
 * 
 * Strict Invariants:
 * 1. Authoritative Journal: BehavioralObservationModel is the source of truth.
 * 2. Safe Recovery: Eviction from 50-entry recentObservationIds ring buffer never causes
 *    double-counting or lost updates on redelivery.
 * 3. Corrected Six-State Concurrency Protocol: Clean atomic race resolution on initialization.
 * 4. Lock-Free CAS Rebuild Fencing: Atomic Compare-And-Swap on projectionRevision prevents
 *    older rebuild snapshots from overwriting newer live observations.
 */

import {
  RawObservationInput,
  calculateBehavioralMetrics,
  calculateDecayWeight,
} from "./BehavioralProfileCalculator";

export interface BehavioralObservationDraft {
  observationId: string;
  userId: string;
  source: string;
  category: "EXECUTION" | "PHYSICAL" | "COGNITIVE" | "ROUTINE" | "TEMPORAL";
  type: string;
  causalSequence: number;
  observedAt: Date;
  data: Record<string, any>;
}

export interface IngestionResult {
  status: "SUCCEEDED" | "SKIPPED_ALREADY_APPLIED" | "CONCURRENT_CONFLICT_RETRY";
  observationId: string;
  projectionRevision: number;
}

export interface RebuildResult {
  success: boolean;
  abortedDueToConcurrentEvent: boolean;
  newRevision?: number;
  reason?: string;
}

export interface BehavioralProfileRepositoryDependencies {
  observationModel?: any;
  profileModel?: any;
}

export class BehavioralProfileRepository {
  private static instance: BehavioralProfileRepository;
  private observationModel: any;
  private profileModel: any;

  constructor(deps?: BehavioralProfileRepositoryDependencies) {
    this.observationModel = deps?.observationModel;
    this.profileModel = deps?.profileModel;
  }

  public static getInstance(deps?: BehavioralProfileRepositoryDependencies): BehavioralProfileRepository {
    if (!BehavioralProfileRepository.instance || deps) {
      BehavioralProfileRepository.instance = new BehavioralProfileRepository(deps);
    }
    return BehavioralProfileRepository.instance;
  }

  public setModels(deps: BehavioralProfileRepositoryDependencies): void {
    if (deps.observationModel) this.observationModel = deps.observationModel;
    if (deps.profileModel) this.profileModel = deps.profileModel;
  }

  private async ensureModels(): Promise<void> {
    if (!this.observationModel) {
      const { BehavioralObservationModel } = await import(
        "../../../../apps/web/server/db/models/BehavioralObservationModel"
      );
      this.observationModel = BehavioralObservationModel;
    }
    if (!this.profileModel) {
      const { BehavioralProfile } = await import(
        "../../../../apps/web/server/db/models/BehavioralProfile"
      );
      this.profileModel = BehavioralProfile;
    }
  }

  /**
   * Ingests an observation according to the Corrected Six-State Protocol.
   */
  public async ingestObservation(
    draft: BehavioralObservationDraft,
    maxRetries: number = 3
  ): Promise<IngestionResult> {
    await this.ensureModels();

    // Step 1: Idempotent Journal Upsert (default status: PENDING)
    let journalDoc = await this.observationModel.findOne({ observationId: draft.observationId });
    if (!journalDoc) {
      try {
        journalDoc = await this.observationModel.create({
          observationId: draft.observationId,
          userId: draft.userId,
          source: draft.source,
          category: draft.category,
          type: draft.type,
          causalSequence: draft.causalSequence,
          observedAt: draft.observedAt,
          data: draft.data || {},
          projectionStatus: "PENDING",
        });
      } catch (err: any) {
        if (err.code === 11000 || String(err).includes("E11000")) {
          journalDoc = await this.observationModel.findOne({ observationId: draft.observationId });
        } else {
          throw err;
        }
      }
    }

    // Step 2: Check Journal Projection Status
    // State 4: OBSERVATION_ALREADY_INCORPORATED
    if (journalDoc?.projectionStatus === "APPLIED") {
      const profile = await this.profileModel.findOne({ userId: draft.userId });
      return {
        status: "SKIPPED_ALREADY_APPLIED",
        observationId: draft.observationId,
        projectionRevision: profile?.projectionRevision ?? 0,
      };
    }

    // Attempt Six-State Incorporation with bounded retries for CAS conflicts
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      let profile = await this.profileModel.findOne({ userId: draft.userId });

      // State 1: DOCUMENT_ABSENT
      if (!profile) {
        try {
          const initCalc = calculateBehavioralMetrics([draft], new Date());
          const newDoc = await this.profileModel.create({
            userId: draft.userId,
            sourceCursors: initCalc.sourceCursors,
            recentObservationIds: [draft.observationId],
            projectionRevision: 1,
            metrics: initCalc.metrics,
            lastRecalculatedAt: new Date(),
          });

          // State 2: INITIALIZATION_WON
          await this.observationModel.updateOne(
            { observationId: draft.observationId },
            { $set: { projectionStatus: "APPLIED" } }
          );

          return {
            status: "SUCCEEDED",
            observationId: draft.observationId,
            projectionRevision: 1,
          };
        } catch (err: any) {
          if (err.code === 11000 || String(err).includes("E11000")) {
            // State 3: ALREADY_INITIALIZED_BY_CONCURRENT_WORKER -> loop re-queries
            continue;
          }
          throw err;
        }
      }

      // Profile exists: Check 50-entry ring buffer
      const recentIds: string[] = profile.recentObservationIds || [];
      if (recentIds.includes(draft.observationId)) {
        // State 4: OBSERVATION_ALREADY_INCORPORATED via Ring Buffer
        await this.observationModel.updateOne(
          { observationId: draft.observationId },
          { $set: { projectionStatus: "APPLIED" } }
        );
        return {
          status: "SKIPPED_ALREADY_APPLIED",
          observationId: draft.observationId,
          projectionRevision: profile.projectionRevision,
        };
      }

      // State 5: OBSERVATION_NEW_OR_RECOVERY
      const currentRevision = profile.projectionRevision || 0;
      const cursorKey = `${draft.source}:${draft.data?.aggregateId || draft.source}`;
      const existingCursor = profile.sourceCursors?.[cursorKey] ?? 0;
      const nextCursor = Math.max(existingCursor, draft.causalSequence);

      // Fetch all applied observations for incremental/consistent update
      const allJournalObs = await this.observationModel.find({
        userId: draft.userId,
      });

      const calcResult = calculateBehavioralMetrics(allJournalObs, new Date());
      calcResult.sourceCursors[cursorKey] = nextCursor;

      const updateQuery = {
        userId: draft.userId,
        projectionRevision: currentRevision,
      };

      const updateOp = {
        $set: {
          metrics: calcResult.metrics,
          sourceCursors: calcResult.sourceCursors,
          lastRecalculatedAt: new Date(),
        },
        $inc: { projectionRevision: 1 },
        $push: {
          recentObservationIds: {
            $each: [draft.observationId],
            $slice: -50, // Ring buffer capped at 50
          },
        },
      };

      const updateRes = await this.profileModel.updateOne(updateQuery, updateOp);

      if (updateRes.matchedCount === 0) {
        // State 6: CONCURRENT_MODIFICATION_RETRY
        if (attempt === maxRetries - 1) {
          return {
            status: "CONCURRENT_CONFLICT_RETRY",
            observationId: draft.observationId,
            projectionRevision: currentRevision,
          };
        }
        continue;
      }

      // Status update to journal strictly after profile update
      await this.observationModel.updateOne(
        { observationId: draft.observationId },
        { $set: { projectionStatus: "APPLIED" } }
      );

      return {
        status: "SUCCEEDED",
        observationId: draft.observationId,
        projectionRevision: currentRevision + 1,
      };
    }

    return {
      status: "CONCURRENT_CONFLICT_RETRY",
      observationId: draft.observationId,
      projectionRevision: 0,
    };
  }

  /**
   * Safe Projection Rebuild Fencing.
   * Lock-free CAS rebuild of BehavioralProfile from authoritative journal.
   */
  public async rebuildProfile(userId: string): Promise<RebuildResult> {
    await this.ensureModels();

    // 1. Read Current Profile: get currentRevision
    const currentProfile = await this.profileModel.findOne({ userId });
    const currentRevision = currentProfile?.projectionRevision ?? 0;

    // 2. Establish Snapshot Watermark
    const snapshotWatermark = new Date();

    // 3. Query Authoritative Journal up to snapshotWatermark
    const journalDocs = await this.observationModel.find({
      userId,
      observedAt: { $lte: snapshotWatermark },
    });

    // 4. Pure Functional Calculation
    const calcResult = calculateBehavioralMetrics(journalDocs, snapshotWatermark);

    // 5. Atomic Compare-And-Swap Write
    if (!currentProfile) {
      try {
        await this.profileModel.create({
          userId,
          sourceCursors: calcResult.sourceCursors,
          recentObservationIds: calcResult.recentObservationIds,
          projectionRevision: 1,
          metrics: calcResult.metrics,
          lastRecalculatedAt: snapshotWatermark,
        });
        return {
          success: true,
          abortedDueToConcurrentEvent: false,
          newRevision: 1,
        };
      } catch (err: any) {
        if (err.code === 11000 || String(err).includes("E11000")) {
          return {
            success: false,
            abortedDueToConcurrentEvent: true,
            reason: "Concurrent worker initialized profile during rebuild",
          };
        }
        throw err;
      }
    }

    const casFilter = {
      userId,
      projectionRevision: currentRevision,
    };

    const casUpdate = {
      $set: {
        metrics: calcResult.metrics,
        sourceCursors: calcResult.sourceCursors,
        recentObservationIds: calcResult.recentObservationIds,
        lastRecalculatedAt: snapshotWatermark,
      },
      $inc: { projectionRevision: 1 },
    };

    const casResult = await this.profileModel.updateOne(casFilter, casUpdate);

    if (casResult.matchedCount === 0) {
      // Live event modified profile concurrently! Safe Abort.
      return {
        success: false,
        abortedDueToConcurrentEvent: true,
        reason: `Live observation advanced profile projectionRevision beyond ${currentRevision}. Rebuild aborted to preserve live updates.`,
      };
    }

    return {
      success: true,
      abortedDueToConcurrentEvent: false,
      newRevision: currentRevision + 1,
    };
  }

  public async getProfile(userId: string): Promise<any | null> {
    await this.ensureModels();
    const query = this.profileModel.findOne({ userId });
    return query && typeof query.lean === "function" ? await query.lean() : await query;
  }
}
