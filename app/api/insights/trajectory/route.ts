import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";
import { getAuthSession } from "@/lib/auth";

import { LifeSettings } from "@/features/insights/models/LifeSettings";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";

import { computeBaselines } from "@/features/insights/engine/computeBaselines";
import { analyzeLifeState } from "@/features/insights/engine/analyzeLifeState";
import { updatePhaseHistory } from "@/features/insights/engine/updatePhaseHistory";

import { DEFAULT_THRESHOLDS } from "@/features/insights/config/defaultThresholds";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  // 1️⃣ Load logs
  const logs = await DailyLog.find({ userId: session.user.id })
    .sort({ date: -1 })
    .limit(400)
    .lean();

  if (!logs.length) {
    return Response.json({
      phase: "balanced",
      confidence: 0.3,
      reason: "Not enough data yet",
      snapshot: {},
      insights: [],
    });
  }

  // 2️⃣ Load or create LifeSettings
  let settings = await LifeSettings.findOne({ userId: session.user.id });

  if (!settings) {
    const baselines = computeBaselines(logs);

    settings = await LifeSettings.create({
      userId: session.user.id,
      baselines,
      thresholds: DEFAULT_THRESHOLDS,
    });
  }

  // 3️⃣ Analyze life state (CORE BRAIN)
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...settings.thresholds,
    drifting: {
      ...DEFAULT_THRESHOLDS.drifting,
      ...(settings.thresholds?.drifting || {}),
    },
  };

  const analysis = analyzeLifeState({
    recentLogs: logs,
    baselines: settings.baselines,
    thresholds,
  });


  const today = todayStr();

  // 4️⃣ Update phase history timeline
  await updatePhaseHistory({
    userId: session.user.id,
    newPhase: analysis.candidatePhase,
    today,
    snapshot: analysis.snapshot,
    reason: analysis.reason,
  });

  // 5️⃣ Return response
  return Response.json({
    phase: analysis.candidatePhase,
    confidence: analysis.confidence,
    reason: analysis.reason,
    snapshot: analysis.snapshot,
    insights: analysis.insights,
  });
}
