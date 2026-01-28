// app/api/insights/rebuild/route.ts

import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";
import { getAuthSession } from "@/lib/auth";

import { LifeSettings } from "@/features/insights/models/LifeSettings";
import { PhaseDailyState } from "@/features/insights/models/PhaseDailyState";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";

import { computeBaselines } from "@/features/insights/engine/computeBaselines";
import { computeDailyState } from "@/features/insights/engine/computeDailyState";
import { DEFAULT_THRESHOLDS } from "@/features/insights/config/defaultThresholds";
import { compressDailyStatesToPhases } from "@/features/insights/engine/compressDailyStatesToPhases";

export async function POST() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  // 1️⃣ Load logs
  const logs = await DailyLog.find({ userId: session.user.id })
    .sort({ date: 1 })
    .lean();

  if (logs.length < 10) {
    return Response.json({ error: "Not enough data" });
  }

  // 2️⃣ Reset old states
  await PhaseDailyState.deleteMany({ userId: session.user.id });
  await PhaseHistory.deleteMany({ userId: session.user.id });

  // 3️⃣ Load or create settings
  let settings = await LifeSettings.findOne({ userId: session.user.id });

  if (!settings) {
    const baselines = computeBaselines(logs);
    settings = await LifeSettings.create({
      userId: session.user.id,
      baselines,
      thresholds: DEFAULT_THRESHOLDS,
    });
  }

  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...settings.thresholds,
    drifting: {
      ...DEFAULT_THRESHOLDS.drifting,
      ...(settings.thresholds?.drifting || {}),
    },
  };

  // 4️⃣ Build daily states
  for (let i = 14; i < logs.length; i++) {
    const slice = logs.slice(0, i + 1);
    const day = logs[i].date;

    await computeDailyState({
      userId: session.user.id,
      date: day,
      logsUpToDate: slice.reverse(),
      baselines: settings.baselines,
      thresholds,
    });
  }

  await compressDailyStatesToPhases(session.user.id);


  return Response.json({ ok: true, days: logs.length });
}
