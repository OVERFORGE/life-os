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
 *
 * Phase D Calibration (D-8 & D-9):
 *
 * D-8: Confidence values are now evidence-derived (from profile data) rather than
 *      hard-coded constants (0.88, 0.85, 0.90).
 *      - Task Completion confidence = min(0.95, 0.50 + 0.40 × executionConsistency)
 *      - Execution Consistency confidence = min(0.90, 0.45 + 0.40 × taskCompletionRate)
 *      - Dependency Blockage confidence = min(0.95, 0.70 + 0.25 × (1 - blockedRatio))
 *
 * D-9: Threshold bands are widened to reduce trend oscillation at boundaries.
 *      - Task Completion: "Improving" >= 0.80 (was 0.75), "Declining" < 0.45 (was 0.50)
 *        Stable band: [0.45, 0.80) — was [0.50, 0.75)
 *      - Execution Consistency: "Improving" >= 0.80 (was 0.80), "Stable" otherwise
 *      - Blockage Rate: "Declining" > 0.35 (was 0.30), "Improving" < 0.15 (new), "Stable" in between
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
      const consistency = profile.executionConsistency;

      // D-9: Wider stable band [0.45, 0.80) for task completion throughput
      const completionTrend: MetricTrend =
        rate >= 0.80 ? "Improving" : rate < 0.45 ? "Declining" : "Stable";

      // D-8: Evidence-derived confidence from executionConsistency
      const completionConfidence = Number(Math.min(0.95, 0.50 + 0.40 * consistency).toFixed(2));

      trends.push({
        metricName: "Task Completion Throughput",
        trend: completionTrend,
        changeDescription: `Task completion rate is currently at ${Math.round(rate * 100)}%.`,
        confidence: completionConfidence,
      });

      // D-9: Threshold unchanged at 0.80, but now explicitly has Stable below it
      const consistencyTrend: MetricTrend =
        consistency >= 0.80 ? "Improving" : consistency < 0.50 ? "Declining" : "Stable";

      // D-8: Evidence-derived confidence from taskCompletionRate
      const consistencyConfidence = Number(Math.min(0.90, 0.45 + 0.40 * rate).toFixed(2));

      trends.push({
        metricName: "Execution Consistency",
        trend: consistencyTrend,
        changeDescription: `Schedule consistency score is ${Math.round(consistency * 100)}%.`,
        confidence: consistencyConfidence,
      });
    }

    if (graphSnapshot) {
      const blockedRatio = graphSnapshot.nodeCount > 0
        ? graphSnapshot.blockedNodes.length / graphSnapshot.nodeCount
        : 0;

      // D-9: Introduced Stable band [0.15, 0.35] for blockage (was binary > 0.30)
      const blockageTrend: MetricTrend =
        blockedRatio > 0.35 ? "Declining" : blockedRatio < 0.15 ? "Improving" : "Stable";

      // D-8: Evidence-derived confidence from inverse of blocked ratio
      const blockageConfidence = Number(Math.min(0.95, 0.70 + 0.25 * (1 - blockedRatio)).toFixed(2));

      trends.push({
        metricName: "Dependency Blockage Rate",
        trend: blockageTrend,
        changeDescription: `${Math.round(blockedRatio * 100)}% of total execution nodes are blocked.`,
        confidence: blockageConfidence,
      });
    }

    return trends;
  }
}
