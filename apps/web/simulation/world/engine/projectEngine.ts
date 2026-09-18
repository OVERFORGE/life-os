/**
 * ProjectEngine — Stage 7: Project Progress and Milestone Engine
 */

import {
  SimulationEngine,
  PipelineStage,
  EngineResult,
  SimulationContext,
  computeAccurateStateChanges,
} from "../contracts/simulationEngineContract";
import { SimulatedWorldState } from "../contracts/worldStateContracts";
import { TaskProgressEngine } from "./taskProgressEngine";
import { createSimulationEvent, SimulationEvent } from "../../events/contracts/eventContracts";

export interface ProjectEngineUpdates {
  activeTaskProgress: number;
}

export class ProjectEngine implements SimulationEngine<ProjectEngineUpdates> {
  public readonly name = "ProjectEngine";
  public readonly version = "1.0.0";
  public readonly stage = PipelineStage.PROJECT_ENGINE;
  public readonly dependencies = ["SessionEngine"];

  public execute(
    state: Readonly<SimulatedWorldState>,
    context: Readonly<SimulationContext>
  ): EngineResult<ProjectEngineUpdates> {
    const startTime = Date.now();
    const events: SimulationEvent[] = [];

    const defId = state.activeSession?.definitionId ?? "ROUTINE";
    const def = context.activityRegistry.getDefinition(defId);

    const progressIncrement = TaskProgressEngine.calculateMinuteIncrement({
      focus: state.biometrics.focus,
      energy: state.biometrics.energy,
      activityType: def.isWorkActivity ? "DEEP_WORK" : "BREAK",
      executionStreakMins: state.executionStreakMins,
    });

    const newProgress = Math.min(100, Math.round((state.activeTaskProgress + progressIncrement) * 10) / 10);

    if (newProgress >= 100 && state.activeTaskProgress < 100) {
      events.push(
        createSimulationEvent({
          eventType: "TASK_COMPLETED",
          runUid: context.runUid,
          sequenceNumber: context.eventBus.getNextSequenceNumber(),
          eventIndex: 1,
          pipelineStage: this.stage,
          subsystem: "PROJECT",
          virtualDay: context.virtualDay,
          virtualMinute: context.virtualMinute,
          virtualTimestamp: `${context.virtualDay} • ${context.virtualMinute}`,
          title: `Task Progress 100%`,
          description: `Task achieved 100% progress completion goal.`,
          payload: { taskProgress: newProgress },
        })
      );
    }

    const updates: ProjectEngineUpdates = { activeTaskProgress: newProgress };
    const changedPaths = computeAccurateStateChanges(
      state as unknown as Record<string, unknown>,
      updates as unknown as Record<string, unknown>
    );

    return {
      engineName: this.name,
      stage: this.stage,
      stateUpdates: updates,
      events,
      diagnostics: {
        engineName: this.name,
        engineVersion: this.version,
        stage: this.stage,
        executionTimeMs: Date.now() - startTime,
        stateChangesCount: changedPaths.length,
        changedStatePaths: changedPaths,
        eventsCount: events.length,
        warnings: [],
        inputSummary: `activeTaskProgress=${state.activeTaskProgress}`,
        outputSummary: `newProgress=${newProgress}`,
      },
    };
  }
}
