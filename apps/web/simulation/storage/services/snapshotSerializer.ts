/**
 * SnapshotSerializer — Deterministic Serialization Subsystem
 *
 * Responsible for converting SimulationSnapshot DTOs into canonical JSON string bytes.
 * Guarantees key sorting and deterministic formatting independent of storage providers.
 */

import { SnapshotHasher } from "../../execution/services/snapshotHasher";
import { SimulationSnapshot } from "../contracts/snapshotStorageContracts";

export class SnapshotSerializer {
  /**
   * Serializes a SimulationSnapshot into a canonical key-sorted JSON string.
   */
  public static serialize(snapshot: SimulationSnapshot): string {
    return SnapshotHasher.canonicalSerialize(snapshot as unknown as Record<string, unknown>);
  }
}
