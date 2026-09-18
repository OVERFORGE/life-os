/**
 * ISnapshotStorage — Snapshot Persistence Storage Authority Interface
 *
 * Defines single-authority interface for persisting pre-serialized simulation snapshot bytes.
 * Storage providers do NOT own or invoke serialization logic.
 */

import { SimulationSnapshot } from "./snapshotStorageContracts";

export interface ISnapshotStorage {
  save(snapshot: SimulationSnapshot, serializedContent: string): Promise<void> | void;
}
