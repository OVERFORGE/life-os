/**
 * TimelineMapper — Phase 1.7 V2
 *
 * Pure functions mapping SimulationJournalEntry → TimelineEntryDTO.
 * Used by TimelineService. No I/O.
 */

import { SimulationJournalEntry, TimelineEntryDTO } from "../contracts/journalContracts";
import { minuteToTime } from "../../engine/clock";

export function toTimelineEntry(entry: SimulationJournalEntry): TimelineEntryDTO {
  const formattedTime = minuteToTime(entry.virtualMinute);
  return {
    journalEntryId: entry.journalEntryId,
    stepNumber:     entry.stepNumber,
    tick:           entry.tick,
    virtualTimestamp: `Day ${entry.virtualDay} • ${formattedTime}`,
    decisionIntent: entry.decisionIntent,
    executionStatus: entry.executionStatus,
    snapshotId:     entry.snapshotId,
    traceId:        entry.traceId,
  };
}

export function toTimeline(entries: SimulationJournalEntry[]): TimelineEntryDTO[] {
  return entries
    .slice()
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map(toTimelineEntry);
}
