import { Observation } from "./Observation";
import { TelemetryQuality } from "./TelemetryQuality";
import { LifeStateInput } from "../worldv2/LifeStateEngine";
import { ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";

export interface GoalPressureInput {
  userId: string;
  graphSnapshot?: ExecutionGraphSnapshot | null;
  goalObservations: Observation[];
  taskObservations: Observation[];
  telemetryQuality: TelemetryQuality;
}

export interface LearningInput {
  userId: string;
  observations: Observation[];
  telemetryQuality: TelemetryQuality;
}

export interface PredictionInput {
  userId: string;
  phaseObservations: Observation[];
  stressObservations: Observation[];
  telemetryQuality: TelemetryQuality;
}

export interface WorldInput {
  userId: string;
  graphSnapshot?: ExecutionGraphSnapshot | null;
  observations: Observation[];
  telemetryQuality: TelemetryQuality;
}

export interface AssembledEngineInputs {
  lifeStateInput: LifeStateInput;
  goalPressureInput: GoalPressureInput;
  learningInput: LearningInput;
  predictionInput: PredictionInput;
  worldInput: WorldInput;
  telemetryQuality: TelemetryQuality;
}

/**
 * InputAssembler Transformer
 * 
 * Assembles generic normalized Observation[] arrays into specialized, strongly typed
 * subsystem engine input contracts. ZERO calculation, ZERO heuristics, 100% deterministic mapping.
 */
export class InputAssembler {
  static assemble(
    userId: string,
    observations: Observation[],
    telemetryQuality: TelemetryQuality,
    graphSnapshot?: ExecutionGraphSnapshot | null
  ): AssembledEngineInputs {

    // Filter observation subsets
    const goalObs = observations.filter((o) => o.type === "GoalTargetApproach");
    const taskObs = observations.filter((o) => o.type === "TaskExecutionVelocity" || o.type === "CadenceDrift");
    const phaseObs = observations.filter((o) => o.type === "PhaseTransition");
    const stressObs = observations.filter((o) => o.type === "HighPhysiologicalStress");

    // 1. LifeStateInput
    const lifeStateInput: LifeStateInput = {
      graphSnapshot,
      stabilityScore: Math.round(telemetryQuality.overallConfidence * 100),
      learningSignals: [],
    };

    // 2. GoalPressureInput
    const goalPressureInput: GoalPressureInput = {
      userId,
      graphSnapshot,
      goalObservations: goalObs,
      taskObservations: taskObs,
      telemetryQuality,
    };

    // 3. LearningInput
    const learningInput: LearningInput = {
      userId,
      observations,
      telemetryQuality,
    };

    // 4. PredictionInput
    const predictionInput: PredictionInput = {
      userId,
      phaseObservations: phaseObs,
      stressObservations: stressObs,
      telemetryQuality,
    };

    // 5. WorldInput
    const worldInput: WorldInput = {
      userId,
      graphSnapshot,
      observations,
      telemetryQuality,
    };

    return Object.freeze({
      lifeStateInput,
      goalPressureInput,
      learningInput,
      predictionInput,
      worldInput,
      telemetryQuality,
    });
  }
}
