import { PhaseHistory } from "../models/PhaseHistory";
import { analyzeLifeState } from "./analyzeLifeState";

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function backfillPhaseHistory({
  userId,
  logs,
}: {
  userId: string;
  logs: any[];
}) {
  console.log("🔁 Backfilling phase history...");

  // 1. Wipe old history
  await PhaseHistory.deleteMany({ userId });

  // 2. Sort logs oldest → newest
  const sorted = [...logs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (sorted.length < 7) {
    console.log("⚠️ Not enough logs to backfill phases.");
    return;
  }

  let currentPhase: string | null = null;
  let currentStartDate: string | null = null;
  let currentSnapshot: any = null;
  let currentReason: string | null = null;

  for (let i = 6; i < sorted.length; i++) {
    const WINDOW = 14;
    const start = Math.max(0, i - WINDOW + 1);
    const windowLogs = sorted.slice(start, i + 1);


    const result = analyzeLifeState({
      recentLogs: windowLogs,
      baselines: {
        sleep: 7,
        mood: 5,
        stress: 5,
        energy: 5,
        deepWork: 2,
      },
    });

    if (!result) continue;

    const { candidatePhase: phase, snapshot, reason } = result;
    const day = sorted[i].date;

    // First phase ever
    if (!currentPhase) {
      currentPhase = phase;
      currentStartDate = day;
      currentSnapshot = snapshot;
      currentReason = reason;
      continue;
    }

    // Phase changed
    if (phase !== currentPhase) {
      // Close previous
      await PhaseHistory.create({
        userId,
        phase: currentPhase,
        startDate: currentStartDate,
        endDate: day,
        snapshot: currentSnapshot,
        reason: currentReason,
      });

      // Start new
      currentPhase = phase;
      currentStartDate = day;
      currentSnapshot = snapshot;
      currentReason = reason;
    }
  }

  // Close final phase (current)
  if (currentPhase && currentStartDate) {
    await PhaseHistory.create({
      userId,
      phase: currentPhase,
      startDate: currentStartDate,
      endDate: null,
      snapshot: currentSnapshot,
      reason: currentReason,
    });
  }

  console.log("✅ Phase history backfill complete.");
}
