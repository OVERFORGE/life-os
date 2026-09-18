/**
 * Journal Contracts — Phase 1.7 V2
 *
 * SimulationRunJournal is the timeline record for a simulation run.
 * Its ONLY purpose is rendering ordered execution history in the UI.
 *
 * ARCHITECTURAL RULE: The journal must NEVER evolve into another snapshot.
 * It must remain timeline-only. No payload fields. No artifact IDs.
 * Add nothing beyond what is needed to render the timeline row.
 */

import { ExecutionStatus } from "./snapshotContracts";

export const JOURNAL_SCHEMA_VERSION = "1.0.0" as const;

/**
 * A single journal entry — one per simulation step.
 *
 * - journalEntryId is deterministic: `JRN_{runUid}_{stepNumber}`
 * - Append-only: never updated, never overwritten.
 * - References snapshotId + traceId for inspector drill-down.
 * - Contains no payload data whatsoever.
 */
export interface SimulationJournalEntry {
  /** Schema version for future migration */
  schemaVersion: typeof JOURNAL_SCHEMA_VERSION;

  /** Deterministic ID: JRN_{runUid}_{stepNumber} */
  journalEntryId: string;

  /** Parent run UID */
  runUid: string;

  /** Monotonic step number (used for ordering) */
  stepNumber: number;

  tick: number;
  virtualDay: number;
  virtualMinute: number;

  /** Decision intent for the timeline row label */
  decisionIntent: string;

  /** Kernel execution outcome */
  executionStatus: ExecutionStatus;

  /** References for inspector navigation — not for data loading */
  snapshotId: string;
  traceId: string;

  /** Wall-clock creation timestamp for secondary sort */
  createdAt: number;
}

/**
 * Timeline entry DTO — safe for UI consumption.
 * Returned by TimelineService and Timeline API route.
 * Never contains database documents.
 */
export interface TimelineEntryDTO {
  journalEntryId: string;
  stepNumber: number;
  tick: number;
  /** Human-readable e.g. "Day 1 • 09:00" */
  virtualTimestamp: string;
  decisionIntent: string;
  executionStatus: ExecutionStatus;
  snapshotId: string;
  traceId: string;
}

