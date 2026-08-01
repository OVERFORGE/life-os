import { LifeStateResult } from "./LifeStateEngine";
import { GoalPressureResult } from "./GoalPressureEngineV2";
import { UserBehavioralProfile } from "../learning/BehaviorProfile";
import { WorldTrend } from "./WorldTrendEngine";
import { generateId } from "../shared/ids";

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
  }): WorldPrediction[] {
    const { lifeState, goalPressures, profile, trends } = params;
    const predictions: WorldPrediction[] = [];

    // Rule 1: High Goal Pressure Prediction
    const highPressureGoal = goalPressures.find((g) => g.pressureScore >= 70);
    if (highPressureGoal) {
      predictions.push({
        predictionId: generateId("prd"),
        type: "GoalDelay",
        title: `Potential Schedule Slip: ${highPressureGoal.goalTitle}`,
        predictionText: `High execution pressure (${highPressureGoal.pressureScore}/100) on "${highPressureGoal.goalTitle}" indicates risk of task completion delays unless dependencies are resolved.`,
        confidence: 0.85,
        evidence: highPressureGoal.factors,
      });
    }

    // Rule 2: Burnout / Overload Prediction
    if (lifeState.state === "BurnoutRisk" || lifeState.state === "Overloaded") {
      predictions.push({
        predictionId: generateId("prd"),
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
        predictionId: generateId("prd"),
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
