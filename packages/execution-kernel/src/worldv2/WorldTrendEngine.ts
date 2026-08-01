import { UserBehavioralProfile } from "../learning/BehaviorProfile";
import { ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";

export type MetricTrend = "Improving" | "Stable" | "Declining";

export interface WorldTrend {
  metricName: string;
  trend: MetricTrend;
  changeDescription: string;
  confidence: number;
}

/**
 * WorldTrendEngine Subsystem
 * 
 * SOLE OWNER of detecting time-series trends across execution metrics.
 */
export class WorldTrendEngine {
  private static instance: WorldTrendEngine;

  static getInstance(): WorldTrendEngine {
    if (!WorldTrendEngine.instance) {
      WorldTrendEngine.instance = new WorldTrendEngine();
    }
    return WorldTrendEngine.instance;
  }

  detectTrends(params: {
    profile?: UserBehavioralProfile | null;
    graphSnapshot?: ExecutionGraphSnapshot | null;
  }): WorldTrend[] {
    const { profile, graphSnapshot } = params;
    const trends: WorldTrend[] = [];

    if (profile) {
      const rate = profile.taskCompletionRate;
      trends.push({
        metricName: "Task Completion Throughput",
        trend: rate >= 0.75 ? "Improving" : rate < 0.5 ? "Declining" : "Stable",
        changeDescription: `Task completion rate is currently at ${Math.round(rate * 100)}%.`,
        confidence: 0.88,
      });

      trends.push({
        metricName: "Execution Consistency",
        trend: profile.executionConsistency >= 0.8 ? "Improving" : "Stable",
        changeDescription: `Schedule consistency score is ${Math.round(profile.executionConsistency * 100)}%.`,
        confidence: 0.85,
      });
    }

    if (graphSnapshot) {
      const blockedRatio = graphSnapshot.nodeCount > 0 ? graphSnapshot.blockedNodes.length / graphSnapshot.nodeCount : 0;
      trends.push({
        metricName: "Dependency Blockage Rate",
        trend: blockedRatio > 0.3 ? "Declining" : "Improving",
        changeDescription: `${Math.round(blockedRatio * 100)}% of total execution nodes are blocked.`,
        confidence: 0.90,
      });
    }

    return trends;
  }
}
