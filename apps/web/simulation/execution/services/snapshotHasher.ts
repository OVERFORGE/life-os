/**
 * SnapshotHasher — Recursive Canonical SHA-256 Hashing Service
 *
 * Recursively sorts all object keys alphabetically prior to stringification.
 * Guarantees that key insertion order never impacts hash output.
 */

import { createHash } from "crypto";

export class SnapshotHasher {
  /**
   * Recursively canonicalizes any JS object/array/primitive into a key-sorted JSON string.
   */
  public static canonicalSerialize(val: unknown): string {
    if (val === null || typeof val !== "object") {
      return JSON.stringify(val);
    }

    if (Array.isArray(val)) {
      const items = val.map((item) => SnapshotHasher.canonicalSerialize(item));
      return `[${items.join(",")}]`;
    }

    const obj = val as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const keyPairs = sortedKeys.map(
      (key) => `${JSON.stringify(key)}:${SnapshotHasher.canonicalSerialize(obj[key])}`
    );
    return `{${keyPairs.join(",")}}`;
  }

  /**
   * Computes SHA-256 hash of a world state object using canonical key ordering.
   */
  public static computeWorldHash(worldState: Record<string, unknown>): string {
    const canonical = SnapshotHasher.canonicalSerialize(worldState);
    return createHash("sha256").update(canonical, "utf8").digest("hex");
  }

  /**
   * Computes SHA-256 hash of a snapshot diff payload using canonical key ordering.
   */
  public static computeDiffHash(diffPayload: Record<string, unknown>): string {
    const canonical = SnapshotHasher.canonicalSerialize(diffPayload);
    return createHash("sha256").update(canonical, "utf8").digest("hex");
  }
}
