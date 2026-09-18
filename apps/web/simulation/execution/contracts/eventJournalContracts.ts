/**
 * Event Journal Contracts — Phase 4
 *
 * Defines human-observer journal entry structures for timeline rendering.
 * Distinct from low-level execution trace stages.
 */

export interface SimulatedJournalEntry {
  schemaVersion: "1.0.0";
  journalEntryId: string;
  runUid: string;
  stepNumber: number;
  tick: number;
  virtualDay: number;
  virtualMinute: number;
  timestampVirtual: string;
  eventType: string;
  title: string;
  description: string;
  severity: "INFO" | "WARN" | "IMPORTANT" | "ALERT";
  worldDiffSummary?: Record<string, unknown>;
  snapshotId: string;
  traceId: string;
  createdAt: number;
}
