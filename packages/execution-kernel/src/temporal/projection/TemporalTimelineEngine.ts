/**
 * TemporalTimelineEngine.ts
 * 
 * Generates unified Planned-vs-Actual Timeline Projections (V3).
 * 
 * Enforces Invariants:
 * - Guardrail 11: Planned intervals are preserved even when actual execution overruns.
 * - Guardrail 12: Source of truth is authoritative domain state + append-only chronicle;
 *   this projection is an on-demand derived view.
 * - Reconstructs exact temporal reality for any date range.
 */

import {
  TemporalOccurrence,
  ExecutionChronicleEntry,
  TemporalInterval,
} from "../contracts/TemporalContracts";

export type ExecutionVarianceStatus =
  | "PLANNED_PENDING"       // In the future or not yet started
  | "ON_TRACK"              // Execution within planned tolerance (+- 10 mins)
  | "OVERRUN"               // Actual execution duration exceeded planned duration
  | "UNDERRUN"              // Actual execution ended earlier than planned
  | "MISSED"                // Planned interval has passed with no execution evidence
  | "UNPLANNED_EXECUTION";   // Execution logged without a scheduled occurrence

export interface TimelineBlockProjection {
  blockId: string;
  occurrenceId?: string;
  chronicleId?: string;
  title: string;
  kind: string;
  dateOnly: string;
  planned?: {
    startMinute: number;
    endMinute: number;
    durationMinutes: number;
    startIsoUtc: string;
    endIsoUtc: string;
  };
  actual?: {
    startedAtMs: number;
    endedAtMs: number;
    durationMinutes: number;
    interruptionsCount: number;
    completedWorkUnits?: string[];
  };
  variance: {
    status: ExecutionVarianceStatus;
    durationDeltaMinutes: number; // actual - planned
    explanation: string;
  };
}

export interface DayTimelineProjection {
  userId: string;
  dateOnly: string;
  timezone: string;
  blocks: TimelineBlockProjection[];
  summary: {
    totalPlannedMinutes: number;
    totalActualMinutes: number;
    completedOccurrencesCount: number;
    missedOccurrencesCount: number;
    adHocSessionsCount: number;
  };
  projectedAt: number;
}

export class TemporalTimelineEngine {
  private static instance: TemporalTimelineEngine;

  static getInstance(): TemporalTimelineEngine {
    if (!TemporalTimelineEngine.instance) {
      TemporalTimelineEngine.instance = new TemporalTimelineEngine();
    }
    return TemporalTimelineEngine.instance;
  }

  /**
   * Projects a unified 24h timeline combining planned occurrences and actual chronicles
   */
  projectDayTimeline(
    userId: string,
    dateOnly: string,
    occurrences: TemporalOccurrence[],
    chronicles: ExecutionChronicleEntry[],
    timezone: string = "UTC",
    referenceTimeMs: number = Date.now()
  ): DayTimelineProjection {
    const blocks: TimelineBlockProjection[] = [];
    const matchedChronicleIds = new Set<string>();

    let totalPlannedMinutes = 0;
    let totalActualMinutes = 0;
    let completedCount = 0;
    let missedCount = 0;
    let adHocCount = 0;

    // 1. Process Planned Occurrences
    const dayOccurrences = occurrences.filter(
      (occ) =>
        occ.dateOnly === dateOnly &&
        occ.status !== "CANCELLED"
    );

    for (const occ of dayOccurrences) {
      const p = occ.plannedInterval;
      totalPlannedMinutes += p.durationMinutes;

      // Find matching chronicles linked by occurrenceId or entityId
      const linkedChronicle = chronicles.find(
        (c) =>
          c.occurrenceId === occ.occurrenceId ||
          (occ.linkedEntity?.entityId && c.entityId === occ.linkedEntity.entityId)
      );

      if (linkedChronicle) {
        matchedChronicleIds.add(linkedChronicle.chronicleId);
        totalActualMinutes += linkedChronicle.durationMinutes;
        completedCount++;

        const delta = linkedChronicle.durationMinutes - p.durationMinutes;
        let varStatus: ExecutionVarianceStatus = "ON_TRACK";
        let exp = "Executed according to plan";

        if (delta > 15) {
          varStatus = "OVERRUN";
          exp = `Session overran by ${delta} minutes`;
        } else if (delta < -15) {
          varStatus = "UNDERRUN";
          exp = `Session wrapped up ${Math.abs(delta)} minutes early`;
        }

        blocks.push({
          blockId: `block_${occ.occurrenceId}`,
          occurrenceId: occ.occurrenceId,
          chronicleId: linkedChronicle.chronicleId,
          title: occ.title,
          kind: occ.kind,
          dateOnly,
          planned: {
            startMinute: p.startMinute,
            endMinute: p.endMinute,
            durationMinutes: p.durationMinutes,
            startIsoUtc: p.startIsoUtc,
            endIsoUtc: p.endIsoUtc,
          },
          actual: {
            startedAtMs: linkedChronicle.startedAtMs,
            endedAtMs: linkedChronicle.endedAtMs,
            durationMinutes: linkedChronicle.durationMinutes,
            interruptionsCount: linkedChronicle.interruptionsCount,
            completedWorkUnits: linkedChronicle.completedWorkUnits,
          },
          variance: {
            status: varStatus,
            durationDeltaMinutes: delta,
            explanation: exp,
          },
        });
      } else {
        // No execution chronicle logged yet
        const endMs = new Date(p.endIsoUtc).getTime();
        const isPast = referenceTimeMs > endMs;

        if (isPast && occ.status !== "COMPLETED") {
          missedCount++;
        }

        blocks.push({
          blockId: `block_${occ.occurrenceId}`,
          occurrenceId: occ.occurrenceId,
          title: occ.title,
          kind: occ.kind,
          dateOnly,
          planned: {
            startMinute: p.startMinute,
            endMinute: p.endMinute,
            durationMinutes: p.durationMinutes,
            startIsoUtc: p.startIsoUtc,
            endIsoUtc: p.endIsoUtc,
          },
          variance: {
            status: isPast ? "MISSED" : "PLANNED_PENDING",
            durationDeltaMinutes: -p.durationMinutes,
            explanation: isPast
              ? "Scheduled block passed without logged execution"
              : "Upcoming scheduled block",
          },
        });
      }
    }

    // 2. Process Unplanned / Ad-Hoc Execution Chronicles
    const unmatchedChronicles = chronicles.filter(
      (c) => !matchedChronicleIds.has(c.chronicleId)
    );

    for (const c of unmatchedChronicles) {
      totalActualMinutes += c.durationMinutes;
      adHocCount++;

      blocks.push({
        blockId: `block_adhoc_${c.chronicleId}`,
        chronicleId: c.chronicleId,
        title: c.title,
        kind: "WORK_SESSION",
        dateOnly,
        actual: {
          startedAtMs: c.startedAtMs,
          endedAtMs: c.endedAtMs,
          durationMinutes: c.durationMinutes,
          interruptionsCount: c.interruptionsCount,
          completedWorkUnits: c.completedWorkUnits,
        },
        variance: {
          status: "UNPLANNED_EXECUTION",
          durationDeltaMinutes: c.durationMinutes,
          explanation: "Spontaneous work session logged without prior scheduled slot",
        },
      });
    }

    // Sort blocks by start time (planned startMinute or actual startedAtMs)
    blocks.sort((a, b) => {
      const aStart = a.planned?.startMinute ?? (a.actual ? new Date(a.actual.startedAtMs).getUTCHours() * 60 : 0);
      const bStart = b.planned?.startMinute ?? (b.actual ? new Date(b.actual.startedAtMs).getUTCHours() * 60 : 0);
      return aStart - bStart;
    });

    return {
      userId,
      dateOnly,
      timezone,
      blocks,
      summary: {
        totalPlannedMinutes,
        totalActualMinutes,
        completedOccurrencesCount: completedCount,
        missedOccurrencesCount: missedCount,
        adHocSessionsCount: adHocCount,
      },
      projectedAt: Date.now(),
    };
  }
}
