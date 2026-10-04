import { Suggestion, createSuggestion } from "./Suggestion";
import { WorldSnapshot } from "../world/WorldSnapshot";
import { ILifeContextProjection } from "../worldv2/contracts/LifeContextProjectionContracts";
import { AutonomyLevel } from "./contracts/ProactiveContracts";
import { ProactivePolicyDaemon, IProactiveEvaluationReport } from "./ProactivePolicyDaemon";
import { IKernelCapabilityService } from "../orchestration/kernel/IKernelCapabilityService";

/**
 * Proactive Engine Subsystem (Hardened Phase 8)
 * 
 * Provides:
 * 1. Legacy read-only suggestions generator for backward compatibility.
 * 2. Closed-loop policy daemon pipeline for autonomous and interactive interventions.
 */
export class ProactiveEngine {
  private static instance: ProactiveEngine;
  private daemon: ProactivePolicyDaemon;

  constructor(daemon: ProactivePolicyDaemon = ProactivePolicyDaemon.getInstance()) {
    this.daemon = daemon;
  }

  static getInstance(): ProactiveEngine {
    if (!ProactiveEngine.instance) {
      ProactiveEngine.instance = new ProactiveEngine();
    }
    return ProactiveEngine.instance;
  }

  setKernelCapabilityService(service: IKernelCapabilityService): void {
    this.daemon.setKernelCapabilityService(service);
  }

  getDaemon(): ProactivePolicyDaemon {
    return this.daemon;
  }

  /**
   * Closed-loop evaluation pipeline running against canonical life projection.
   */
  async evaluateProactivePipeline(
    userId: string,
    projection: ILifeContextProjection,
    userAutonomySetting: AutonomyLevel = "L1",
    now: number = Date.now()
  ): Promise<IProactiveEvaluationReport> {
    return this.daemon.evaluateUserProactivity(userId, projection, userAutonomySetting, now);
  }

  /**
   * Legacy passive suggestions generator for backward compatibility with WorldSnapshot.
   */
  evaluate(snapshot: WorldSnapshot): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // 1. Evaluate Predictions
    if (snapshot.predictions) {
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
    }

    // 2. Evaluate Insights
    if (snapshot.insights) {
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
    }

    return suggestions;
  }
}
