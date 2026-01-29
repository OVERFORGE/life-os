import { PhaseDailyState } from "../models/PhaseDailyState";
import { PhaseHistory } from "../models/PhaseHistory";

const MIN_DAYS: Record<string, number> = {
  burnout: 3,
  grind: 3,
  slump: 4,
  recovery: 4,
  balanced: 7,
  drifting: 3,
};

const MAX_DAYS = 45; // ⏱️ Hard cap: no phase can exceed this

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
  // 1️⃣ Load daily states
  const days = await PhaseDailyState.find({ userId })
    .sort({ date: 1 })
    .lean();

  if (days.length === 0) return [];

  // 2️⃣ Clear old history
  await PhaseHistory.deleteMany({ userId });

  type Block = {
    phase: string;
    startDate: string;
    endDate: string | null;
    snapshot: any;
    reason: string;
    days: number;
    confidences: number[];
    snapshots: any[];
  };

  const blocks: Block[] = [];

  let currentPhase = days[0].candidatePhase;
  let currentStart = days[0].date;
  let currentDays = 1;
  let currentSnapshots = [days[0].snapshot];
  let currentConfidences = [days[0].confidence ?? 0.6];

  function commit(endDate: string | null) {
    const snap = {
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
      snapshot: snap,
      reason: "",
      days: currentDays,
      confidences: currentConfidences,
      snapshots: currentSnapshots,
    });
  }

  for (let i = 1; i < days.length; i++) {
    const d = days[i];

    const labelChanged = d.candidatePhase !== currentPhase;

    const avgSnapshot = {
      avgMood: avg(currentSnapshots.map(s => s?.avgMood ?? 0)),
      avgEnergy: avg(currentSnapshots.map(s => s?.avgEnergy ?? 0)),
      avgStress: avg(currentSnapshots.map(s => s?.avgStress ?? 0)),
      avgSleep: avg(currentSnapshots.map(s => s?.avgSleep ?? 0)),
      avgDeepWork: avg(currentSnapshots.map(s => s?.avgDeepWork ?? 0)),
    };

    const dist = snapshotDistance(avgSnapshot, d.snapshot);

    const confidenceDrop =
      (avg(currentConfidences) - (d.confidence ?? 0.6)) > 0.25;

    const tooLong = currentDays >= MAX_DAYS;

    const regimeBreak =
      labelChanged ||
      dist > 3.5 ||        // 📉 internal state shifted a lot
      confidenceDrop ||    // 🧠 classification certainty broke
      tooLong;             // ⏱️ hard cap

    if (!regimeBreak) {
      // continue block
      currentDays++;
      currentSnapshots.push(d.snapshot);
      currentConfidences.push(d.confidence ?? 0.6);
      continue;
    }

    // We are breaking the phase
    const min = MIN_DAYS[currentPhase] || 3;

    if (currentDays >= min) {
      commit(d.date);
    }

    // start new block
    currentPhase = d.candidatePhase;
    currentStart = d.date;
    currentDays = 1;
    currentSnapshots = [d.snapshot];
    currentConfidences = [d.confidence ?? 0.6];
  }

  // Commit final block
  const min = MIN_DAYS[currentPhase] || 3;
  if (currentDays >= min) {
    commit(null);
  }

  // 3️⃣ Save to DB
  if (blocks.length > 0) {
    await PhaseHistory.insertMany(
      blocks.map((b) => ({
        userId,
        phase: b.phase,
        startDate: b.startDate,
        endDate: b.endDate,
        snapshot: b.snapshot,
        reason: b.reason,
      }))
    );
  }

  return blocks;
}
