/**
 * RoutineEngine — Stage 2: Circadian Routine Phase Evaluation
 */

import {
  SimulationEngine,
  PipelineStage,
  EngineResult,
  SimulationContext,
} from "../contracts/simulationEngineContract";
import { SimulatedWorldState } from "../contracts/worldStateContracts";
import { RoutineFSM } from "../../fsm/routineFSM";
import { createSimulationEvent, SimulationEvent } from "../../events/contracts/eventContracts";

export class RoutineEngine implements SimulationEngine<{ currentRoutinePhase: string }> {
  public readonly name = "RoutineEngine";
  public readonly version = "1.0.0";
  public readonly stage = PipelineStage.ROUTINE_EVALUATION;
  public readonly dependencies = [];

  public execute(
    state: Readonly<SimulatedWorldState>,
    context: Readonly<SimulationContext>
  ): EngineResult<{ currentRoutinePhase: string }> {
    const startTime = Date.now();
    const routinePhase = RoutineFSM.getRoutineStateForMinute(context.virtualMinute);
    const events: SimulationEvent[] = [];

    if (routinePhase !== state.currentRoutinePhase) {
      events.push(
        createSimulationEvent({
          eventType: "ROUTINE_CHANGED",
          runUid: context.runUid,
          sequenceNumber: context.eventBus.getNextSequenceNumber(),
          eventIndex: 1,
          pipelineStage: this.stage,
          subsystem: "ROUTINE",
          virtualDay: context.virtualDay,
          virtualMinute: context.virtualMinute,
          virtualTimestamp: `${context.virtualDay} • ${context.virtualMinute}`,
          title: `Routine Phase Shift: ${routinePhase}`,
          description: `Transitioned from ${state.currentRoutinePhase} to ${routinePhase}.`,
          payload: { previousPhase: state.currentRoutinePhase, newPhase: routinePhase },
        })
      );
    }

    const changed = routinePhase !== state.currentRoutinePhase;

    return {
      engineName: this.name,
      stage: this.stage,
      stateUpdates: { currentRoutinePhase: routinePhase },
      events,
      diagnostics: {
        engineName: this.name,
        engineVersion: this.version,
        stage: this.stage,
        executionTimeMs: Date.now() - startTime,
        stateChangesCount: changed ? 1 : 0,
        changedStatePaths: changed ? ["currentRoutinePhase"] : [],
        eventsCount: events.length,
        warnings: [],
        inputSummary: `virtualMinute=${context.virtualMinute}, currentPhase=${state.currentRoutinePhase}`,
        outputSummary: `newRoutinePhase=${routinePhase}`,
      },
    };
  }
}
