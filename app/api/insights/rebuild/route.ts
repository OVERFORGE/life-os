import { connectDB } from "@/server/db/connect";
import { DailyLog } from "@/server/db/models/DailyLog";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { getAuthSession } from "@/lib/auth";
import { analyzeLifeState } from "@/features/insights/engine/analyzeLifeState";

function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function computeBaseline(logs: any[]) {
  return {
    sleep: avg(logs.map(l => l.sleep?.hours || 0)),
    mood: avg(logs.map(l => l.mental?.mood || 0)),
    stress: avg(logs.map(l => l.mental?.stress || 0)),
    energy: avg(logs.map(l => l.mental?.energy || 0)),
    deepWork: avg(logs.map(l => l.work?.deepWorkHours || 0)),
  };
}

const DEFAULT_THRESHOLDS = {
  burnout: { sleepBelow: -0.8, stressAbove: 0.8, workAbove: 0.7 },
  grind: { workAbove: 0.6, sleepBelow: -0.5 },
  recovery: { sleepAbove: 0.7, workBelow: -0.5 },
  slump: { moodBelow: -0.7, workBelow: -0.6 },
};

export async function POST() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  // 1️⃣ Delete old history
  await PhaseHistory.deleteMany({ userId: session.user.id });

  // 2️⃣ Load ALL logs
  const allLogs = await DailyLog.find({ userId: session.user.id })
    .sort({ date: 1 }) // oldest → newest
    .lean();

  if (allLogs.length < 20) {
    return Response.json({ error: "Not enough data" }, { status: 400 });
  }

  // 3️⃣ Compute baseline from whole year
  const baseline = computeBaseline(allLogs);

  let lastPhase: string | null = null;
  let currentStartDate: string | null = null;

  let created = 0;

  // 4️⃣ Walk day by day
  for (let i = 14; i < allLogs.length; i++) {
    const window = allLogs.slice(i - 14, i);
    const today = allLogs[i].date;

    const result = analyzeLifeState({
      recentLogs: window,
      baselines: baseline,
      thresholds: DEFAULT_THRESHOLDS,
    });

    if (!lastPhase) {
      lastPhase = result.phase;
      currentStartDate = today;
      continue;
    }

    if (result.phase !== lastPhase) {
      await PhaseHistory.create({
        userId: session.user.id,
        phase: lastPhase,
        startDate: currentStartDate,
        endDate: today,
        reason: result.reason,
        snapshot: result.snapshot,
      });

      created++;

      lastPhase = result.phase;
      currentStartDate = today;
    }
  }

  // 5️⃣ Close final phase
  if (lastPhase && currentStartDate) {
    const lastDate = allLogs[allLogs.length - 1].date;

    await PhaseHistory.create({
      userId: session.user.id,
      phase: lastPhase,
      startDate: currentStartDate,
      endDate: null,
    });

    created++;
  }

  return Response.json({ ok: true, phasesCreated: created });
}
