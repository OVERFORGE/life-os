/**
 * TimelineHasher — Subsystem for Deterministic SimulationTimeline Cryptographic Hashes
 *
 * Computes single SHA-256 digest over canonical SimulationTimeline DTOs using key-sorted JSON serialization.
 * Strictly decoupled from recording and DTO assembly.
 */

import { createHash } from "crypto";
import { SnapshotHasher } from "./snapshotHasher";
import { SimulationTimeline } from "../../runtime/contracts/timelineContracts";

export class TimelineHasher {
  /**
   * Computes SHA-256 hash over an entire canonical SimulationTimeline DTO.
   */
  public static computeTimelineHash(timeline: SimulationTimeline): string {
    const canonicalStr = SnapshotHasher.canonicalSerialize(timeline as unknown as Record<string, unknown>);
    return createHash("sha256").update(canonicalStr, "utf8").digest("hex");
  }
}
