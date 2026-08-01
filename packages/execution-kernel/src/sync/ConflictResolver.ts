import { SyncJournal } from "./SyncJournal";
import { QueuedOperation } from "./OfflineOperationQueue";

export type ConflictResolutionAction =
  | "Apply"
  | "RejectDuplicate"
  | "IgnoreAlreadyApplied"
  | "RebaseAndApply"
  | "RejectStaleSession";

export interface ConflictResolutionResult {
  action: ConflictResolutionAction;
  reason: string;
  rebasedOperation?: QueuedOperation;
}

/**
 * ConflictResolver Subsystem
 * 
 * SOLE OWNER of deterministic conflict resolution.
 * Rejects non-deterministic resolution rules (NO Last-Write-Wins, NO random choice).
 * Emits pure, replayable conflict resolution decisions.
 */
export class ConflictResolver {
  private static instance: ConflictResolver;
  private conflictCount: number = 0;

  static getInstance(): ConflictResolver {
    if (!ConflictResolver.instance) {
      ConflictResolver.instance = new ConflictResolver();
    }
    return ConflictResolver.instance;
  }

  getConflictCount(): number {
    return this.conflictCount;
  }

  resolve(operation: QueuedOperation, currentGraphVersion: number): ConflictResolutionResult {
    const journal = SyncJournal.getInstance();

    // 1. Check for Duplicate Event ID
    if (journal.hasEntry(operation.metadata.eventId)) {
      this.conflictCount++;
      return {
        action: "RejectDuplicate",
        reason: `Operation eventId ${operation.metadata.eventId} has already been logged in SyncJournal.`,
      };
    }

    // 2. Check for Already Applied Graph Version
    const opGraphVersion = operation.payload?.graphVersion;
    if (typeof opGraphVersion === "number" && opGraphVersion < currentGraphVersion) {
      this.conflictCount++;
      return {
        action: "IgnoreAlreadyApplied",
        reason: `Operation graph version (v${opGraphVersion}) is older than current graph version (v${currentGraphVersion}).`,
      };
    }

    // 3. Check for Graph Version Mismatch (Forward Rebase)
    if (typeof opGraphVersion === "number" && opGraphVersion > currentGraphVersion + 1) {
      this.conflictCount++;
      const rebasedOp: QueuedOperation = {
        ...operation,
        payload: {
          ...operation.payload,
          targetGraphVersion: currentGraphVersion + 1,
        },
      };
      return {
        action: "RebaseAndApply",
        reason: `Graph version gap detected (v${opGraphVersion} vs v${currentGraphVersion}). Rebased to target v${currentGraphVersion + 1}.`,
        rebasedOperation: rebasedOp,
      };
    }

    // 4. Default Clean Apply
    return {
      action: "Apply",
      reason: "No synchronization conflicts detected.",
    };
  }
}
