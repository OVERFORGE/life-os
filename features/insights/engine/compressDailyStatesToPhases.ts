import { PhaseDailyState } from "../models/PhaseDailyState";

const MIN_DAYS: Record<string, number> = {
  burnout: 3,
  grind: 3,
  slump: 4,
  recovery: 4,
  balanced: 7,
  drifting: 3,
};

const MAX_DAYS = 45;

function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function snapshotDistance(a: any, b: any) {
  if (!a || !b) return 0;

  return (
    Math.abs((a.avgMood ?? 0) - (b.avgMood ?? 0)) +
    Math.abs((a.avgEnergy ?? 0) - (b.avgEnergy ?? 0)) +
    Math.abs((a.avgStress ?? 0) - (b.avgStress ?? 0)) +
    Math.abs((a.avgSleep ?? 0) - (b.avgSleep ?? 0)) +
    Math.abs((a.avgDeepWork ?? 0) - (b.avgDeepWork ?? 0))
  );
}

export async function compressDailyStatesToPhases(userId: string) {
  const days = await PhaseDailyState.find({ userId })
    .sort({ date: 1 })
    .lean();

  if (!days.length) return [];

  type Block = {
    phase: string;
    startDate: string;
    endDate: string | null;
    snapshot: any;
    reason: string;
  };

  const blocks: Block[] = [];

  let currentPhase = days[0].candidatePhase;
  let currentStart = days[0].date;
  let currentSnapshots = [days[0].snapshot];
  let currentConfidences = [days[0].confidence ?? 0.6];

  function commit(endDate: string | null) {
    const snapshot = {
      avgMood: avg(currentSnapshots.map(s => s?.avgMood ?? 0)),
      avgEnergy: avg(currentSnapshots.map(s => s?.avgEnergy ?? 0)),
      avgStress: avg(currentSnapshots.map(s => s?.avgStress ?? 0)),
      avgSleep: avg(currentSnapshots.map(s => s?.avgSleep ?? 0)),
      avgDeepWork: avg(currentSnapshots.map(s => s?.avgDeepWork ?? 0)),
    };

    blocks.push({
      phase: currentPhase,
      startDate: currentStart,
      endDate,
      snapshot,
      reason: "",
    });
  }

  for (let i = 1; i < days.length; i++) {
    const d = days[i];

    const avgSnapshot = {
      avgMood: avg(currentSnapshots.map(s => s?.avgMood ?? 0)),
      avgEnergy: avg(currentSnapshots.map(s => s?.avgEnergy ?? 0)),
      avgStress: avg(currentSnapshots.map(s => s?.avgStress ?? 0)),
      avgSleep: avg(currentSnapshots.map(s => s?.avgSleep ?? 0)),
      avgDeepWork: avg(currentSnapshots.map(s => s?.avgDeepWork ?? 0)),
    };

    const labelChanged = d.candidatePhase !== currentPhase;
    const dist = snapshotDistance(avgSnapshot, d.snapshot);
    const confidenceDrop =
      avg(currentConfidences) - (d.confidence ?? 0.6) > 0.25;

    const tooLong = currentSnapshots.length >= MAX_DAYS;

    const breakPhase =
      labelChanged || dist > 3.5 || confidenceDrop || tooLong;

    if (!breakPhase) {
      currentSnapshots.push(d.snapshot);
      currentConfidences.push(d.confidence ?? 0.6);
      continue;
    }

    const min = MIN_DAYS[currentPhase] || 3;
    if (currentSnapshots.length >= min) {
      commit(d.date);
    }

    currentPhase = d.candidatePhase;
    currentStart = d.date;
    currentSnapshots = [d.snapshot];
    currentConfidences = [d.confidence ?? 0.6];
  }

  const min = MIN_DAYS[currentPhase] || 3;
  if (currentSnapshots.length >= min) {
    commit(null);
  }

  return blocks;
}
