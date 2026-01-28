import { PhaseDailyState } from "../models/PhaseDailyState";
import { PhaseHistory } from "../models/PhaseHistory";

const MIN_DAYS: Record<string, number> = {
  burnout: 3,
  grind: 3,
  slump: 4,
  recovery: 4,
  balanced: 7,
};

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
  };

  const blocks: Block[] = [];

  let currentPhase = days[0].candidatePhase;
  let currentStart = days[0].date;
  let currentDays = 1;
  let currentSnapshot = days[0].snapshot;
  let currentReason = "";

  function commit(endDate: string | null) {
    blocks.push({
      phase: currentPhase,
      startDate: currentStart,
      endDate,
      snapshot: currentSnapshot,
      reason: currentReason,
      days: currentDays,
    });
  }

  for (let i = 1; i < days.length; i++) {
    const d = days[i];

    if (d.candidatePhase === currentPhase) {
      currentDays++;
      continue;
    }

    const min = MIN_DAYS[currentPhase] || 3;

    // ❌ Too short → pretend this phase never existed
    if (currentDays < min) {
      // Just switch phase, but DO NOT commit
      currentPhase = d.candidatePhase;
      currentStart = d.date;
      currentDays = 1;
      currentSnapshot = d.snapshot;
      currentReason = "";
      continue;
    }

    // ✅ Commit valid block
    commit(d.date);

    // Start new
    currentPhase = d.candidatePhase;
    currentStart = d.date;
    currentDays = 1;
    currentSnapshot = d.snapshot;
    currentReason = "";
  }

  // Commit final block (if long enough)
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
