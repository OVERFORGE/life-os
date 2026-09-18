/**
 * JournalBuilder — Phase 1.7 V2
 *
 * Pure function that constructs a SimulationJournalEntry from a step snapshot.
 * No I/O, no side effects. Timeline-only data — no payloads, no artifact IDs.
 */

import {
  SimulationJournalEntry,
  JOURNAL_SCHEMA_VERSION,
} from "../contracts/journalContracts";
import { SimulationStepSnapshot } from "../contracts/snapshotContracts";

export function buildJournalEntryId(runUid: string, stepNumber: number): string {
  return `JRN_${runUid}_${stepNumber}`;
}

/**
 * Builds a canonical, immutable journal entry from a persisted snapshot.
 * Contains ONLY the fields needed to render a timeline row.
 */
export function buildJournalEntry(
  snapshot: SimulationStepSnapshot,
  traceId: string
): SimulationJournalEntry {
  return {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    journalEntryId: buildJournalEntryId(snapshot.runUid, snapshot.stepNumber),
    runUid: snapshot.runUid,
    stepNumber: snapshot.stepNumber,
    tick: snapshot.tick,
    virtualDay: snapshot.virtualDay,
    virtualMinute: snapshot.virtualMinute,
    decisionIntent: snapshot.decisionIntent,
    executionStatus: snapshot.executionStatus ?? (snapshot.kernelSuccess ? "SUCCESS" : "FAILED"),

    snapshotId: snapshot.snapshotId,
    traceId,
    createdAt: Date.now(),
  };
}
