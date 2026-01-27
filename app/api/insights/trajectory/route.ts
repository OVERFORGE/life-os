import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";
import { getAuthSession } from "@/lib/auth";
import { analyzeLifeState } from "@/features/insights/engine/analyzeLifeState";
import { updatePhaseHistory } from "@/features/insights/engine/updatePhaseHistory";

export async function GET() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const logs = await DailyLog.find({ userId: session.user.id })
    .sort({ date: -1 })
    .limit(60)
    .lean();

  const analysis = analyzeLifeState(logs);

  const today = new Date().toISOString().slice(0, 10);

  // 🔥 Persist phase history
  await updatePhaseHistory({
    userId: session.user.id,
    newPhase: analysis.phase,
    today,
    snapshot: analysis.snapshot,
    reason: analysis.reason,
  });

  return Response.json({
    phase: analysis.phase,
    confidence: analysis.confidence,
    reason: analysis.reason,
    snapshot: analysis.snapshot,
    insights: analysis.insights,
  });
}
