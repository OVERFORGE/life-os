/**
 * DecisionGatingEvaluator — Event-Driven Decision Trigger Evaluator
 *
 * Evaluates published simulation events and world state to determine whether an
 * LLM intervention is required.
 *
 * Gating Triggers:
 * - Activity session completed / Task completed
 * - Critical energy depletion / Sleep pressure surge
 * - High-priority notification or calendar meeting start
 * - Activity session interrupted / Routine phase shift
 * - Null or unassigned active session
 */

import { SimulationEvent } from "../../events/contracts/eventContracts";
import { SimulatedWorldState } from "../contracts/worldStateContracts";

export interface DecisionGatingResult {
  required: boolean;
  triggerEvent?: SimulationEvent;
  reason?: string;
}

export class DecisionGatingEvaluator {
  /**
   * Evaluates emitted events and current world state for decision gating.
   */
  public static evaluate(
    events: SimulationEvent[],
    currentState: SimulatedWorldState
  ): DecisionGatingResult {
    // Trigger 1: Active session is missing or completed
    if (!currentState.activeSession || currentState.activeSession.status === "COMPLETED") {
      return {
        required: true,
        reason: "Active activity session finished or unassigned. Next activity decision required.",
      };
    }

    // Trigger 2: Emitted event matches decision triggers
    for (const evt of events) {
      if (
        evt.eventType === "ACTIVITY_ENDED" ||
        evt.eventType === "TASK_COMPLETED" ||
        evt.eventType === "ENERGY_LOW" ||
        evt.eventType === "SLEEP_NEEDED" ||
        evt.eventType === "NOTIFICATION_RECEIVED" ||
        evt.eventType === "MEETING_STARTED" ||
        evt.eventType === "ROUTINE_CHANGED"
      ) {
        return {
          required: true,
          triggerEvent: evt,
          reason: `Event trigger fired: [${evt.eventType}] ${evt.title}`,
        };
      }
    }

    // Trigger 3: Biometric threshold fallback
    if (currentState.biometrics.energy < 15) {
      return {
        required: true,
        reason: "Critical energy depletion (< 15%). Recovery decision required.",
      };
    }

    return {
      required: false,
    };
  }
}
