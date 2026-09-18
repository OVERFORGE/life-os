import { SimulationJournalEntry } from "../contracts/journalContracts";
import { RepositoryWriteOptions } from "./IArtifactRepository";

/**
 * IJournalRepository
 *
 * Repository interface for sim_run_journal collection.
 * TimelineService depends on this interface — not on the concrete Mongo implementation.
 */
export interface IJournalRepository {
  /** Append a journal entry. Append-only — never updates existing records. */
  append(entry: SimulationJournalEntry, options?: RepositoryWriteOptions): Promise<void>;

  /** Retrieve all journal entries for a run, ordered by stepNumber ascending. */
  findAllForRun(runUid: string): Promise<SimulationJournalEntry[]>;

  /** Retrieve a single journal entry by its deterministic ID. */
  findById(journalEntryId: string): Promise<SimulationJournalEntry | null>;

  /** Retrieve journal entry for a specific run + step. */
  findByRunAndStep(runUid: string, stepNumber: number): Promise<SimulationJournalEntry | null>;
}
