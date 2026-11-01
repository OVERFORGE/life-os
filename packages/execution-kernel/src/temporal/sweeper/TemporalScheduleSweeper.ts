/**
 * TemporalScheduleSweeper.ts
 * 
 * Step 4 Loop 4: Secondary Consistency Temporal Schedule Sweeper & Staged Revision Fencing
 * 
 * Enforces:
 * - Deterministic manifest calculation over sorted occurrence tuples
 * - Interval overlap detection with Human Sovereignty (status: "PENDING_CONFIRMATION")
 * - Mode A: Replica Set transaction re-verification
 * - Mode B: Standalone Staged Revision Locking against concurrent mid-sweep mutations
 * - Stale report prevention: Never publishes a conflict report over a newer partition revision
 */

import crypto from "crypto";
import { TemporalOccurrence } from "../../../../../apps/web/server/db/models/TemporalOccurrence";
import { ScheduleConflictReportModel, IScheduleConflictItem } from "../../../../../apps/web/server/db/models/ScheduleConflictReportModel";
import { TemporalPartitionRevisionModel } from "../../../../../apps/web/server/db/models/TemporalPartitionRevisionModel";
import { TemporalPartitionRevisionService } from "./TemporalPartitionRevisionService";

export interface TemporalScheduleSweeperDependencies {
  occurrenceModel?: any;
  conflictReportModel?: any;
  revisionModel?: any;
  revisionService?: TemporalPartitionRevisionService;
}

export interface SweepPartitionResult {
  userId: string;
  targetDate: string;
  status: "CLEAN" | "CONFLICTS_DETECTED" | "ABORTED_MID_SWEEP";
  conflictCount: number;
  sourcePartitionRevision: number;
  reportId?: string;
  manifestHash?: string;
}

export class TemporalScheduleSweeper {
  private occurrenceModel: any;
  private conflictReportModel: any;
  private revisionModel: any;
  private revisionService: TemporalPartitionRevisionService;

  constructor(deps?: TemporalScheduleSweeperDependencies) {
    this.occurrenceModel = deps?.occurrenceModel || TemporalOccurrence;
    this.conflictReportModel = deps?.conflictReportModel || ScheduleConflictReportModel;
    this.revisionModel = deps?.revisionModel || TemporalPartitionRevisionModel;
    this.revisionService = deps?.revisionService || new TemporalPartitionRevisionService(this.revisionModel);
  }

  /**
   * Calculates a canonical deterministic SHA-256 hash across sorted occurrence tuples.
   * Tuple format: (occurrenceId, version, startMinute, endMinute, status, titleHash)
   */
  public computePartitionManifest(occurrences: any[]): string {
    const sorted = [...occurrences].sort((a, b) =>
      String(a.occurrenceId || a._id).localeCompare(String(b.occurrenceId || b._id))
    );

    const tuples = sorted.map((occ) => {
      const occId = String(occ.occurrenceId || occ._id);
      const version = typeof occ.version === "number" ? occ.version : 1;
      const startMinute = occ.plannedInterval?.startMinute ?? 0;
      const endMinute = occ.plannedInterval?.endMinute ?? 0;
      const status = occ.status || "SCHEDULED";
      const titleHash = crypto.createHash("sha256").update(String(occ.title || "")).digest("hex");
      return [occId, version, startMinute, endMinute, status, titleHash];
    });

    return crypto.createHash("sha256").update(JSON.stringify(tuples)).digest("hex");
  }

  /**
   * Detects interval overlaps among active occurrences on the target date.
   */
  public detectConflicts(occurrences: any[]): IScheduleConflictItem[] {
    const active = occurrences.filter((occ) =>
      ["SCHEDULED", "IN_PROGRESS", "RESCHEDULED"].includes(occ.status) &&
      occ.plannedInterval &&
      typeof occ.plannedInterval.startMinute === "number" &&
      typeof occ.plannedInterval.endMinute === "number"
    );

    // Sort by startMinute ASC
    active.sort((a, b) => a.plannedInterval.startMinute - b.plannedInterval.startMinute);

    const conflicts: IScheduleConflictItem[] = [];

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const occA = active[i];
        const occB = active[j];

        const startA = occA.plannedInterval.startMinute;
        const endA = occA.plannedInterval.endMinute;
        const startB = occB.plannedInterval.startMinute;
        const endB = occB.plannedInterval.endMinute;

        // Check overlap condition: startA < endB && startB < endA
        if (startA < endB && startB < endA) {
          const overlapMinutes = Math.min(endA, endB) - Math.max(startA, startB);
          if (overlapMinutes > 0) {
            conflicts.push({
              occurrenceIdA: occA.occurrenceId || String(occA._id),
              occurrenceIdB: occB.occurrenceId || String(occB._id),
              titleA: occA.title || "Untitled Occurrence A",
              titleB: occB.title || "Untitled Occurrence B",
              reason: `Interval overlap: ${overlapMinutes} minutes between ${occA.title} and ${occB.title}`,
              overlapMinutes,
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Sweeps a partition for a user on targetDate enforcing publication revision fencing.
   */
  public async sweepPartition(
    userId: string,
    targetDate: string,
    workerId: string = "sweeper-worker",
    options?: { mode?: "MODE_A" | "MODE_B"; session?: any }
  ): Promise<SweepPartitionResult> {
    const mode = options?.mode || "MODE_B";

    // 1. Read current partition revision
    const revRecord = await this.revisionService.getPartitionRevision(userId, targetDate, this.revisionModel);
    const R_expected = revRecord.partitionRevision;

    // 2. Query active occurrences for user & targetDate
    const occurrences = await this.occurrenceModel.find({
      userId,
      dateOnly: targetDate,
    });

    // 3. Compute deterministic manifest hash
    const manifestHash = this.computePartitionManifest(occurrences);

    // 4. Check if report already exists and matches current revision & manifest
    const existingReport = await this.conflictReportModel.findOne({
      userId,
      dateOnly: targetDate,
    });

    if (
      existingReport &&
      existingReport.sourceManifestHash === manifestHash &&
      revRecord.publishedReportRevision === R_expected
    ) {
      return {
        userId,
        targetDate,
        status: existingReport.hasConflicts ? "CONFLICTS_DETECTED" : "CLEAN",
        conflictCount: existingReport.conflicts ? existingReport.conflicts.length : 0,
        sourcePartitionRevision: R_expected,
        reportId: existingReport.reportId,
        manifestHash,
      };
    }

    // 5. Detect conflicts
    const conflicts = this.detectConflicts(occurrences);
    const hasConflicts = conflicts.length > 0;
    const reportId = `report_${userId}_${targetDate}`;

    // Repair plan strictly enforces Human Sovereignty Invariant (status: "PENDING_CONFIRMATION")
    const repairPlan = hasConflicts
      ? {
        planId: `plan_${userId}_${targetDate}_${Date.now()}`,
        status: "PENDING_CONFIRMATION" as const,
        requiresConfirmation: true,
        proposedAdjustments: [],
      }
      : null;

    // 6. Commit report with publication fencing
    if (mode === "MODE_A" && options?.session) {
      // Mode A: In-transaction verification
      const currentRev = await this.revisionModel.findOne(
        { userId, dateStr: targetDate },
        null,
        { session: options.session }
      );
      if (currentRev && currentRev.partitionRevision !== R_expected) {
        // Occurrence was mutated in parallel! Abort cleanly.
        return {
          userId,
          targetDate,
          status: "ABORTED_MID_SWEEP",
          conflictCount: 0,
          sourcePartitionRevision: R_expected,
        };
      }

      await this.conflictReportModel.updateOne(
        { userId, dateOnly: targetDate },
        {
          $set: {
            reportId,
            userId,
            dateOnly: targetDate,
            hasConflicts,
            conflicts,
            repairPlan,
            sweepRevision: R_expected,
            sourceManifestHash: manifestHash,
            lastSweptAt: new Date(),
            lastEventId: `evt_sweep_${Date.now()}`,
            lastAppliedAt: new Date(),
          },
        },
        { upsert: true, session: options.session }
      );

      await this.revisionModel.updateOne(
        { userId, dateStr: targetDate },
        { $set: { publishedReportRevision: R_expected, lastModifiedAt: new Date() } },
        { session: options.session }
      );
    } else {
      // Mode B: Staged Revision Locking
      // Step B1: Acquire staged sweep lock
      const locked = await this.revisionService.acquireStagedSweepLock(
        userId,
        targetDate,
        R_expected,
        workerId,
        5000,
        this.revisionModel
      );

      if (!locked) {
        // Concurrent mutation occurred mid-sweep! Abort cleanly.
        return {
          userId,
          targetDate,
          status: "ABORTED_MID_SWEEP",
          conflictCount: 0,
          sourcePartitionRevision: R_expected,
        };
      }

      // Step B2: Upsert conflict report with sourcePartitionRevision R_expected
      await this.conflictReportModel.updateOne(
        { userId, dateOnly: targetDate },
        {
          $set: {
            reportId,
            userId,
            dateOnly: targetDate,
            hasConflicts,
            conflicts,
            repairPlan,
            sweepRevision: R_expected,
            sourceManifestHash: manifestHash,
            lastSweptAt: new Date(),
            lastEventId: `evt_sweep_${Date.now()}`,
            lastAppliedAt: new Date(),
          },
        },
        { upsert: true }
      );

      // Step B3: Commit published revision on partition record
      await this.revisionService.commitPublishedRevision(
        userId,
        targetDate,
        R_expected,
        workerId,
        this.revisionModel
      );
    }

    return {
      userId,
      targetDate,
      status: hasConflicts ? "CONFLICTS_DETECTED" : "CLEAN",
      conflictCount: conflicts.length,
      sourcePartitionRevision: R_expected,
      reportId,
      manifestHash,
    };
  }
}

