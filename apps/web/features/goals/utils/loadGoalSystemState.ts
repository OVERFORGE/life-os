import { Goal } from "../models/Goal";
import { GoalStats } from "../models/GoalStats";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { LifeSettings } from "@/features/insights/models/LifeSettings";
import { analyzeGoalPressure } from "../engine/analyzeGoalPressure";
import { analyzeGlobalGoalLoad } from "../engine/analyzeGlobalGoalLoad";
import { explainLifePhase } from "@/features/insights/engine/explainLifePhase";

export async function loadGoalSystemState(userId: string) {

  const goals = await Goal.find({ userId }).lean();

  if (!goals.length) {
    return {
      goals: [],
      pressures: [],
      globalLoad: null,
    };
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

  const phaseExplanation = phaseDoc
    ? {
      ...explainLifePhase(phaseDoc),
      phase: phaseDoc.phase,
    }
    : {
      ...explainLifePhase({ phase: "balanced", snapshot: {} }),
      phase: "balanced",
    };

  const settings = await LifeSettings.findOne({
    userId,
  }).lean();

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
      phase: phaseExplanation,
      weights,
    })
  );

  const globalLoad = analyzeGlobalGoalLoad(pressures);

  return {
    goals,
    pressures,
    globalLoad,
  };
}