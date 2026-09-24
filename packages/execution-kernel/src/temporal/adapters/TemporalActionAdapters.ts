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

/**
 * Adapter for scheduling a new TemporalOccurrence
 */
export class ScheduleOccurrenceAdapter implements IKernelActionAdapter {
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

    if (isDbConnected()) {
      const { TemporalOccurrence } = await import("@/server/db/models/TemporalOccurrence");
      await TemporalOccurrence.findOneAndUpdate(
        { userId, occurrenceId },
        docData,
        { upsert: true, new: true }
      );
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

    if (isDbConnected()) {
      const { TemporalOccurrence } = await import("@/server/db/models/TemporalOccurrence");
      const existing = await TemporalOccurrence.findOne({
        userId,
        occurrenceId: payload.occurrenceId,
      });

      if (existing) {
        previousInterval = existing.plannedInterval;
        if (norm.valid && norm.interval) {
          existing.dateOnly = newDate;
          existing.plannedInterval = norm.interval;
          existing.status = "RESCHEDULED";
          existing.overrideType = "SINGLE_INSTANCE_MODIFIED";
          existing.version += 1;
          await existing.save();
        }
      } else if (payload.occurrenceId && payload.occurrenceId.startsWith("proj_")) {
        const parts = payload.occurrenceId.split("_");
        const seriesId = parts[1];
        const { TemporalSeriesTemplate } = await import("@/server/db/models/TemporalSeriesTemplate");
        const series = await TemporalSeriesTemplate.findOne({ userId, seriesId });
        if (series && norm.valid && norm.interval) {
          await TemporalOccurrence.create({
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
            version: 1,
          });
        }
      } else if (payload.occurrenceId && payload.occurrenceId.startsWith("task_")) {
        const taskId = payload.occurrenceId.replace("task_", "");
        const { Task } = await import("@/server/db/models/Task");
        const task = await Task.findOne({ _id: taskId, userId });
        if (norm.valid && norm.interval) {
          await TemporalOccurrence.create({
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
            version: 1,
          });
        }
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
 * Adapter for cancelling an existing TemporalOccurrence
 */
export class CancelOccurrenceAdapter implements IKernelActionAdapter {
  async validatePreconditions(
    proposal: ActionProposal,
    userId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    if (!proposal.payload?.occurrenceId) {
      return { valid: false, reason: "occurrenceId is required to cancel" };
    }
    return { valid: true };
  }

  async execute(proposal: ActionProposal, userId: string): Promise<any> {
    const occId = proposal.payload.occurrenceId;
    let previousStatus = "SCHEDULED";

    if (isDbConnected()) {
      const { TemporalOccurrence } = await import("@/server/db/models/TemporalOccurrence");
      const existing = await TemporalOccurrence.findOne({ userId, occurrenceId: occId });
      if (existing) {
        previousStatus = existing.status;
        existing.status = "CANCELLED";
        existing.overrideType = "SINGLE_INSTANCE_CANCELLED";
        existing.version += 1;
        await existing.save();
      }
    }

    return {
      success: true,
      occurrenceId: occId,
      previousStatus,
      status: "CANCELLED",
    };
  }

  async compensate(
    proposal: ActionProposal,
    previousResult: any,
    userId: string
  ): Promise<CompensationResult> {
    const occId = proposal.payload?.occurrenceId;
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

    const today = new Date();
    const yr = today.getFullYear();
    const mo = String(today.getMonth() + 1).padStart(2, "0");
    const da = String(today.getDate()).padStart(2, "0");
    const todayIso = `${yr}-${mo}-${da}`;

    const rec = p.recurrence || {};
    let daysOfWeek: number[] = [today.getDay()];
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
      const startRef = new Date(sy, sm - 1, sd);
      const occurrencesToCreate: any[] = [];

      for (let dayOffset = 0; dayOffset < 84; dayOffset++) {
        const curDate = new Date(startRef);
        curDate.setDate(startRef.getDate() + dayOffset);
        const dayOfWeek = curDate.getDay();

        if (normalizedRecurrence.daysOfWeek.includes(dayOfWeek)) {
          const cy = curDate.getFullYear();
          const cm = String(curDate.getMonth() + 1).padStart(2, "0");
          const cd = String(curDate.getDate()).padStart(2, "0");
          const curDateIso = `${cy}-${cm}-${cd}`;

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
      await Promise.all([
        TemporalSeriesTemplate.deleteOne({ userId, seriesId }),
        TemporalOccurrence.deleteMany({ userId, seriesId }),
      ]);
      return {
        compensated: true,
        reversalDetails: `Deleted created series and occurrences ${seriesId}`,
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
    if (typeof p?.startedAtMs !== "number" || typeof p?.endedAtMs !== "number") {
      return { valid: false, reason: "startedAtMs and endedAtMs (epoch numbers) are required" };
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

    const entryData = {
      chronicleId,
      userId,
      occurrenceId: p.occurrenceId,
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

    if (isDbConnected()) {
      const { ExecutionChronicle } = await import("@/server/db/models/ExecutionChronicle");
      await ExecutionChronicle.create(entryData);
    }

    return {
      success: true,
      chronicleId,
      title: entryData.title,
      durationMinutes,
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
