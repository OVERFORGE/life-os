import mongoose, { Schema, model, models } from "mongoose";
import { JOURNAL_SCHEMA_VERSION } from "@/simulation/execution/contracts/journalContracts";

/**
 * SimulationRunJournal Mongoose Model — Phase 1.7 V2
 *
 * Collection: sim_run_journal
 * Append-only. Never updated. Never overwritten.
 * Contains ONLY the fields needed to render the execution timeline UI.
 *
 * ARCHITECTURAL RULE: This model must never gain payload fields.
 * Its sole purpose is timeline rendering. All heavy data lives in sim_artifacts.
 */
const SimulationRunJournalSchema = new Schema(
  {
    schemaVersion:   { type: String, required: true, default: JOURNAL_SCHEMA_VERSION },
    journalEntryId:  { type: String, required: true },
    runUid:          { type: String, required: true },
    stepNumber:      { type: Number, required: true },
    tick:            { type: Number, required: true },
    virtualDay:      { type: Number, required: true },
    virtualMinute:   { type: Number, required: true },
    decisionIntent:  { type: String, required: true },
    executionStatus: { type: String, required: true, enum: ["SUCCESS", "FAILED", "PARTIAL", "SKIPPED", "ABORTED"] },
    snapshotId:      { type: String, required: true },
    traceId:         { type: String, required: true },
    createdAt:       { type: Number, required: true },
  },

  {
    collection: "sim_run_journal",
  }
);

SimulationRunJournalSchema.index({ journalEntryId: 1 }, { unique: true });
SimulationRunJournalSchema.index({ runUid: 1, stepNumber: 1 }, { unique: true });
SimulationRunJournalSchema.index({ runUid: 1 });

export const SimulationRunJournalModel =
  models.SimulationRunJournal ||
  model("SimulationRunJournal", SimulationRunJournalSchema);
