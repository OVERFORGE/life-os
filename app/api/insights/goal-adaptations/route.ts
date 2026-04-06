import { connectDB } from "@/server/db/connect";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

import { Goal } from "@/features/goals/models/Goal";
import { GoalStats } from "@/features/goals/models/GoalStats";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { LifeSettings } from "@/features/insights/models/LifeSettings";

import { analyzeGoalPressure } from "@/features/goals/engine/analyzeGoalPressure";
import { analyzeGlobalGoalLoad } from "@/features/goals/engine/analyzeGlobalGoalLoad";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";
import { goalAdaptationEngine } from "@/features/goals/engine/goalAdaptationEngine";

export const runtime = "nodejs";

function getSafePhase(phaseDoc: any) {
  if (!phaseDoc) {
    return {
      phase: "balanced",
      summary: "",
      signals: [],
      causes: [],
      risks: [],
      leverage: [],
      predictedNext: null,
      scores: {
        stress: 0,
        energy: 0,
        mood: 0,
        sleep: 0,
        stability: 0,
        load: 0,
      },
    };
  }

  const explained = explainLifePhase(phaseDoc);

  return {
    ...explained,
    phase: phaseDoc.phase,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  await connectDB();

  const goals = await Goal.find({ userId }).lean();

  if (!goals.length) {
    return Response.json({ ok: true, suggestions: [] });
  }

  const goalIds = goals.map((g) => g._id);

  const stats = await GoalStats.find({
    goalId: { $in: goalIds },
  }).lean();

  const statMap = new Map(
    stats.map((s) => [String(s.goalId), s])
  );

  const phaseDoc = await PhaseHistory.findOne({
    userId,
    endDate: null,
  }).lean();

  const phaseExplanation = getSafePhase(phaseDoc);

  const settings = await LifeSettings.findOne({ userId }).lean();

  const weights =
    settings?.goalPressureWeights ?? {
      cadence: 0.25,
      energy: 0.25,
      stress: 0.25,
      phaseMismatch: 0.25,
    };

  const pressures = goals.map((goal) =>
    analyzeGoalPressure({
      goal,
      stats: statMap.get(String(goal._id)) || null,
      phase: phaseExplanation, // ✅ ALWAYS VALID NOW
      weights,
    })
  );

  const globalLoad = analyzeGlobalGoalLoad(pressures);

  const suggestions = goalAdaptationEngine({
    goals,
    pressures,
    phase: phaseExplanation.phase,
    globalLoad: globalLoad.global,
  });

  return Response.json({
    ok: true,
    suggestions,
  });
}