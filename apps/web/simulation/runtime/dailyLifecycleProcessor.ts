/**
 * DailyLifecycleProcessor — Coordinator Strategy Interface & Default Implementation
 *
 * Coordinates end-of-day metric aggregation, DailySummary generation, and DailyTransitionEvent emissions.
 * Extensible modular coordinator ready for future LifecycleEngine plugins (sleep, habits, memory).
 */

import { ReplayTickStep } from "../execution/contracts/replayTranscriptContracts";
import { SimulatedWorldState } from "../world/contracts/worldStateContracts";
import {
  DailySummary,
  DailyLifecycleResult,
  DailyTransitionEvent,
  DailyTransitionEventType,
} from "./contracts/dailyLifecycleContracts";

export interface DailyLifecycleContext {
  previousDay: number;
  newDay: number;
  previousDayTicks: readonly ReplayTickStep[];
  currentState: Readonly<SimulatedWorldState>;
}

export interface IDailyLifecycleProcessor {
  processDayTransition(context: DailyLifecycleContext): DailyLifecycleResult;
}

export class DefaultDailyLifecycleProcessor implements IDailyLifecycleProcessor {
  public processDayTransition(context: DailyLifecycleContext): DailyLifecycleResult {
    const ticks = context.previousDayTicks;

    let completedActivities = 0;
    let completedTasks = 0;

    for (const tick of ticks) {
      for (const evt of tick.events) {
        if (evt.eventType === "ACTIVITY_ENDED") {
          completedActivities += 1;
        } else if (evt.eventType === "TASK_COMPLETED") {
          completedTasks += 1;
        }
      }
    }

    // Ending biometric snapshots from end of day state
    const bio = context.currentState.biometrics;
    const endingEnergy = Math.round(bio.energy * 10) / 10;
    const endingStress = Math.round(bio.stress * 10) / 10;
    const endingFatigue = Math.round(bio.fatigue * 10) / 10;

    const focusMinutes = context.currentState.totalFocusMinutes;
    const unfinishedTasks = context.currentState.activeTaskProgress < 100 ? 1 : 0;

    const dailySummary: DailySummary = {
      day: context.previousDay,
      focusMinutes,
      completedActivities,
      endingEnergy,
      endingStress,
      endingFatigue,
      sleepMinutes: 0,
      completedTasks,
      unfinishedTasks,
    };

    const transitionEvents: DailyTransitionEvent[] = [
      {
        type: DailyTransitionEventType.DAY_COMPLETED,
        payload: {
          previousDay: context.previousDay,
          newDay: context.newDay,
          focusMinutes,
          completedActivities,
        },
      },
    ];

    return {
      previousDay: context.previousDay,
      newDay: context.newDay,
      dailySummary,
      transitionEvents,
    };
  }
}
