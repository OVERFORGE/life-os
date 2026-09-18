/**
 * JournalRepository — Phase 1.7 V2
 *
 * Concrete MongoDB implementation of IJournalRepository.
 * Operates on the sim_run_journal collection.
 * Append-only. Never updates existing records.
 */

import { SimulationJournalEntry } from "../contracts/journalContracts";
import { IJournalRepository } from "./IJournalRepository";
import { RepositoryWriteOptions } from "./IArtifactRepository";
import { SimulationRunJournalModel } from "@/server/db/models/SimulationRunJournal";

interface JournalDocument {
  schemaVersion: "1.0.0";
  journalEntryId: string;
  runUid: string;
  stepNumber: number;
  tick: number;
  virtualDay: number;
  virtualMinute: number;
  decisionIntent: string;
  executionStatus: "SUCCESS" | "FAILED";
  snapshotId: string;
  traceId: string;
  createdAt: number;
}

export class JournalRepository implements IJournalRepository {
  async append(entry: SimulationJournalEntry, options?: RepositoryWriteOptions): Promise<void> {
    await SimulationRunJournalModel.replaceOne(
      { journalEntryId: entry.journalEntryId },
      entry,
      { upsert: true, session: options?.session as any }
    );
  }

  async findAllForRun(runUid: string): Promise<SimulationJournalEntry[]> {
    const docs = await SimulationRunJournalModel
      .find({ runUid })
      .sort({ stepNumber: 1 })
      .lean<JournalDocument[]>();
    return docs.map((d) => this._toContract(d));
  }

  async findById(journalEntryId: string): Promise<SimulationJournalEntry | null> {
    const doc = await SimulationRunJournalModel.findOne({ journalEntryId }).lean<JournalDocument | null>();
    if (!doc) return null;
    return this._toContract(doc);
  }

  async findByRunAndStep(runUid: string, stepNumber: number): Promise<SimulationJournalEntry | null> {
    const doc = await SimulationRunJournalModel
      .findOne({ runUid, stepNumber })
      .lean<JournalDocument | null>();
    if (!doc) return null;
    return this._toContract(doc);
  }

  private _toContract(doc: JournalDocument): SimulationJournalEntry {
    return {
      schemaVersion:   doc.schemaVersion,
      journalEntryId:  doc.journalEntryId,
      runUid:          doc.runUid,
      stepNumber:      doc.stepNumber,
      tick:            doc.tick,
      virtualDay:      doc.virtualDay,
      virtualMinute:   doc.virtualMinute,
      decisionIntent:  doc.decisionIntent,
      executionStatus: doc.executionStatus,
      snapshotId:      doc.snapshotId,
      traceId:         doc.traceId,
      createdAt:       doc.createdAt,
    };
  }
}
