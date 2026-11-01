/**
 * TemporalConflictConsumer.ts
 * 
 * Implements Temporal Schedule Solver & Governed Conflict Detection.
 * Milestone B — Step 2 V2.2 Canonical Projection Consumer.
 * Adheres strictly to:
 * - Deterministic SHA-256 Partition Manifest Hash across sorted occurrence tuples
 * - Pre-commit source snapshot revalidation
 * - Dual-date invalidation for rescheduled events (oldDate and newDate)
 * - Atomic CAS updates on sweepRevision with bounded retries
 * - Strict Human Governance Invariant: Consequential repairs remain PENDING_CONFIRMATION
 */

import * as crypto from "crypto";
import { ICanonicalConsumer } from "./ConsumerRegistry";
import {
  ICanonicalEventEnvelope,
  ConsumerExecutionStatus,
} from "../contracts/CanonicalEventContracts";
import {
  ScheduleConflictReportModel,
  IScheduleConflictItem,
  IProposedAdjustment,
} from "../../../../../apps/web/server/db/models/ScheduleConflictReportModel";
import {
  TemporalOccurrence,
} from "../../../../../apps/web/server/db/models/TemporalOccurrence";

export interface TemporalConflictConsumerDependencies {
  conflictReportModel?: any;
  occurrenceModel?: any;
}

async function resolveQuery<T = any>(queryOrPromise: any): Promise<T> {
  if (!queryOrPromise) return queryOrPromise;
  if (typeof queryOrPromise.lean === "function") {
    return await queryOrPromise.lean();
  }
  return await queryOrPromise;
}

export class TemporalConflictConsumer implements ICanonicalConsumer {
  public name = "TemporalConflictConsumer";
  public targetCategories = ["DOMAIN_EVENT" as const];
  public targetTypes = [
    "domain.temporal.scheduled",
    "domain.temporal.rescheduled",
    "domain.temporal.occurrence_created",
    "domain.temporal.occurrence_deleted",
    "domain.task.completed",
  ];

  private conflictReportModel: any;
  private occurrenceModel: any;

  constructor(deps?: TemporalConflictConsumerDependencies) {
    this.conflictReportModel =
      deps?.conflictReportModel || ScheduleConflictReportModel;
    this.occurrenceModel = deps?.occurrenceModel || TemporalOccurrence;
  }

  public async process(
    envelope: ICanonicalEventEnvelope,
    leaseGeneration: number
  ): Promise<{ status: ConsumerExecutionStatus; error?: string }> {
    try {
      const payload = envelope.payload || {};
      const userId = String(envelope.userId);

      const targetDates = new Set<string>();
      const primaryDate =
        payload.dateOnly ||
        payload.date ||
        (envelope.occurredAt ? new Date(envelope.occurredAt).toISOString().split("T")[0] : null);

      if (primaryDate) targetDates.add(primaryDate);

      // Handle dual-date invalidation for rescheduling
      if (envelope.type === "domain.temporal.rescheduled") {
        if (payload.oldDateOnly) targetDates.add(payload.oldDateOnly);
        if (payload.previousDateOnly) targetDates.add(payload.previousDateOnly);
        if (payload.newDateOnly) targetDates.add(payload.newDateOnly);
      }

      if (targetDates.size === 0) {
        return { status: "SUCCEEDED" };
      }

      let hasSucceeded = false;
      let hasSkippedStale = false;
      for (const dateOnly of targetDates) {
        const sweepResult = await this.sweepPartition(userId, dateOnly, envelope);
        if (sweepResult.status === "SUCCEEDED") {
          hasSucceeded = true;
        } else if (sweepResult.status === "SKIPPED_STALE") {
          hasSkippedStale = true;
        } else {
          return sweepResult;
        }
      }

      if (hasSkippedStale && !hasSucceeded) {
        return { status: "SKIPPED_STALE" };
      }

      return { status: "SUCCEEDED" };
    } catch (err: any) {
      return {
        status: "FAILED_RETRYABLE",
        error: err?.message || "TemporalConflictConsumer failed",
      };
    }
  }

  public async sweepPartition(
    userId: string,
    dateOnly: string,
    envelope?: ICanonicalEventEnvelope
  ): Promise<{ status: ConsumerExecutionStatus; error?: string }> {
    const reportId = `report_${userId}_${dateOnly}`;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const currentDoc = await resolveQuery(
        this.conflictReportModel.findOne({ reportId })
      );

      // Tenant isolation validation
      if (currentDoc && currentDoc.userId && currentDoc.userId !== userId) {
        return {
          status: "FAILED_TERMINAL",
          error: `Tenant mismatch: document user ${currentDoc.userId} does not match ${userId}`,
        };
      }

      // 1. Exact Event Redelivery Idempotency Guard
      if (currentDoc && envelope && currentDoc.lastEventId === envelope.eventId) {
        return { status: "SUCCEEDED" };
      }

      // 2. Causal sequence monotonicity guard
      if (
        currentDoc?.derivedFromCausalSequence &&
        envelope?.causalSequence &&
        currentDoc.derivedFromCausalSequence >= envelope.causalSequence
      ) {
        return { status: "SKIPPED_STALE" };
      }

      // 1. Capture Source Occurrences
      const rawOccurrences = await resolveQuery(
        this.occurrenceModel.find({
          userId,
          dateOnly,
          status: { $in: ["SCHEDULED", "IN_PROGRESS", "RESCHEDULED"] },
        })
      );

      const occurrences = Array.isArray(rawOccurrences) ? [...rawOccurrences] : [];

      // Sort deterministically by startMinute, then ID
      occurrences.sort((a: any, b: any) => {
        const startA = a.plannedInterval?.startMinute ?? 0;
        const startB = b.plannedInterval?.startMinute ?? 0;
        if (startA !== startB) return startA - startB;
        return String(a._id || a.occurrenceId || "").localeCompare(
          String(b._id || b.occurrenceId || "")
        );
      });

      // 2. Compute Deterministic SHA-256 Partition Manifest Hash
      const manifestTuples = occurrences.map((o: any) => [
        String(o.occurrenceId || o._id),
        Number(o.version || 1),
        String(o.status || ""),
        Number(o.plannedInterval?.startMinute ?? 0),
        Number(o.plannedInterval?.endMinute ?? 0),
      ]);
      const manifestHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(manifestTuples))
        .digest("hex");

      // Idempotency check: if report already swept with identical source manifest
      if (
        currentDoc &&
        currentDoc.sourceManifestHash === manifestHash &&
        envelope &&
        currentDoc.lastEventId === envelope.eventId
      ) {
        return { status: "SUCCEEDED" };
      }

      // 3. Pairwise Interval Conflict Detection
      const conflicts: IScheduleConflictItem[] = [];
      const proposedAdjustments: IProposedAdjustment[] = [];

      for (let i = 0; i < occurrences.length; i++) {
        for (let j = i + 1; j < occurrences.length; j++) {
          const a = occurrences[i];
          const b = occurrences[j];

          const startA = a.plannedInterval?.startMinute ?? 0;
          const endA =
            a.plannedInterval?.endMinute ??
            startA + (a.plannedInterval?.durationMinutes ?? 0);

          const startB = b.plannedInterval?.startMinute ?? 0;
          const endB =
            b.plannedInterval?.endMinute ??
            startB + (b.plannedInterval?.durationMinutes ?? 0);

          if (startA < endB && startB < endA) {
            const overlapMinutes = Math.min(endA, endB) - Math.max(startA, startB);
            conflicts.push({
              occurrenceIdA: String(a.occurrenceId || a._id),
              occurrenceIdB: String(b.occurrenceId || b._id),
              titleA: a.title || "Untitled",
              titleB: b.title || "Untitled",
              reason: `Interval overlap between '${a.title}' (${startA}-${endA}) and '${b.title}' (${startB}-${endB})`,
              overlapMinutes,
            });

            const adjustable =
              a.rigidity === "ELASTIC" || a.rigidity === "OPTIONAL" ? a : b;
            const anchor = adjustable === a ? b : a;
            const anchorEnd = anchor.plannedInterval?.endMinute ?? 0;

            // Strict Human Governance Invariant
            proposedAdjustments.push({
              occurrenceId: String(adjustable.occurrenceId || adjustable._id),
              title: adjustable.title || "Untitled",
              originalStartMinute: adjustable.plannedInterval?.startMinute ?? 0,
              proposedStartMinute: anchorEnd + 10,
              reason: `Shift '${adjustable.title}' to ${anchorEnd + 10}m to eliminate overlap with '${anchor.title}'`,
            });
          }
        }
      }

      const hasConflicts = conflicts.length > 0;
      const repairPlan = hasConflicts
        ? {
            planId: `plan_${reportId}_${Date.now()}`,
            status: "PENDING_CONFIRMATION" as const, // Strict Human Governance Invariant
            requiresConfirmation: true,
            proposedAdjustments,
          }
        : null;

      // 4. Pre-Commit Source Revalidation
      const recheckRaw = await resolveQuery(
        this.occurrenceModel.find({
          userId,
          dateOnly,
          status: { $in: ["SCHEDULED", "IN_PROGRESS", "RESCHEDULED"] },
        })
      );
      const recheckOccs = Array.isArray(recheckRaw) ? [...recheckRaw] : [];
      recheckOccs.sort((a: any, b: any) => {
        const startA = a.plannedInterval?.startMinute ?? 0;
        const startB = b.plannedInterval?.startMinute ?? 0;
        if (startA !== startB) return startA - startB;
        return String(a._id || a.occurrenceId || "").localeCompare(
          String(b._id || b.occurrenceId || "")
        );
      });
      const recheckTuples = recheckOccs.map((o: any) => [
        String(o.occurrenceId || o._id),
        Number(o.version || 1),
        String(o.status || ""),
        Number(o.plannedInterval?.startMinute ?? 0),
        Number(o.plannedInterval?.endMinute ?? 0),
      ]);
      const recheckHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(recheckTuples))
        .digest("hex");

      if (recheckHash !== manifestHash) {
        // Source occurrences mutated mid-sweep -> retry
        continue;
      }

      // 5. Atomic CAS Commit on sweepRevision
      const currentRevision = currentDoc?.sweepRevision ?? 0;
      const filter: Record<string, any> = { reportId };
      if (currentDoc && typeof currentDoc.sweepRevision === "number") {
        filter.sweepRevision = currentRevision;
      }

      const updates = {
        $set: {
          reportId,
          userId,
          dateOnly,
          hasConflicts,
          conflicts,
          repairPlan,
          sourceManifestHash: manifestHash,
          derivedFromCausalSequence: envelope?.causalSequence || currentDoc?.derivedFromCausalSequence || 0,
          lastSweptAt: new Date(),
          lastEventId: envelope?.eventId || currentDoc?.lastEventId || "sweep",
          lastAppliedAt: new Date(),
        },
        $inc: { sweepRevision: 1 },
      };

      let updateResult: any = null;
      if (typeof this.conflictReportModel.findOneAndUpdate === "function") {
        updateResult = await this.conflictReportModel.findOneAndUpdate(
          filter,
          updates,
          { upsert: true, new: true }
        );
      } else if (typeof this.conflictReportModel.updateOne === "function") {
        const res = await this.conflictReportModel.updateOne(filter, updates);
        if (res && res.matchedCount > 0) {
          updateResult = await resolveQuery(
            this.conflictReportModel.findOne({ reportId })
          );
        } else if (!currentDoc && typeof this.conflictReportModel.create === "function") {
          updateResult = await this.conflictReportModel.create({
            ...updates.$set,
            sweepRevision: 1,
          });
        }
      }

      if (updateResult) {
        return { status: "SUCCEEDED" };
      }
    }

    return {
      status: "FAILED_RETRYABLE",
      error: "CONTENTION_LIMIT_EXHAUSTED",
    };
  }
}
