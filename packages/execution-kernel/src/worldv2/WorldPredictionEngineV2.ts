import { LifeStateResult } from "./LifeStateEngine";
import { GoalPressureResult } from "./GoalPressureEngineV2";
import { UserBehavioralProfile } from "../learning/BehaviorProfile";
import { WorldTrend } from "./WorldTrendEngine";

export interface WorldPrediction {
  predictionId: string;
  type: "BurnoutRisk" | "ExecutionStabilization" | "GoalDelay" | "ProjectCompletion" | string;
  title: string;
  predictionText: string;
  confidence: number;
  evidence: string[];
  targetDate?: string;
}

/**
 * WorldPredictionEngineV2 Subsystem
 *
 * SOLE OWNER of generating deterministic, rule-based world predictions.
 * Strictly rule-based — zero LLM calls, zero black-box scoring.
 *
 * Phase D Calibration (D-1):
 * - predictionId is now fully deterministic: derived from prediction type +
 *   evidence key (goalId or lifeState) + generationTimestamp.
 *   Removes dependency on generateId(), which used non-deterministic randomness.
 *   Identical inputs now always produce identical KernelSnapshot pipeline hashes.
 *
 * Phase D Calibration (D-3):
 * - GoalDelay confidence is now evidence-proportional:
 *   confidence = 0.60 + 0.35 × ((pressureScore - 70) / 30)
 *   Smooth, bounded [0.60, 0.95], no hard-coded 0.85.
 *
 * Phase D Calibration (D-4):
 * - Removed (lifeState.state as string) cast — LifeState union already includes "Stagnant".
 */
export class WorldPredictionEngineV2 {
  private static instance: WorldPredictionEngineV2;

  static getInstance(): WorldPredictionEngineV2 {
    if (!WorldPredictionEngineV2.instance) {
      WorldPredictionEngineV2.instance = new WorldPredictionEngineV2();
    }
    return WorldPredictionEngineV2.instance;
  }

  generatePredictions(params: {
    lifeState: LifeStateResult;
    goalPressures: GoalPressureResult[];
    profile?: UserBehavioralProfile | null;
    trends: WorldTrend[];
    generationTimestamp: number;
  }): WorldPrediction[] {
    const { lifeState, goalPressures, generationTimestamp } = params;
    const predictions: WorldPrediction[] = [];

    // Rule 1: High Goal Pressure → GoalDelay prediction
    // D-1: predictionId derived from goalId + timestamp (fully deterministic)
    // D-3: confidence = 0.60 + 0.35 × ((pressureScore - 70) / 30), bounded [0.60, 0.95]
    const highPressureGoal = goalPressures.find((g) => g.pressureScore >= 70);
    if (highPressureGoal) {
      const goalDelayConfidence = Number(Math.min(0.95,
        0.60 + 0.35 * ((highPressureGoal.pressureScore - 70) / 30)
      ).toFixed(2));
      predictions.push({
        predictionId: `prd-goaldelay-${highPressureGoal.goalId}-${generationTimestamp}`,
        type: "GoalDelay",
        title: `Potential Schedule Slip: ${highPressureGoal.goalTitle}`,
        predictionText: `High execution pressure (${highPressureGoal.pressureScore}/100) on "${highPressureGoal.goalTitle}" indicates risk of task completion delays unless dependencies are resolved.`,
        confidence: goalDelayConfidence,
        evidence: highPressureGoal.factors,
      });
    }

    // Rule 2: Burnout / Overload Prediction
    // D-4: Removed unnecessary (lifeState.state as string) type cast
    if (lifeState.state === "Burnout" || lifeState.state === "Stagnant") {
      predictions.push({
        predictionId: `prd-burnoutrisk-${lifeState.state}-${generationTimestamp}`,
        type: "BurnoutRisk",
        title: "Workload Overload Alert",
        predictionText: "Current macro life state indicates elevated burnout risk. Task execution throughput is expected to decline without scheduled recovery periods.",
        confidence: lifeState.confidence,
        evidence: lifeState.evidence,
      });
    }

    // Rule 3: Execution Stabilization Prediction
    if (lifeState.state === "HighMomentum" || lifeState.state === "FocusedExecution") {
      predictions.push({
        predictionId: `prd-stabilization-${lifeState.state}-${generationTimestamp}`,
        type: "ExecutionStabilization",
        title: "Execution Velocity Stabilization",
        predictionText: "Current focused state and strong consistency indicate high probability of on-time milestone delivery.",
        confidence: 0.90,
        evidence: lifeState.evidence,
      });
    }

    return predictions;
  }
}
