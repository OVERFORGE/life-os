import { Prediction, createPrediction } from "./Prediction";
import { WorldSnapshot } from "../world/WorldSnapshot";

/**
 * Prediction Engine Subsystem
 * 
 * ARCHITECTURAL DESIGN NOTE:
 * Consumes WorldSnapshot directly to generate near-future predictions.
 * Zero ML, zero neural networks, zero embeddings, zero LLM calls, zero Brain mutations.
 */
export class PredictionEngine {
  static getInstance(): PredictionEngine {
    return new PredictionEngine();
  }

  predict(snapshot: WorldSnapshot): Prediction[] {
    const predictions: Prediction[] = [];

    // 1. Sleep & Recovery Assessment
    const physical = snapshot.userState.physical;
    if (physical.fatigueLevel === "high" || (physical.sleepHours && physical.sleepHours < 5)) {
      predictions.push(
        createPrediction(
          "poor_recovery_likely",
          0.9,
          `Sleep was low (${physical.sleepHours || "<5"}h) or fatigue is high.`
        )
      );
    }

    // 2. Productivity & Task Backlog Assessment
    const productivity = snapshot.userState.productivity;
    if (productivity.overdueTaskCount && productivity.overdueTaskCount >= 5) {
      predictions.push(
        createPrediction(
          "task_backlog_growing",
          0.85,
          `User has ${productivity.overdueTaskCount} overdue tasks accumulating.`
        )
      );
    }

    // 3. Hydration & Health Assessment
    const health = snapshot.userState.health;
    if (health.hydrationMl !== undefined && health.hydrationMl < 1000) {
      predictions.push(
        createPrediction(
          "hydration_deficit",
          0.8,
          `Logged hydration is low (${health.hydrationMl}ml).`
        )
      );
    }

    return predictions;
  }
}
