import { Insight, createInsight } from "./Insight";
import { WorldSnapshot } from "../world/WorldSnapshot";

/**
 * Insight Engine Subsystem
 * 
 * ARCHITECTURAL DESIGN NOTE:
 * Consumes WorldSnapshot directly to observe and summarize recurring historical trends.
 * Distinct from PredictionEngine: Predictions assess near-future conditions, while Insights
 * summarize multi-event recurring patterns over time.
 * Zero ML, zero neural networks, zero adaptive weights, zero LLM calls, zero Brain mutations.
 */
export class InsightEngine {
  static getInstance(): InsightEngine {
    return new InsightEngine();
  }

  generateInsights(snapshot: WorldSnapshot): Insight[] {
    const insights: Insight[] = [];

    // 1. Recurring Episodic Activity Trend
    const episodicMemories = snapshot.recentMemories.filter((m) => m.category === "Episodic");
    const completedTaskEvents = episodicMemories.filter((m) => m.key === "task_completed");
    
    if (completedTaskEvents.length >= 3) {
      insights.push(
        createInsight(
          "high_task_execution_momentum",
          `User has demonstrated sustained execution momentum with ${completedTaskEvents.length} tasks recently completed.`,
          0.95
        )
      );
    }

    // 2. Meal Tracking Trend
    const mealEvents = episodicMemories.filter((m) => m.key === "meal_logged");
    if (mealEvents.length >= 3) {
      insights.push(
        createInsight(
          "consistent_nutrition_logging_trend",
          `Consistent nutrition logging observed across ${mealEvents.length} recent meal entries.`,
          0.9
        )
      );
    }

    // 3. Sustained Productivity Load Trend
    const prod = snapshot.userState.productivity;
    if (prod.activeTaskCount && prod.activeTaskCount > 10 && prod.overdueTaskCount && prod.overdueTaskCount >= 5) {
      insights.push(
        createInsight(
          "sustained_productivity_overload_trend",
          `Active task backlog (${prod.activeTaskCount}) combined with overdue tasks (${prod.overdueTaskCount}) indicates high sustained workload.`,
          0.85
        )
      );
    }

    return insights;
  }
}
