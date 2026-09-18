/**
 * SnapshotPersistencePolicy — Strategy Interface & Default Policy Implementation
 *
 * Defines ISnapshotPersistencePolicy strategy interface and EveryTickPersistencePolicy
 * for data-driven snapshot frequency control.
 */

export interface SnapshotPersistenceContext {
  tick: number;
  virtualDay: number;
  virtualMinute: number;
  hasEmittedEvents?: boolean;
}

export interface ISnapshotPersistencePolicy {
  shouldPersist(context: SnapshotPersistenceContext): boolean;
}

/**
 * Default policy strategy: Persists a canonical snapshot on every completed tick.
 */
export class EveryTickPersistencePolicy implements ISnapshotPersistencePolicy {
  public shouldPersist(): boolean {
    return true;
  }
}
