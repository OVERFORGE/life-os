import { PhaseHistory } from "../models/PhaseHistory";

const REQUIRED_DAYS: Record<string, number> = {
  burnout: 3,
  grind: 3,
  slump: 4,
  recovery: 4,
  balanced: 7, // 👈 HARD TO ENTER BALANCED
};

export async function updatePhaseHistory({
  userId,
  newPhase,
  today,
  snapshot,
  reason,
}: {
  userId: string;
  newPhase: string;
  today: string;
  snapshot: any;
  reason: string;
}) {
  // ⚠️ Never commit drifting to timeline
  if (newPhase === "drifting") {
    return;
  }

  const last = await PhaseHistory.findOne({ userId }).sort({ createdAt: -1 });

  // First ever phase
  if (!last) {
    await PhaseHistory.create({
      userId,
      phase: newPhase,
      startDate: today,
      snapshot,
      reason,
    });
    return;
  }

  // Same phase → just update snapshot & reason
  if (last.phase === newPhase) {
    last.snapshot = snapshot;
    last.reason = reason;
    await last.save();
    return;
  }

  // Check how long newPhase has been persistent
  const since = new Date(last.startDate);
  const now = new Date(today);
  const daysInCurrent = Math.max(
    1,
    Math.ceil((now.getTime() - since.getTime()) / (1000 * 60 * 60 * 24))
  );

  const required = REQUIRED_DAYS[newPhase] || 3;

  // ❌ Not persistent enough → do nothing
  if (daysInCurrent < required) {
    return;
  }

  // ✅ Commit phase change

  // Close previous
  last.endDate = today;
  await last.save();

  // Create new
  await PhaseHistory.create({
    userId,
    phase: newPhase,
    startDate: today,
    snapshot,
    reason,
  });
}
