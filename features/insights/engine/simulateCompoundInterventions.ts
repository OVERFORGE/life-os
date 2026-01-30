import { analyzeLifeState } from "./analyzeLifeState";

/**
 * We simulate small reasonable interventions:
 * +1 or -1 on one or more variables.
 */

type Snapshot = {
  avgSleep: number;
  avgMood: number;
  avgStress: number;
  avgEnergy: number;
  avgDeepWork: number;
};

type Intervention = {
  key: keyof Snapshot;
  delta: number; // +1 or -1
};

const VARIABLES: (keyof Snapshot)[] = [
  "avgSleep",
  "avgMood",
  "avgStress",
  "avgEnergy",
  "avgDeepWork",
];

// Only reasonable deltas
const DELTAS = [+1, -1];

// Generate combinations of size 2 and 3
function combinations<T>(arr: T[], size: number): T[][] {
  if (size === 1) return arr.map((x) => [x]);
  const result: T[][] = [];
  arr.forEach((item, i) => {
    const rest = arr.slice(i + 1);
    combinations(rest, size - 1).forEach((c) => {
      result.push([item, ...c]);
    });
  });
  return result;
}

// Apply intervention to snapshot
function applyIntervention(
  snapshot: Snapshot,
  interventions: Intervention[]
): Snapshot {
  const next = { ...snapshot };

  for (const i of interventions) {
    next[i.key] = Math.max(0, (next[i.key] || 0) + i.delta);
  }

  return next;
}

export function simulateCompoundInterventions({
  phase,
  baselines,
  thresholds,
}: {
  phase: any;
  baselines: any;
  thresholds: any;
}) {
  const snapshot: Snapshot = phase.snapshot;

  if (!snapshot) return [];

  // Build all possible small interventions
  const primitive: Intervention[] = [];

  for (const v of VARIABLES) {
    for (const d of DELTAS) {
      primitive.push({ key: v, delta: d });
    }
  }

  // Build combos of size 2 and 3
  const pairs = combinations(primitive, 2);
  const triples = combinations(primitive, 3);

  const all = [...pairs, ...triples];

  const results: any[] = [];

  for (const combo of all) {
    // ❌ Disallow conflicting ops on same variable
    const keys = combo.map((c) => c.key);
    if (new Set(keys).size !== keys.length) continue;

    const newSnapshot = applyIntervention(snapshot, combo);

    // Fake logs from snapshot (adapter)
    const fakeLogs = [
      {
        sleep: { hours: newSnapshot.avgSleep },
        mental: {
          mood: newSnapshot.avgMood,
          stress: newSnapshot.avgStress,
          energy: newSnapshot.avgEnergy,
        },
        work: {
          deepWorkHours: newSnapshot.avgDeepWork,
        },
      },
    ];

    const analysis = analyzeLifeState({
      recentLogs: fakeLogs,
      baselines,
      thresholds,
    });

    results.push({
      actions: combo.map((c) =>
        `${c.key.replace("avg", "").toLowerCase()} ${c.delta > 0 ? "+" : ""}${c.delta}`
      ),
      resultPhase: analysis.candidatePhase,
      confidence: analysis.confidence,
      isWarning: analysis.isWarning,
    });
  }

  // Sort by:
  // 1. Non-warning
  // 2. Better phase than current
  // 3. Higher confidence
  results.sort((a, b) => {
    if (a.isWarning !== b.isWarning) return a.isWarning ? 1 : -1;
    return b.confidence - a.confidence;
  });

  // Return top 5 only
  return results.slice(0, 5);
}
