import { DailyLog } from "../db/models/DailyLog";
import { NutritionLog } from "../db/models/NutritionLog";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { Goal } from "@/features/goals/models/Goal";
import { buildHealthContext } from "@/server/health/healthContextBuilder";

export async function buildContext({
  intents,
  userId,
  input,
  mode = "general",
}: {
  intents: string[];
  userId: string;
  input: string;
  mode?: string;
}) {
  if (mode === "health") {
    return buildHealthContext(userId);
  }

  if (intents.includes("casual_chat") && intents.length === 1) {
    return { type: "minimal" };
  }

  const todayDate = new Date();
  
  if (intents.includes("ask_advice")) {
    // 1. Last 7 days logs
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(todayDate.getDate() - 7);
    const todayStr = todayDate.toISOString().split("T")[0];
    
    const logs = await DailyLog.find({
      userId,
      date: { $gte: sevenDaysAgo.toISOString().split("T")[0] },
    }).sort({ date: 1 }).lean();

    // 2. Today's NutritionLog for calorie/diet queries
    const todayNutrition = await NutritionLog.findOne({ userId, date: todayStr }).lean();

    // 3. Current Phase
    const currentPhase = await PhaseHistory.findOne({
      userId,
    }).sort({ startDate: -1 }).lean();

    // 4. Active Goals
    const activeGoals = await Goal.find({ userId }).lean();

    return {
      type: "advice",
      logs,
      phase: currentPhase ? currentPhase.phase : "stable",
      goals: activeGoals.map((g) => ({ title: g.title, type: g.type, cadence: g.cadence })),
      habits: logs.map(l => ({ date: l.date, signals: l.signals })),
      todayNutrition: todayNutrition ? {
        calories: todayNutrition.dailyTotals?.calories || 0,
        protein: todayNutrition.dailyTotals?.protein || 0,
        carbs: todayNutrition.dailyTotals?.carbs || 0,
        fats: todayNutrition.dailyTotals?.fats || 0,
        mealCount: todayNutrition.meals?.length || 0,
      } : { calories: 0, protein: 0, carbs: 0, fats: 0, mealCount: 0, note: "No meals logged today" },
    };
  }

  if (intents.includes("get_insights")) {
    // 1. Last 30 days logs
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(todayDate.getDate() - 30);

    const logs = await DailyLog.find({
      userId,
      date: { $gte: thirtyDaysAgo.toISOString().split("T")[0] },
    }).sort({ date: 1 }).lean();

    // 2. Aggregated metrics & trends
    let totalMood = 0, totalEnergy = 0, totalStress = 0, totalSleep = 0;
    let daysWithMental = 0, daysWithSleep = 0;
    
    // Recent 7 days vs Previous 7 days for trends
    let recentEnergy = 0, prevEnergy = 0;
    let recentMood = 0, prevMood = 0;
    let recentDays = 0, prevDays = 0;
    
    const sevenDaysAgoStr = new Date(todayDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const fourteenDaysAgoStr = new Date(todayDate.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    logs.forEach((log) => {
      // General Averages
      if (log.mental) {
        if (log.mental.mood) { totalMood += log.mental.mood; }
        if (log.mental.energy) { totalEnergy += log.mental.energy; }
        if (log.mental.stress) { totalStress += log.mental.stress; }
        daysWithMental++;
      }
      if (log.sleep && log.sleep.hours) {
        totalSleep += log.sleep.hours;
        daysWithSleep++;
      }

      // Trend Tracking
      if (log.date >= sevenDaysAgoStr) {
        if (log.mental?.energy) recentEnergy += log.mental.energy;
        if (log.mental?.mood) recentMood += log.mental.mood;
        recentDays++;
      } else if (log.date >= fourteenDaysAgoStr) {
        if (log.mental?.energy) prevEnergy += log.mental.energy;
        if (log.mental?.mood) prevMood += log.mental.mood;
        prevDays++;
      }
    });

    const avgMood = daysWithMental ? totalMood / daysWithMental : 0;
    const avgEnergy = daysWithMental ? totalEnergy / daysWithMental : 0;
    const avgStress = daysWithMental ? totalStress / daysWithMental : 0;
    const avgSleep = daysWithSleep ? totalSleep / daysWithSleep : 0;

    const recentAvgEnergy = recentDays ? recentEnergy / recentDays : 0;
    const prevAvgEnergy = prevDays ? prevEnergy / prevDays : 0;
    
    const energyTrend = recentAvgEnergy > prevAvgEnergy ? "up" : recentAvgEnergy < prevAvgEnergy ? "down" : "stable";

    // 3. Phase History
    const phaseHistory = await PhaseHistory.find({ userId })
      .sort({ startDate: -1 })
      .limit(3)
      .lean();

    return {
      type: "insights",
      summary: {
        avgMood: avgMood.toFixed(1),
        avgEnergy: avgEnergy.toFixed(1),
        avgStress: avgStress.toFixed(1),
        avgSleep: avgSleep.toFixed(1),
        totalLogs: logs.length
      },
      trends: {
        energyTrend,
        recentAvgEnergy: recentAvgEnergy.toFixed(1),
        prevAvgEnergy: prevAvgEnergy.toFixed(1),
      },
      phaseHistory: phaseHistory.map(p => ({
        phase: p.phase,
        startDate: p.startDate,
        endDate: p.endDate || "current"
      }))
    };
  }

  return { type: "minimal" };
}
