/**
 * DiffMapper — Domain & Structural Diff Service (Phase 4)
 *
 * Computes deep structural and domain-specific deltas between world snapshots.
 * Extracts biometric deltas, task progress changes, and activity session transitions.
 */

export interface SnapshotDiff {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, { before: unknown; after: unknown }>;
  unchanged: string[];
  biometricDeltas?: Record<string, number>;
}

export function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): SnapshotDiff {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  const result: SnapshotDiff = {
    added: {},
    removed: {},
    changed: {},
    unchanged: [],
    biometricDeltas: {},
  };

  for (const key of allKeys) {
    const inBefore = Object.prototype.hasOwnProperty.call(before, key);
    const inAfter = Object.prototype.hasOwnProperty.call(after, key);

    if (!inBefore && inAfter) {
      result.added[key] = after[key];
    } else if (inBefore && !inAfter) {
      result.removed[key] = before[key];
    } else {
      const beforeStr = JSON.stringify(before[key]);
      const afterStr = JSON.stringify(after[key]);
      if (beforeStr !== afterStr) {
        result.changed[key] = { before: before[key], after: after[key] };
      } else {
        result.unchanged.push(key);
      }
    }
  }

  // Domain Biometric Deltas extraction if simulatedWorld is present
  const worldBefore = (before.simulatedWorld ?? before) as Record<string, unknown>;
  const worldAfter = (after.simulatedWorld ?? after) as Record<string, unknown>;

  if (worldBefore.biometrics && worldAfter.biometrics) {
    const b1 = worldBefore.biometrics as Record<string, number>;
    const b2 = worldAfter.biometrics as Record<string, number>;
    const deltas: Record<string, number> = {};

    for (const bioKey of Object.keys(b2)) {
      if (typeof b1[bioKey] === "number" && typeof b2[bioKey] === "number") {
        deltas[bioKey] = Math.round((b2[bioKey] - b1[bioKey]) * 10) / 10;
      }
    }
    result.biometricDeltas = deltas;
  }

  return result;
}

export function diffToPayload(diff: SnapshotDiff): Record<string, unknown> {
  return {
    added: diff.added,
    removed: diff.removed,
    changed: diff.changed,
    unchanged: diff.unchanged,
    biometricDeltas: diff.biometricDeltas ?? {},
    summary: {
      addedCount: Object.keys(diff.added).length,
      removedCount: Object.keys(diff.removed).length,
      changedCount: Object.keys(diff.changed).length,
      unchangedCount: diff.unchanged.length,
    },
  };
}
