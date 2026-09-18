/**
 * TimelineService — Phase 1.7 V2
 *
 * Reads ONLY from sim_run_journal.
 * Never touches snapshots, artifacts, or traces.
 */

import { TimelineEntryDTO } from "../contracts/journalContracts";
import { IJournalRepository } from "../repositories/IJournalRepository";
import { JournalRepository } from "../repositories/journalRepository";
import { toTimeline } from "../mappers/timelineMapper";

export class TimelineService {
  constructor(
    private readonly journalRepo: IJournalRepository = new JournalRepository()
  ) {}

  /**
   * Returns ordered timeline entries for a simulation run.
   * Reads ONLY from sim_run_journal — never snapshots or artifacts.
   */
  async getTimeline(runUid: string): Promise<TimelineEntryDTO[]> {
    const entries = await this.journalRepo.findAllForRun(runUid);
    return toTimeline(entries);
  }
}
