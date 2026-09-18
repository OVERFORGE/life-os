/**
 * EnvironmentEngine — Stage 4: Location, Noise, and Weather Dynamics
 */

import {
  SimulationEngine,
  PipelineStage,
  EngineResult,
  SimulationContext,
  computeAccurateStateChanges,
} from "../contracts/simulationEngineContract";
import { SimulatedWorldState } from "../contracts/worldStateContracts";
import { RoutineFSM } from "../../fsm/routineFSM";

export interface EnvironmentUpdates {
  location: string;
  environment: {
    noiseLevel: "quiet" | "moderate" | "loud";
    weather: "Clear" | "Rainy" | "Cloudy";
  };
}

export class EnvironmentEngine implements SimulationEngine<EnvironmentUpdates> {
  public readonly name = "EnvironmentEngine";
  public readonly version = "1.0.0";
  public readonly stage = PipelineStage.ENVIRONMENT_ENGINE;
  public readonly dependencies = ["RoutineEngine"];

  public execute(
    state: Readonly<SimulatedWorldState>,
    context: Readonly<SimulationContext>
  ): EngineResult<EnvironmentUpdates> {
    const startTime = Date.now();
    const routinePhase = RoutineFSM.getRoutineStateForMinute(context.virtualMinute);

    let location = context.config.environmentDefaults.defaultLocation;
    let noiseLevel: "quiet" | "moderate" | "loud" = context.config.environmentDefaults.defaultNoiseLevel;

    if (routinePhase === "SLEEP" || routinePhase === "MORNING") {
      location = "Bedroom";
      noiseLevel = "quiet";
    } else if (routinePhase === "LUNCH") {
      location = "Dining Room";
      noiseLevel = "moderate";
    } else if (routinePhase === "EXERCISE") {
      location = "Gym";
      noiseLevel = "moderate";
    } else if (routinePhase === "EVENING") {
      location = "Living Room";
      noiseLevel = "quiet";
    }

    const weatherRoll = context.rngManager.environmentRng.next();
    const weather: "Clear" | "Rainy" | "Cloudy" =
      weatherRoll > 0.85 ? "Rainy" : weatherRoll > 0.65 ? "Cloudy" : "Clear";

    const updates: EnvironmentUpdates = {
      location,
      environment: { noiseLevel, weather },
    };

    const changedPaths = computeAccurateStateChanges(
      state as unknown as Record<string, unknown>,
      updates as unknown as Record<string, unknown>
    );

    return {
      engineName: this.name,
      stage: this.stage,
      stateUpdates: updates,
      events: [],
      diagnostics: {
        engineName: this.name,
        engineVersion: this.version,
        stage: this.stage,
        executionTimeMs: Date.now() - startTime,
        stateChangesCount: changedPaths.length,
        changedStatePaths: changedPaths,
        eventsCount: 0,
        warnings: [],
        inputSummary: `routinePhase=${routinePhase}`,
        outputSummary: `location=${location}, weather=${weather}`,
      },
    };
  }
}
