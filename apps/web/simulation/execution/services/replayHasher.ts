/**
 * ReplayHasher — Single SHA-256 Transcript Hasher
 *
 * Hashes a canonical versioned ReplayTranscript ("1.0.0").
 * Excludes non-deterministic runtime parameters to guarantee byte-for-byte identical replay hashes across machines.
 */

import { createHash } from "crypto";
import { SnapshotHasher } from "./snapshotHasher";
import { ReplayTranscript } from "../contracts/replayTranscriptContracts";

export class ReplayHasher {
  /**
   * Computes SHA-256 hash over an entire canonical ReplayTranscript.
   */
  public static computeReplayHash(transcript: ReplayTranscript): string {
    const canonicalStr = SnapshotHasher.canonicalSerialize(transcript as unknown as Record<string, unknown>);
    return createHash("sha256").update(canonicalStr, "utf8").digest("hex");
  }
}
