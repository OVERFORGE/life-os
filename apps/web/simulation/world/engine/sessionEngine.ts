/**
 * SessionEngine — Stage 3: Activity Session Lifecycle Management
 */

import {
  SimulationEngine,
  PipelineStage,
  EngineResult,
  SimulationContext,
  computeAccurateStateChanges,
} from "../contracts/simulationEngineContract";
import { SimulatedWorldState } from "../contracts/worldStateContracts";
import { ActivitySession, createActivitySession } from "../contracts/activitySession";
import { createSimulationEvent, SimulationEvent } from "../../events/contracts/eventContracts";
import { ActivityDefinitionId } from "../contracts/activityDefinitionRegistry";

export interface SessionEngineUpdates {
  activeSession: ActivitySession | null;
  completedActivitiesCount: number;
  totalFocusMinutes: number;
  executionStreakMins: number;
}

export class SessionEngine implements SimulationEngine<SessionEngineUpdates> {
  public readonly name = "SessionEngine";
  public readonly version = "1.0.0";
  public readonly stage = PipelineStage.SESSION_ENGINE;
  public readonly dependencies = ["RoutineEngine"];

  public execute(
    state: Readonly<SimulatedWorldState>,
    context: Readonly<SimulationContext>
  ): EngineResult<SessionEngineUpdates> {
    const startTime = Date.now();
    const events: SimulationEvent[] = [];

    let session = state.activeSession;
    let completedCount = state.completedActivitiesCount;
    let focusMins = state.totalFocusMinutes;
    let streakMins = state.executionStreakMins;

    if (!session || session.status === "COMPLETED") {
      let defId: ActivityDefinitionId = "DEEP_WORK";
      if (state.currentRoutinePhase === "LUNCH") defId = "MEAL";
      else if (state.currentRoutinePhase === "SLEEP") defId = "SLEEP";
      else if (state.currentRoutinePhase === "EXERCISE") defId = "EXERCISE";

      session = createActivitySession({
        definitionId: defId,
        currentVirtualMinute: context.virtualMinute,
      });

      events.push(
        createSimulationEvent({
          eventType: "ACTIVITY_STARTED",
          runUid: context.runUid,
          sequenceNumber: context.eventBus.getNextSequenceNumber(),
          eventIndex: 1,
          pipelineStage: this.stage,
          subsystem: "ACTIVITY",
          virtualDay: context.virtualDay,
          virtualMinute: context.virtualMinute,
          virtualTimestamp: `${context.virtualDay} • ${context.virtualMinute}`,
          title: `Started Activity: ${session.title}`,
          description: `Began activity block (${session.definitionId}) for ${session.estimatedDurationMins} mins.`,
          payload: { definitionId: session.definitionId, sessionId: session.id },
        })
      );
    }

    const newElapsed = session.elapsedMinutes + 1;
    const isCompleted = newElapsed >= session.estimatedDurationMins;

    const updatedSession: ActivitySession = {
      ...session,
      elapsedMinutes: newElapsed,
      status: isCompleted ? "COMPLETED" : "ACTIVE",
    };

    const def = context.activityRegistry.getDefinition(updatedSession.definitionId);
    if (def.isWorkActivity) {
      focusMins += 1;
      streakMins += 1;
    } else if (def.isRestActivity) {
      streakMins = 0;
    }

    if (isCompleted) {
      completedCount += 1;
      events.push(
        createSimulationEvent({
          eventType: "ACTIVITY_ENDED",
          runUid: context.runUid,
          sequenceNumber: context.eventBus.getNextSequenceNumber(),
          eventIndex: 2,
          pipelineStage: this.stage,
          subsystem: "ACTIVITY",
          virtualDay: context.virtualDay,
          virtualMinute: context.virtualMinute,
          virtualTimestamp: `${context.virtualDay} • ${context.virtualMinute}`,
          title: `Completed Activity: ${session.title}`,
          description: `Finished session after ${newElapsed} mins.`,
          payload: { definitionId: session.definitionId, sessionId: session.id },
        })
      );
    }

    const updates: SessionEngineUpdates = {
      activeSession: updatedSession,
      completedActivitiesCount: completedCount,
      totalFocusMinutes: focusMins,
      executionStreakMins: streakMins,
    };

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
        inputSummary: `activeSessionId=${session.id}, elapsed=${session.elapsedMinutes}`,
        outputSummary: `status=${updatedSession.status}, newElapsed=${newElapsed}`,
      },
    };
  }
}
