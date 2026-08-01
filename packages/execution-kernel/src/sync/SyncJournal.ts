export interface JournalEntry {
  eventId: string;
  graphVersion: number;
  repairId: string;
  timestamp: number;
  deviceId: string;
  sessionId: string;
  operationType: string;
  status: "Pending" | "Applied" | "Conflicted" | "Rejected";
  payload?: any;
}

/**
 * SyncJournal Subsystem
 * 
 * SOLE OWNER of immutable sync audit journal.
 * Append-only record of all synchronized kernel operations across devices.
 */
export class SyncJournal {
  private static instance: SyncJournal;
  private entries: JournalEntry[] = [];
  private entryMap: Map<string, JournalEntry> = new Map();

  static getInstance(): SyncJournal {
    if (!SyncJournal.instance) {
      SyncJournal.instance = new SyncJournal();
    }
    return SyncJournal.instance;
  }

  append(entry: JournalEntry): boolean {
    if (this.entryMap.has(entry.eventId)) {
      console.warn(`⚠️ [SYNC_JOURNAL] Duplicate entry ignored: ${entry.eventId}`);
      return false;
    }

    this.entries.push(entry);
    this.entryMap.set(entry.eventId, entry);
    console.log(`📜 [SYNC_JOURNAL] Appended entry ${entry.eventId} (${entry.operationType}, status: ${entry.status})`);
    return true;
  }

  getEntry(eventId: string): JournalEntry | undefined {
    return this.entryMap.get(eventId);
  }

  hasEntry(eventId: string): boolean {
    return this.entryMap.has(eventId);
  }

  getAllEntries(): JournalEntry[] {
    return [...this.entries];
  }

  getEntriesByGraphVersion(version: number): JournalEntry[] {
    return this.entries.filter((e) => e.graphVersion === version);
  }

  getEntriesByDevice(deviceId: string): JournalEntry[] {
    return this.entries.filter((e) => e.deviceId === deviceId);
  }
}
