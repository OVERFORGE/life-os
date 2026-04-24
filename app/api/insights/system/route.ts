// app/api/insights/system/route.ts

import { connectDB } from "@/server/db/connect";
import { getAuthSession } from "@/lib/auth";

import { DailyLog } from "@/server/db/models/DailyLog";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { LifeSettings } from "@/features/insights/models/LifeSettings";

import { analyzeGlobalGoalLoad } from "@/features/goals/engine/analyzeGlobalGoalLoad";
import { insightsEngine } from "@/features/insights/engine/insightsEngine";

/* ------------------------------------------------ */
/* GET — System Insight                             */
/* ------------------------------------------------ */

export async function GET() {
  const session = await getAuthSession();
  
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  await connectDB();

  /* ------------------------------------------------ */
  /* 1️⃣ Latest Daily Log                              */
  /* ------------------------------------------------ */

  const latestLog = await DailyLog.findOne({ userId })
    .sort({ date: -1 })
    .lean();

  if (!latestLog) {
    return Response.json({
      ok: true,
      insight: null,
      message: "No logs available",
    });
  }

  /* ------------------------------------------------ */
  /* 2️⃣ Current Phase                                 */
  /* ------------------------------------------------ */

  const currentPhase = await PhaseHistory.findOne({
    userId,
    endDate: null,
  }).lean();

  const phase = currentPhase?.phase ?? "balanced";

  /* ------------------------------------------------ */
  /* 3️⃣ Load Life Settings                            */
  /* ------------------------------------------------ */

  const settings = await LifeSettings.findOne({ userId }).lean();

  const weights =
    settings?.goalPressureWeights ?? {
      cadence: 0.25,
      energy: 0.25,
      stress: 0.25,
      phaseMismatch: 0.25,
    };

  /* ------------------------------------------------ */
  /* 4️⃣ Compute Goal Load                             */
  /* ------------------------------------------------ */

  const globalLoad = await analyzeGlobalGoalLoad([]);

  /* ------------------------------------------------ */
  /* 5️⃣ Convert Signals                               */
  /* ------------------------------------------------ */

  const signals = {
    sleepScore: latestLog.sleep?.hours
      ? Math.min(1, latestLog.sleep.hours / 8)
      : 0.5,

    energyScore: latestLog.mental?.energy
      ? latestLog.mental.energy / 10
      : 0.5,

    stressScore: latestLog.mental?.stress
      ? latestLog.mental.stress / 10
      : 0.5,

    moodScore: latestLog.mental?.mood
      ? latestLog.mental.mood / 10
      : 0.5,
  };

  /* ------------------------------------------------ */
  /* 6️⃣ Run Insights Engine                           */
  /* ------------------------------------------------ */

  const insight = insightsEngine({
    phase,
    goalLoad: globalLoad.global,
    signals,
  });

  /* ------------------------------------------------ */
  /* 7️⃣ Response                                      */
  /* ------------------------------------------------ */

  return Response.json({
    ok: true,
    insight,
    phase,
    goalLoad: globalLoad.global,
  });
}