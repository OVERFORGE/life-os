/**
 * NullSnapshotStorage — Zero-Op Null Storage Implementation
 *
 * Implements ISnapshotStorage using the Null Object Pattern.
 * Provides zero-I/O overhead default storage for lightweight or memory-only simulation runs.
 */

import { ISnapshotStorage } from "../contracts/ISnapshotStorage";
import { SimulationSnapshot } from "../contracts/snapshotStorageContracts";

export class NullSnapshotStorage implements ISnapshotStorage {
  public save(_snapshot: SimulationSnapshot, _serializedContent: string): void {
    // Zero-op: No write performed
  }
}
