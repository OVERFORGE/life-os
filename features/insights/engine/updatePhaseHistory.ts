import { PhaseHistory } from "../models/PhaseHistory";

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
  // Get latest phase entry
  const last = await PhaseHistory.findOne({ userId }).sort({ createdAt: -1 });

  // 1️⃣ If no history → create first
  if (!last) {
    await PhaseHistory.create({
      userId,
      phase: newPhase,
      startDate: today,
      endDate: null,
      snapshot,
      reason,
    });
    return;
  }

  // 2️⃣ If same phase AND still open → just update snapshot/reason
  if (last.phase === newPhase && last.endDate == null) {
    await PhaseHistory.updateOne(
      { _id: last._id },
      {
        snapshot,
        reason,
        updatedAt: new Date(),
      }
    );
    return;
  }

  // 3️⃣ If same phase but already closed → do nothing
  if (last.phase === newPhase && last.endDate != null) {
    return;
  }

  // 4️⃣ Phase changed → close old
  if (last.endDate == null) {
    last.endDate = today;
    await last.save();
  }

  // 5️⃣ Create new phase
  await PhaseHistory.create({
    userId,
    phase: newPhase,
    startDate: today,
    endDate: null,
    snapshot,
    reason,
  });
}
