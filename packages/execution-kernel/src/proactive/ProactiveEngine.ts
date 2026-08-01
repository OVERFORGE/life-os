import { Suggestion, createSuggestion } from "./Suggestion";
import { WorldSnapshot } from "../world/WorldSnapshot";

/**
 * Proactive Engine Subsystem
 * 
 * ARCHITECTURAL DESIGN NOTE:
 * Evaluates Predictions and Insights present in WorldSnapshot to generate passive,
 * user-facing Suggestions.
 * Zero autonomous execution, zero jobs, zero planning, zero background workers,
 * zero LLM calls, zero DB writes, zero Brain mutations.
 */
export class ProactiveEngine {
  static getInstance(): ProactiveEngine {
    return new ProactiveEngine();
  }

  evaluate(snapshot: WorldSnapshot): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // 1. Evaluate Predictions
    for (const pred of snapshot.predictions) {
      if (pred.type === "poor_recovery_likely") {
        suggestions.push(
          createSuggestion(
            "rest_recommendation",
            "Prioritize Rest & Recovery",
            "Your sleep was below target. Consider scheduling lighter tasks and prioritizing an early bedtime today.",
            "high"
          )
        );
      } else if (pred.type === "hydration_deficit") {
        suggestions.push(
          createSuggestion(
            "hydration_recommendation",
            "Hydration Reminder",
            "Hydration is below daily goal. Remember to drink a glass of water now.",
            "medium"
          )
        );
      } else if (pred.type === "task_backlog_growing") {
        suggestions.push(
          createSuggestion(
            "backlog_triage_recommendation",
            "Task Backlog Triage",
            "You have accumulating overdue tasks. Consider spending 10 minutes triaging high-priority items.",
            "medium"
          )
        );
      }
    }

    // 2. Evaluate Insights
    for (const ins of snapshot.insights) {
      if (ins.type === "high_task_execution_momentum") {
        suggestions.push(
          createSuggestion(
            "momentum_acknowledgement",
            "Great Momentum",
            "You've completed multiple tasks recently! Keep up the focused flow state.",
            "low"
          )
        );
      } else if (ins.type === "sustained_productivity_overload_trend") {
        suggestions.push(
          createSuggestion(
            "workload_rebalance_recommendation",
            "Workload Balancing",
            "High workload detected across active tasks. Consider delegating or rescheduling non-urgent items.",
            "high"
          )
        );
      }
    }

    return suggestions;
  }
}
