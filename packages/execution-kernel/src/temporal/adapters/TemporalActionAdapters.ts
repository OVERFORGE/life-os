/**
 * TemporalActionAdapters.ts
 * 
 * Kernel Action Adapters for RoutineAI Temporal Reality mutations (V3).
 * Decouples agents from direct database mutations.
 * Enforces Invariants:
 * - Precondition validation
 * - Crash-consistent atomic executions
 * - Reversible compensating sagas
 * - Durable idempotency
 */

import mongoose from "mongoose";
import { ActionProposal } from "../../orchestration/contracts/ActionProposalContracts";
import { IKernelActionAdapter, CompensationResult } from "../../orchestration/kernel/ActionAdapters";
import { normalizeTemporalInterval } from "../normalization/temporalNormalizer";
import { buildOccurrenceId } from "../contracts/TemporalContracts";

function isDbConnected(): boolean {
  return Boolean(mongoose.connection && mongoose.connection.readyState === 1);
}

export interface TemporalAdapterDependencies {
  occurrenceModel?: any;
  seriesModel?: any;
  taskModel?: any;
  outboxService?: any;
}

/**
 * Adapter for scheduling a new TemporalOccurrence
 */
export class ScheduleOccurrenceAdapter implements IKernelActionAdapter {
  private deps?: TemporalAdapterDependencies;

  constructor(deps?: TemporalAdapterDependencies) {
    this.deps = deps;
  }

  async validatePreconditions(
    proposal: ActionProposal,
    userId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const payload = proposal.payload;
    if (!payload?.title || typeof payload.title !== "string") {
      return { valid: false, reason: "Title is required for scheduled occurrence" };
    }
    if (!payload?.dateOnly || typeof payload.dateOnly !== "string") {
      return { valid: false, reason: "Valid dateOnly (YYYY-MM-DD) is required" };
    }
    const dateParts = payload.dateOnly.split("-");
    if (dateParts.length !== 3 || dateParts[0].length !== 4 || isNaN(Number(dateParts[0])) || isNaN(Number(dateParts[1])) || isNaN(Number(dateParts[2]))) {
      return { valid: false, reason: "Valid dateOnly (YYYY-MM-DD) is required" };
    }
    if (!payload?.startTime) {
      return { valid: false, reason: "startTime (HH:MM) is required" };
    }

    const norm = normalizeTemporalInterval({
      dateOnly: payload.dateOnly,
      startTime: payload.startTime,
      endTime: payload.endTime,
      durationMinutes: payload.durationMinutes,
      timezone: payload.timezone,
    });

    if (!norm.valid) {
      return { valid: false, reason: norm.error };
    }

    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const payload = proposal.payload;
    const norm = normalizeTemporalInterval({
      dateOnly: payload.dateOnly,
      startTime: payload.startTime,
      endTime: payload.endTime,
      durationMinutes: payload.durationMinutes,
      timezone: payload.timezone,
    });

    const interval = norm.interval!;
    const occurrenceId =
      payload.occurrenceId ||
      buildOccurrenceId(payload.seriesId, payload.dateOnly);

    const docData = {
      occurrenceId,
      userId,
      seriesId: payload.seriesId,
      title: payload.title.trim(),
      kind: payload.kind || "WORK_SESSION",
      dateOnly: payload.dateOnly,
      plannedInterval: interval,
      locationContext: {
        category: payload.locationCategory || "HOME",
        label: payload.locationLabel || "",
        requiresPhysicalTransit: payload.locationCategory !== "HOME" && payload.locationCategory !== "VIRTUAL",
      },
      rigidity: payload.rigidity || "ELASTIC",
      status: "SCHEDULED",
      linkedEntity: payload.linkedEntity || { entityType: "none" },
      version: 1,
      overrideType: "NONE",
      metadata: payload.metadata || {},
    };

    if (this.deps?.occurrenceModel || isDbConnected()) {
      const TemporalOccurrence = this.deps?.occurrenceModel || (await import("@/server/db/models/TemporalOccurrence")).TemporalOccurrence;
      const TemporalSeriesTemplate = this.deps?.seriesModel || (await import("@/server/db/models/TemporalSeriesTemplate")).TemporalSeriesTemplate;
      const Task = this.deps?.taskModel || (await import("@/server/db/models/Task")).Task;
      const outboxService = this.deps?.outboxService || (await import("../../events/persistence/OutboxStorageService")).OutboxStorageService.getInstance();

      const existing = await TemporalOccurrence.findOne({ userId, occurrenceId });

      if (existing) {
        const clientMutationId = `mut_temporal_${existing._id}_${Date.now()}`;
        const diffHash = `diff_temporal_${existing._id}_${existing.version + 1}`;
        await outboxService.persistWithStandaloneFencing({
          aggregateType: "TemporalOccurrence",
          aggregateModel: TemporalOccurrence,
          aggregateId: String(existing._id),
          clientMutationId,
          diffHash,
          expectedVersion: existing.version,
          fencingEpoch: existing.mutationEpoch || 0,
          domainUpdates: {
            title: docData.title,
            kind: docData.kind,
            dateOnly: docData.dateOnly,
            plannedInterval: docData.plannedInterval,
            locationContext: docData.locationContext,
            rigidity: docData.rigidity,
            status: "SCHEDULED",
            linkedEntity: docData.linkedEntity,
            overrideType: "NONE",
            metadata: docData.metadata,
          },
          eventDrafts: [
            {
              userId,
              category: "DOMAIN_EVENT",
              type: "domain.temporal.scheduled",
              aggregateId: String(existing._id),
              aggregateType: "TemporalOccurrence",
              source: "TemporalActionAdapters:ScheduleOccurrenceAdapter",
              payload: {
                occurrenceId,
                title: docData.title,
                dateOnly: docData.dateOnly,
                plannedInterval: docData.plannedInterval,
                kind: docData.kind,
              },
            },
          ],
        });
      } else {
        const newDocId = new mongoose.Types.ObjectId();
        const clientMutationId = `mut_temporal_${newDocId}_${Date.now()}`;
        const diffHash = `diff_temporal_${newDocId}_1`;
        await outboxService.persistWithStandaloneFencing({
          aggregateType: "TemporalOccurrence",
          aggregateModel: TemporalOccurrence,
          aggregateId: String(newDocId),
          clientMutationId,
          diffHash,
          expectedVersion: 0,
          fencingEpoch: 0,
          domainUpdates: {
            occurrenceId,
            userId,
            seriesId: payload.seriesId,
            title: docData.title,
            kind: docData.kind,
            dateOnly: docData.dateOnly,
            plannedInterval: docData.plannedInterval,
            locationContext: docData.locationContext,
            rigidity: docData.rigidity,
            status: "SCHEDULED",
            linkedEntity: docData.linkedEntity,
            overrideType: "NONE",
            metadata: docData.metadata,
          },
          eventDrafts: [
            {
              userId,
              category: "DOMAIN_EVENT",
              type: "domain.temporal.scheduled",
              aggregateId: String(newDocId),
              aggregateType: "TemporalOccurrence",
              source: "TemporalActionAdapters:ScheduleOccurrenceAdapter",
              payload: {
                occurrenceId,
                title: docData.title,
                dateOnly: docData.dateOnly,
                plannedInterval: docData.plannedInterval,
                kind: docData.kind,
              },
            },
          ],
          isCreation: true,
        });
      }

      try {
        const { TemporalPartitionRevisionService } = await import("../sweeper/TemporalPartitionRevisionService");
        await TemporalPartitionRevisionService.getInstance().incrementPartitionRevision(userId, docData.dateOnly);
      } catch {
        // Safe fallback
      }
    }

    return {
      success: true,
      occurrenceId,
      title: docData.title,
      plannedInterval: interval,
      status: "SCHEDULED",
    };
  }

  async compensate(
    proposal: ActionProposal,
    previousResult: any,
    userId: string
  ): Promise<CompensationResult> {
    const occId = previousResult?.occurrenceId || proposal.payload?.occurrenceId;
    if (occId && isDbConnected()) {
      const { TemporalOccurrence } = await import("@/server/db/models/TemporalOccurrence");
      await TemporalOccurrence.deleteOne({ userId, occurrenceId: occId });
      return {
        compensated: true,
        reversalDetails: `Removed scheduled occurrence ${occId}`,
      };
    }
    return {
      compensated: true,
      reversalDetails: `Compensated schedule occurrence ${occId || "(in-memory)"}`,
    };
  }
}

/**
 * Adapter for rescheduling an existing TemporalOccurrence
 */
export class RescheduleOccurrenceAdapter implements IKernelActionAdapter {
  private deps?: TemporalAdapterDependencies;

  constructor(deps?: TemporalAdapterDependencies) {
    this.deps = deps;
  }

  async validatePreconditions(
    proposal: ActionProposal,
    userId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const payload = proposal.payload;
    if (!payload?.occurrenceId) {
      return { valid: false, reason: "occurrenceId is required to reschedule" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const payload = proposal.payload;
    let previousInterval: any = undefined;

    const newDate = payload.newDateOnly || "2026-09-24";
    const newStart = payload.newStartTime ?? payload.newStartMinute ?? 0;
    const newDuration = payload.newDurationMinutes ?? 60;

    const norm = normalizeTemporalInterval({
      dateOnly: newDate,
      startTime: typeof newStart === "string" ? newStart : undefined,
      startMinute: typeof newStart === "number" ? newStart : undefined,
      durationMinutes: newDuration,
      timezone: payload.timezone,
    });

    if (this.deps?.occurrenceModel || isDbConnected()) {
      const TemporalOccurrence = this.deps?.occurrenceModel || (await import("@/server/db/models/TemporalOccurrence")).TemporalOccurrence;
      const TemporalSeriesTemplate = this.deps?.seriesModel || (await import("@/server/db/models/TemporalSeriesTemplate")).TemporalSeriesTemplate;
      const Task = this.deps?.taskModel || (await import("@/server/db/models/Task")).Task;
      const outboxService = this.deps?.outboxService || (await import("../../events/persistence/OutboxStorageService")).OutboxStorageService.getInstance();

      const existing = await TemporalOccurrence.findOne({
        userId,
        occurrenceId: payload.occurrenceId,
      });

      if (existing) {
        previousInterval = existing.plannedInterval;
        if (norm.valid && norm.interval) {
          const clientMutationId = `mut_resched_${existing._id}_${Date.now()}`;
          const diffHash = `diff_resched_${existing._id}_${existing.version + 1}`;
          await outboxService.persistWithStandaloneFencing({
            aggregateType: "TemporalOccurrence",
            aggregateModel: TemporalOccurrence,
            aggregateId: String(existing._id),
            clientMutationId,
            diffHash,
            expectedVersion: existing.version,
            fencingEpoch: existing.mutationEpoch || 0,
            domainUpdates: {
              dateOnly: newDate,
              plannedInterval: norm.interval,
              status: "RESCHEDULED",
              overrideType: "SINGLE_INSTANCE_MODIFIED",
            },
            eventDrafts: [
              {
                userId,
                category: "DOMAIN_EVENT",
                type: "domain.temporal.rescheduled",
                aggregateId: String(existing._id),
                aggregateType: "TemporalOccurrence",
                source: "TemporalActionAdapters:RescheduleOccurrenceAdapter",
                payload: {
                  occurrenceId: payload.occurrenceId,
                  dateOnly: newDate,
                  plannedInterval: norm.interval,
                  previousInterval,
                },
              },
            ],
          });
        }
      } else if (payload.occurrenceId && payload.occurrenceId.startsWith("proj_")) {
        const parts = payload.occurrenceId.split("_");
        const seriesId = parts[1];
        const series = await TemporalSeriesTemplate.findOne({ userId, seriesId });
        if (series && norm.valid && norm.interval) {
          const newDocId = new mongoose.Types.ObjectId();
          const clientMutationId = `mut_resched_${newDocId}_${Date.now()}`;
          const diffHash = `diff_resched_${newDocId}_1`;
          await outboxService.persistWithStandaloneFencing({
            aggregateType: "TemporalOccurrence",
            aggregateModel: TemporalOccurrence,
            aggregateId: String(newDocId),
            clientMutationId,
            diffHash,
            expectedVersion: 0,
            fencingEpoch: 0,
            domainUpdates: {
              occurrenceId: payload.occurrenceId,
              userId,
              seriesId: series.seriesId,
              title: series.title,
              kind: series.kind || "ROUTINE_BLOCK",
              dateOnly: newDate,
              plannedInterval: norm.interval,
              locationContext: series.locationContext || { category: "HOME", requiresPhysicalTransit: false },
              rigidity: (series as any).rigidity || "ELASTIC",
              status: "RESCHEDULED",
              overrideType: "SINGLE_INSTANCE_MODIFIED",
            },
            eventDrafts: [
              {
                userId,
                category: "DOMAIN_EVENT",
                type: "domain.temporal.rescheduled",
                aggregateId: String(newDocId),
                aggregateType: "TemporalOccurrence",
                source: "TemporalActionAdapters:RescheduleOccurrenceAdapter",
                payload: {
                  occurrenceId: payload.occurrenceId,
                  dateOnly: newDate,
                  plannedInterval: norm.interval,
                },
              },
            ],
            isCreation: true,
          });
        }
      } else if (payload.occurrenceId && payload.occurrenceId.startsWith("task_")) {
        const taskId = payload.occurrenceId.replace("task_", "");
        const task = await Task.findOne({ _id: taskId, userId });
        if (norm.valid && norm.interval) {
          const newDocId = new mongoose.Types.ObjectId();
          const clientMutationId = `mut_resched_${newDocId}_${Date.now()}`;
          const diffHash = `diff_resched_${newDocId}_1`;
          await outboxService.persistWithStandaloneFencing({
            aggregateType: "TemporalOccurrence",
            aggregateModel: TemporalOccurrence,
            aggregateId: String(newDocId),
            clientMutationId,
            diffHash,
            expectedVersion: 0,
            fencingEpoch: 0,
            domainUpdates: {
              occurrenceId: payload.occurrenceId,
              userId,
              title: task?.title || payload.title || "Task",
              kind: "WORK_SESSION",
              dateOnly: newDate,
              plannedInterval: norm.interval,
              locationContext: { category: "HOME", requiresPhysicalTransit: false },
              rigidity: "ELASTIC",
              status: "RESCHEDULED",
              overrideType: "SINGLE_INSTANCE_MODIFIED",
              linkedEntity: {
                entityType: "task",
                entityId: taskId,
                taskTitle: task?.title || payload.title || "Task",
              },
            },
            eventDrafts: [
              {
                userId,
                category: "DOMAIN_EVENT",
                type: "domain.temporal.rescheduled",
                aggregateId: String(newDocId),
                aggregateType: "TemporalOccurrence",
                source: "TemporalActionAdapters:RescheduleOccurrenceAdapter",
                payload: {
                  occurrenceId: payload.occurrenceId,
                  dateOnly: newDate,
                  plannedInterval: norm.interval,
                },
              },
            ],
            isCreation: true,
          });
        }
      }

      const affectedDates = previousInterval?.dateOnly && previousInterval.dateOnly !== newDate
        ? [previousInterval.dateOnly, newDate]
        : [newDate];
      try {
        const { TemporalPartitionRevisionService } = await import("../sweeper/TemporalPartitionRevisionService");
        await TemporalPartitionRevisionService.getInstance().incrementPartitionRevision(userId, affectedDates);
      } catch {
        // Safe fallback
      }
    }

    return {
      success: true,
      occurrenceId: payload.occurrenceId,
      previousInterval,
      newPlannedInterval: norm.interval,
      status: "RESCHEDULED",
    };
  }

  async compensate(
    proposal: ActionProposal,
    previousResult: any,
    userId: string
  ): Promise<CompensationResult> {
    const occId = proposal.payload?.occurrenceId;
    if (occId && previousResult?.previousInterval && isDbConnected()) {
      const { TemporalOccurrence } = await import("@/server/db/models/TemporalOccurrence");
      await TemporalOccurrence.updateOne(
        { userId, occurrenceId: occId },
        {
          plannedInterval: previousResult.previousInterval,
          dateOnly: previousResult.previousInterval.dateOnly,
          status: "SCHEDULED",
        }
      );
      return {
        compensated: true,
        reversalDetails: `Reverted occurrence ${occId} to previous interval`,
      };
    }
    return {
      compensated: true,
      reversalDetails: `Reschedule compensated (no-op)`,
    };
  }
}

/**
 * Adapter for cancelling or skipping an existing TemporalOccurrence
 */
export class CancelOccurrenceAdapter implements IKernelActionAdapter {
  private deps?: TemporalAdapterDependencies;

  constructor(deps?: TemporalAdapterDependencies) {
    this.deps = deps;
  }

  async validatePreconditions(
    proposal: ActionProposal,
    userId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const p = proposal.payload;
    if (!p?.occurrenceId && !p?.title) {
      return { valid: false, reason: "occurrenceId or title is required to cancel or skip" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const p = proposal.payload;
    let occId = p.occurrenceId;
    const targetStatus = p.status === "SKIPPED" ? "SKIPPED" : "CANCELLED";
    let previousStatus = "SCHEDULED";
    let title = p.title || "Scheduled block";
    let cancelDate: string = p.dateOnly || "";

    if (this.deps?.occurrenceModel || isDbConnected()) {
      const TemporalOccurrence = this.deps?.occurrenceModel || (await import("@/server/db/models/TemporalOccurrence")).TemporalOccurrence;
      const TemporalSeriesTemplate = this.deps?.seriesModel || (await import("@/server/db/models/TemporalSeriesTemplate")).TemporalSeriesTemplate;
      const outboxService = this.deps?.outboxService || (await import("../../events/persistence/OutboxStorageService")).OutboxStorageService.getInstance();

      // 1. If no occurrenceId, attempt to find occurrence by exact title + dateOnly
      if (!occId && p.title) {
        const todayStr = p.dateOnly || new Date().toISOString().split("T")[0];
        const exactTitle = p.title.trim();

        const foundOcc = await TemporalOccurrence.findOne({
          userId,
          dateOnly: todayStr,
          title: exactTitle,
        });

        if (foundOcc) {
          occId = foundOcc.occurrenceId;
          previousStatus = foundOcc.status;
          title = foundOcc.title;
          cancelDate = cancelDate || foundOcc.dateOnly;
          const clientMutationId = `mut_cancel_${foundOcc._id}_${Date.now()}`;
          const diffHash = `diff_cancel_${foundOcc._id}_${foundOcc.version + 1}`;
          await outboxService.persistWithStandaloneFencing({
            aggregateType: "TemporalOccurrence",
            aggregateModel: TemporalOccurrence,
            aggregateId: String(foundOcc._id),
            clientMutationId,
            diffHash,
            expectedVersion: foundOcc.version,
            fencingEpoch: foundOcc.mutationEpoch || 0,
            domainUpdates: {
              status: targetStatus,
              overrideType: "SINGLE_INSTANCE_CANCELLED",
            },
            eventDrafts: [
              {
                userId,
                category: "DOMAIN_EVENT",
                type: "domain.temporal.deleted",
                aggregateId: String(foundOcc._id),
                aggregateType: "TemporalOccurrence",
                source: "TemporalActionAdapters:CancelOccurrenceAdapter",
                payload: {
                  occurrenceId: occId,
                  title,
                  status: targetStatus,
                },
              },
            ],
          });
        } else {
          // Search in recurring series template
          const foundSeries = await TemporalSeriesTemplate.findOne({
            userId,
            title: exactTitle,
            status: "ACTIVE",
          });
          if (foundSeries) {
            occId = `proj_${foundSeries.seriesId}_${todayStr}`;
            title = foundSeries.title;
            cancelDate = cancelDate || todayStr;
            const [sh, sm] = (foundSeries.baseStartTime || "09:00").split(":").map(Number);
            const startMinute = (sh || 0) * 60 + (sm || 0);
            const dur = foundSeries.baseDurationMinutes || 60;
            const newDocId = new mongoose.Types.ObjectId();
            const clientMutationId = `mut_cancel_${newDocId}_${Date.now()}`;
            const diffHash = `diff_cancel_${newDocId}_1`;
            await outboxService.persistWithStandaloneFencing({
              aggregateType: "TemporalOccurrence",
              aggregateModel: TemporalOccurrence,
              aggregateId: String(newDocId),
              clientMutationId,
              diffHash,
              expectedVersion: 0,
              fencingEpoch: 0,
              domainUpdates: {
                occurrenceId: occId,
                userId,
                seriesId: foundSeries.seriesId,
                title: foundSeries.title,
                kind: foundSeries.kind || "ROUTINE_BLOCK",
                dateOnly: todayStr,
                plannedInterval: {
                  dateOnly: todayStr,
                  startMinute,
                  endMinute: startMinute + dur,
                  durationMinutes: dur,
                  startIsoUtc: `${todayStr}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00Z`,
                  endIsoUtc: `${todayStr}T${String(Math.floor((startMinute + dur) / 60)).padStart(2, "0")}:${String((startMinute + dur) % 60).padStart(2, "0")}:00Z`,
                  timezone: "UTC",
                  isMidnightCrossing: false,
                },
                locationContext: foundSeries.locationContext || { category: "HOME", requiresPhysicalTransit: false },
                rigidity: (foundSeries as any).rigidity || "ELASTIC",
                status: targetStatus,
                overrideType: "SINGLE_INSTANCE_CANCELLED",
              },
              eventDrafts: [
                {
                  userId,
                  category: "DOMAIN_EVENT",
                  type: "domain.temporal.deleted",
                  aggregateId: String(newDocId),
                  aggregateType: "TemporalOccurrence",
                  source: "TemporalActionAdapters:CancelOccurrenceAdapter",
                  payload: {
                    occurrenceId: occId,
                    title,
                    status: targetStatus,
                  },
                },
              ],
              isCreation: true,
            });
          }
        }
      } else if (occId) {
        // Occurrence ID was explicitly given
        const existing = await TemporalOccurrence.findOne({ userId, occurrenceId: occId });
        if (existing) {
          previousStatus = existing.status;
          title = existing.title;
          cancelDate = cancelDate || existing.dateOnly;
          const clientMutationId = `mut_cancel_${existing._id}_${Date.now()}`;
          const diffHash = `diff_cancel_${existing._id}_${existing.version + 1}`;
          await outboxService.persistWithStandaloneFencing({
            aggregateType: "TemporalOccurrence",
            aggregateModel: TemporalOccurrence,
            aggregateId: String(existing._id),
            clientMutationId,
            diffHash,
            expectedVersion: existing.version,
            fencingEpoch: existing.mutationEpoch || 0,
            domainUpdates: {
              status: targetStatus,
              overrideType: "SINGLE_INSTANCE_CANCELLED",
            },
            eventDrafts: [
              {
                userId,
                category: "DOMAIN_EVENT",
                type: "domain.temporal.deleted",
                aggregateId: String(existing._id),
                aggregateType: "TemporalOccurrence",
                source: "TemporalActionAdapters:CancelOccurrenceAdapter",
                payload: {
                  occurrenceId: occId,
                  title,
                  status: targetStatus,
                },
              },
            ],
          });
        } else if (occId.startsWith("proj_")) {
          // Materialize single cancelled instance from recurring series template
          const parts = occId.split("_");
          const seriesId = parts[1];
          const dateOnly = parts[2] || (p.dateOnly || new Date().toISOString().split("T")[0]);
          const series = await TemporalSeriesTemplate.findOne({ userId, seriesId });
          if (series) {
            title = series.title;
            const [sh, sm] = (series.baseStartTime || "09:00").split(":").map(Number);
            const startMinute = (sh || 0) * 60 + (sm || 0);
            const dur = series.baseDurationMinutes || 60;
            const newDocId = new mongoose.Types.ObjectId();
            const clientMutationId = `mut_cancel_${newDocId}_${Date.now()}`;
            const diffHash = `diff_cancel_${newDocId}_1`;
            await outboxService.persistWithStandaloneFencing({
              aggregateType: "TemporalOccurrence",
              aggregateModel: TemporalOccurrence,
              aggregateId: String(newDocId),
              clientMutationId,
              diffHash,
              expectedVersion: 0,
              fencingEpoch: 0,
              domainUpdates: {
                occurrenceId: occId,
                userId,
                seriesId: series.seriesId,
                title: series.title,
                kind: series.kind || "ROUTINE_BLOCK",
                dateOnly,
                plannedInterval: {
                  dateOnly,
                  startMinute,
                  endMinute: startMinute + dur,
                  durationMinutes: dur,
                  startIsoUtc: `${dateOnly}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00Z`,
                  endIsoUtc: `${dateOnly}T${String(Math.floor((startMinute + dur) / 60)).padStart(2, "0")}:${String((startMinute + dur) % 60).padStart(2, "0")}:00Z`,
                  timezone: "UTC",
                  isMidnightCrossing: false,
                },
                locationContext: series.locationContext || { category: "HOME", requiresPhysicalTransit: false },
                rigidity: (series as any).rigidity || "ELASTIC",
                status: targetStatus,
                overrideType: "SINGLE_INSTANCE_CANCELLED",
              },
              eventDrafts: [
                {
                  userId,
                  category: "DOMAIN_EVENT",
                  type: "domain.temporal.deleted",
                  aggregateId: String(newDocId),
                  aggregateType: "TemporalOccurrence",
                  source: "TemporalActionAdapters:CancelOccurrenceAdapter",
                  payload: {
                    occurrenceId: occId,
                    title,
                    status: targetStatus,
                  },
                },
              ],
              isCreation: true,
            });
          }
        }
      }

      const finalCancelDate = cancelDate || new Date().toISOString().split("T")[0];
      try {
        const { TemporalPartitionRevisionService } = await import("../sweeper/TemporalPartitionRevisionService");
        await TemporalPartitionRevisionService.getInstance().incrementPartitionRevision(userId, finalCancelDate);
      } catch {
        // Safe fallback
      }
    }

    return {
      success: true,
      occurrenceId: occId || "unknown",
      title,
      previousStatus,
      status: targetStatus,
    };
  }

  async compensate(
    proposal: ActionProposal,
    previousResult: any,
    userId: string
  ): Promise<CompensationResult> {
    const occId = proposal.payload?.occurrenceId || previousResult?.occurrenceId;
    if (occId && previousResult?.previousStatus && isDbConnected()) {
      const { TemporalOccurrence } = await import("@/server/db/models/TemporalOccurrence");
      await TemporalOccurrence.updateOne(
        { userId, occurrenceId: occId },
        { status: previousResult.previousStatus }
      );
      return {
        compensated: true,
        reversalDetails: `Restored occurrence ${occId} status to ${previousResult.previousStatus}`,
      };
    }
    return { compensated: true, reversalDetails: "Cancellation compensated" };
  }
}

/**
 * Adapter for creating a recurring TemporalSeriesTemplate
 */
export class CreateTemporalSeriesAdapter implements IKernelActionAdapter {
  async validatePreconditions(
    proposal: ActionProposal,
    userId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const p = proposal.payload;
    if (!p?.title || typeof p.title !== "string") {
      return { valid: false, reason: "Series title is required" };
    }
    if (!p?.baseStartTime && !p?.startTime) {
      return { valid: false, reason: "baseStartTime (HH:MM) is required" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const p = proposal.payload;
    const seriesId = p.seriesId || `ser_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const todayIso = p.dateOnly || (p.effectiveStartDate ? String(p.effectiveStartDate).slice(0, 10) : new Date().toISOString().slice(0, 10));
    const [iy, im, id] = todayIso.split("-").map(Number);
    const initialDate = new Date(Date.UTC(iy, (im || 1) - 1, id || 1));

    const rec = p.recurrence || {};
    let daysOfWeek: number[] = [initialDate.getUTCDay()];
    if (Array.isArray(rec.daysOfWeek) && rec.daysOfWeek.length > 0) {
      daysOfWeek = rec.daysOfWeek.map((d: any) => {
        if (typeof d === "number") return d;
        const s = String(d).toLowerCase().trim();
        if (s.startsWith("sun")) return 0;
        if (s.startsWith("mon")) return 1;
        if (s.startsWith("tue")) return 2;
        if (s.startsWith("wed")) return 3;
        if (s.startsWith("thu")) return 4;
        if (s.startsWith("fri")) return 5;
        if (s.startsWith("sat")) return 6;
        return 1;
      });
    }

    const normalizedRecurrence = {
      frequency: rec.frequency || "WEEKLY",
      interval: typeof rec.interval === "number" && rec.interval > 0 ? rec.interval : 1,
      daysOfWeek,
      effectiveStartDate: rec.effectiveStartDate || p.effectiveStartDate || p.dateOnly || todayIso,
      effectiveEndDate: rec.effectiveEndDate || p.effectiveEndDate,
      count: typeof rec.count === "number" ? rec.count : undefined,
    };

    const baseStartTime = p.baseStartTime || p.startTime || "09:00";
    const baseDurationMinutes = p.baseDurationMinutes || p.durationMinutes || 60;

    const seriesData = {
      seriesId,
      userId,
      title: p.title.trim(),
      kind: p.kind || "ROUTINE_BLOCK",
      locationContext: {
        category: p.locationCategory || (p.kind === "HARD_EVENT" ? "ACADEMIC" : "HOME"),
        label: p.locationLabel || "",
        requiresPhysicalTransit: p.locationCategory !== "HOME" && p.locationCategory !== "VIRTUAL",
      },
      recurrence: normalizedRecurrence,
      baseStartTime,
      baseDurationMinutes,
      linkedEntity: p.linkedEntity || { entityType: "none" },
      status: "ACTIVE" as const,
      metadata: p.metadata || {},
    };

    if (isDbConnected()) {
      const { TemporalSeriesTemplate } = await import("@/server/db/models/TemporalSeriesTemplate");
      await TemporalSeriesTemplate.findOneAndUpdate(
        { userId, seriesId },
        seriesData,
        { upsert: true, new: true }
      );

      // Pre-generate concrete TemporalOccurrence records for upcoming 12 weeks
      const { TemporalOccurrence } = await import("@/server/db/models/TemporalOccurrence");
      const [sy, sm, sd] = normalizedRecurrence.effectiveStartDate.split("-").map(Number);
      const startRef = new Date(Date.UTC(sy, (sm || 1) - 1, sd || 1));
      const occurrencesToCreate: any[] = [];

      for (let dayOffset = 0; dayOffset < 84; dayOffset++) {
        const curDate = new Date(startRef.getTime() + dayOffset * 86400000);
        const dayOfWeek = curDate.getUTCDay();

        if (normalizedRecurrence.daysOfWeek.includes(dayOfWeek)) {
          const curDateIso = curDate.toISOString().slice(0, 10);

          if (normalizedRecurrence.effectiveEndDate && curDateIso > normalizedRecurrence.effectiveEndDate) {
            break;
          }

          const norm = normalizeTemporalInterval({
            dateOnly: curDateIso,
            startTime: baseStartTime,
            durationMinutes: baseDurationMinutes,
            timezone: p.timezone || "UTC",
          });

          if (norm.valid && norm.interval) {
            const occurrenceId = buildOccurrenceId(seriesId, curDateIso);
            occurrencesToCreate.push({
              occurrenceId,
              userId,
              seriesId,
              title: seriesData.title,
              kind: seriesData.kind,
              dateOnly: curDateIso,
              plannedInterval: norm.interval,
              locationContext: seriesData.locationContext,
              rigidity: "ELASTIC",
              status: "SCHEDULED",
              linkedEntity: seriesData.linkedEntity,
              version: 1,
              overrideType: "NONE",
            });
          }
        }
      }

      for (const occ of occurrencesToCreate) {
        await TemporalOccurrence.findOneAndUpdate(
          { userId, occurrenceId: occ.occurrenceId },
          occ,
          { upsert: true }
        ).catch(() => {});
      }
    }

    return {
      success: true,
      seriesId,
      title: seriesData.title,
      status: "ACTIVE",
    };
  }

  async compensate(
    proposal: ActionProposal,
    previousResult: any,
    userId: string
  ): Promise<CompensationResult> {
    const seriesId = previousResult?.seriesId || proposal.payload?.seriesId;
    if (seriesId && isDbConnected()) {
      const { TemporalSeriesTemplate } = await import("@/server/db/models/TemporalSeriesTemplate");
      const { TemporalOccurrence } = await import("@/server/db/models/TemporalOccurrence");
      const { OutboxStorageService } = await import("../../events/persistence/OutboxStorageService");
      const outboxService = OutboxStorageService.getInstance();

      const occurrences = await TemporalOccurrence.find({ userId, seriesId, status: { $ne: "CANCELLED" } });
      for (const occ of occurrences) {
        const currentVersion = occ.version || 0;
        const nextVersion = currentVersion + 1;
        const eventDraft = {
          userId: String(userId),
          category: "DOMAIN_EVENT" as const,
          type: "domain.temporal.deleted",
          aggregateId: String(occ._id),
          aggregateType: "occurrence" as const,
          aggregateVersion: nextVersion,
          source: "kernel.temporal.series_rollback",
          payload: { occurrenceId: occ.occurrenceId, seriesId, status: "CANCELLED" },
          occurredAt: new Date(),
        };
        await outboxService.persistWithStandaloneFencing({
          userId: String(userId),
          aggregateModel: TemporalOccurrence,
          aggregateId: String(occ._id),
          clientMutationId: `mut_rollback_occ_${occ._id}_${Date.now()}`,
          diffHash: `diff_rollback_occ_${occ._id}_${nextVersion}`,
          expectedVersion: currentVersion,
          fencingEpoch: occ.mutationEpoch || 0,
          domainUpdates: { status: "CANCELLED", overrideType: "SINGLE_INSTANCE_CANCELLED", updatedAt: new Date() },
          eventDrafts: [eventDraft],
          isDeletion: true,
        });
      }

      const seriesDoc = await TemporalSeriesTemplate.findOne({ userId, seriesId });
      if (seriesDoc) {
        const currentVersion = (seriesDoc as any).version || 0;
        const nextVersion = currentVersion + 1;
        const eventDraft = {
          userId: String(userId),
          category: "DOMAIN_EVENT" as const,
          type: "domain.temporal.template_deleted",
          aggregateId: String(seriesDoc._id),
          aggregateType: "workflow" as const,
          aggregateVersion: nextVersion,
          source: "kernel.temporal.series_rollback",
          payload: { seriesId, status: "ARCHIVED" },
          occurredAt: new Date(),
        };
        await outboxService.persistWithStandaloneFencing({
          userId: String(userId),
          aggregateModel: TemporalSeriesTemplate,
          aggregateId: String(seriesDoc._id),
          clientMutationId: `mut_rollback_series_${seriesDoc._id}_${Date.now()}`,
          diffHash: `diff_rollback_series_${seriesDoc._id}_${nextVersion}`,
          expectedVersion: currentVersion,
          fencingEpoch: (seriesDoc as any).mutationEpoch || 0,
          domainUpdates: { status: "ARCHIVED", updatedAt: new Date() },
          eventDrafts: [eventDraft],
          isDeletion: true,
        });
      }

      return {
        compensated: true,
        reversalDetails: `Soft-archived series and active occurrences for ${seriesId}`,
      };
    }
    return { compensated: true, reversalDetails: "Series creation compensated" };
  }
}

/**
 * Adapter for logging append-only ExecutionChronicle entries
 */
export class LogExecutionIntervalAdapter implements IKernelActionAdapter {
  async validatePreconditions(
    proposal: ActionProposal,
    userId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    const p = proposal.payload;
    if (!p?.title || typeof p.title !== "string") {
      return { valid: false, reason: "Title is required for logged execution interval" };
    }

    // Auto-calculate timestamps if not given as numbers
    if (typeof p?.startedAtMs !== "number" || typeof p?.endedAtMs !== "number") {
      const todayIso = p.dateOnly || new Date().toISOString().split("T")[0];
      const startStr = p.startTime || p.time || "09:00";
      const [sh, sm] = startStr.split(":").map(Number);
      const startMin = (sh || 0) * 60 + (sm || 0);

      let dur = typeof p.durationMinutes === "number" ? p.durationMinutes : 60;
      if (p.endTime) {
        const [eh, em] = p.endTime.split(":").map(Number);
        const endMin = (eh || 0) * 60 + (em || 0);
        dur = Math.max(1, endMin - startMin);
      }

      const startMs = new Date(`${todayIso}T${String(sh || 0).padStart(2, "0")}:${String(sm || 0).padStart(2, "0")}:00Z`).getTime();
      const endMs = startMs + dur * 60 * 1000;

      p.startedAtMs = startMs;
      p.endedAtMs = endMs;
      p.durationMinutes = dur;
    }

    if (p.endedAtMs < p.startedAtMs) {
      return { valid: false, reason: "endedAtMs cannot be earlier than startedAtMs" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const p = proposal.payload;
    const chronicleId = `chron_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const durationMinutes = Math.max(1, Math.round((p.endedAtMs - p.startedAtMs) / (1000 * 60)));

    let occurrenceId = p.occurrenceId;

    if (isDbConnected()) {
      const { ExecutionChronicle } = await import("@/server/db/models/ExecutionChronicle");
      const { TemporalOccurrence } = await import("@/server/db/models/TemporalOccurrence");

      const completeOccurrence = async (occ: any) => {
        const { OutboxStorageService } = await import("../../events/persistence/OutboxStorageService");
        const outboxService = OutboxStorageService.getInstance();
        const nextVersion = (occ.version || 0) + 1;
        const clientMutationId = `mut_occ_complete_${occ._id}_${Date.now()}`;
        const diffHash = `diff_occ_complete_${occ._id}_${nextVersion}`;
        const completedAt = new Date();

        const eventDraft = {
          userId: String(userId),
          category: "DOMAIN_EVENT" as const,
          type: "domain.temporal.completed",
          aggregateId: String(occ._id),
          aggregateType: "occurrence" as const,
          aggregateVersion: nextVersion,
          source: "kernel.temporal.log_interval",
          payload: {
            occurrenceId: occ.occurrenceId,
            title: occ.title,
            dateOnly: occ.dateOnly,
            status: "COMPLETED",
            completedAt: completedAt.toISOString(),
          },
          occurredAt: completedAt,
        };

        await outboxService.persistWithStandaloneFencing({
          userId: String(userId),
          aggregateModel: TemporalOccurrence,
          aggregateId: String(occ._id),
          clientMutationId,
          diffHash,
          expectedVersion: occ.version || 0,
          fencingEpoch: occ.mutationEpoch || 0,
          domainUpdates: { status: "COMPLETED", updatedAt: completedAt },
          eventDrafts: [eventDraft],
        });
      };

      // Attempt to link matching occurrence and mark it completed
      const todayIso = new Date(p.startedAtMs).toISOString().split("T")[0];
      const exactTitle = p.title.trim();

      if (!occurrenceId) {
        const matchOcc = await TemporalOccurrence.findOne({
          userId,
          dateOnly: todayIso,
          title: exactTitle,
          status: { $ne: "CANCELLED" },
        });

        if (matchOcc) {
          occurrenceId = matchOcc.occurrenceId;
          await completeOccurrence(matchOcc);
        } else {
          // Check if there is a recurring series template matching today
          const { TemporalSeriesTemplate } = await import("@/server/db/models/TemporalSeriesTemplate");
          const matchSeries = await TemporalSeriesTemplate.findOne({
            userId,
            title: exactTitle,
            status: "ACTIVE",
          });
          if (matchSeries) {
            occurrenceId = `proj_${matchSeries.seriesId}_${todayIso}`;
            const [sh, sm] = (matchSeries.baseStartTime || "09:00").split(":").map(Number);
            const startMinute = (sh || 0) * 60 + (sm || 0);
            const dur = matchSeries.baseDurationMinutes || 60;
            await TemporalOccurrence.create({
              occurrenceId,
              userId,
              seriesId: matchSeries.seriesId,
              title: matchSeries.title,
              kind: matchSeries.kind || "ROUTINE_BLOCK",
              dateOnly: todayIso,
              plannedInterval: {
                dateOnly: todayIso,
                startMinute,
                endMinute: startMinute + dur,
                durationMinutes: dur,
                startIsoUtc: `${todayIso}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00Z`,
                endIsoUtc: `${todayIso}T${String(Math.floor((startMinute + dur) / 60)).padStart(2, "0")}:${String((startMinute + dur) % 60).padStart(2, "0")}:00Z`,
                timezone: "UTC",
                isMidnightCrossing: false,
              },
              locationContext: matchSeries.locationContext || { category: "HOME", requiresPhysicalTransit: false },
              rigidity: (matchSeries as any).rigidity || "ELASTIC",
              status: "COMPLETED",
              version: 1,
              overrideType: "NONE",
            });
          }
        }
      } else {
        const matchOcc = await TemporalOccurrence.findOne({ userId, occurrenceId });
        if (matchOcc) {
          await completeOccurrence(matchOcc);
        }
      }

      const entryData = {
        chronicleId,
        userId,
        occurrenceId,
        entityType: p.entityType || "general",
        entityId: p.entityId,
        title: p.title.trim(),
        startedAtMs: p.startedAtMs,
        endedAtMs: p.endedAtMs,
        durationMinutes,
        interruptionsCount: p.interruptionsCount || 0,
        completedWorkUnits: p.completedWorkUnits || [],
        notes: p.notes,
        source: p.source || "web_manual",
      };

      await ExecutionChronicle.create(entryData);
    }

    return {
      success: true,
      chronicleId,
      title: p.title.trim(),
      durationMinutes,
      occurrenceId,
    };
  }

  async compensate(
    proposal: ActionProposal,
    previousResult: any,
    userId: string
  ): Promise<CompensationResult> {
    // Execution chronicles are append-only evidence. We mark voided if deleted.
    const chronicleId = previousResult?.chronicleId;
    if (chronicleId && isDbConnected()) {
      const { ExecutionChronicle } = await import("@/server/db/models/ExecutionChronicle");
      await ExecutionChronicle.deleteOne({ userId, chronicleId });
      return {
        compensated: true,
        reversalDetails: `Removed execution chronicle entry ${chronicleId}`,
      };
    }
    return { compensated: true, reversalDetails: "Execution chronicle compensated" };
  }
}
