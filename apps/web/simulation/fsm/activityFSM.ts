/**
 * ActivityFSM — Finite State Machine for Activity Sessions
 *
 * States: IDLE | WORKING | PAUSED | BLOCKED | COMPLETED
 */

export type ActivityState = "IDLE" | "WORKING" | "PAUSED" | "BLOCKED" | "COMPLETED";

export type ActivityAction = "START" | "PAUSE" | "RESUME" | "BLOCK" | "COMPLETE" | "RESET";

export interface ActivityFSMTransition {
  from: ActivityState;
  to: ActivityState;
  action: ActivityAction;
}

const TRANSITIONS: Record<ActivityState, Partial<Record<ActivityAction, ActivityState>>> = {
  IDLE: {
    START: "WORKING",
  },
  WORKING: {
    PAUSE: "PAUSED",
    BLOCK: "BLOCKED",
    COMPLETE: "COMPLETED",
  },
  PAUSED: {
    RESUME: "WORKING",
    RESET: "IDLE",
  },
  BLOCKED: {
    RESUME: "WORKING",
    RESET: "IDLE",
  },
  COMPLETED: {
    RESET: "IDLE",
    START: "WORKING",
  },
};

export class ActivityFSM {
  public static transition(currentState: ActivityState, action: ActivityAction): ActivityState {
    const valid = TRANSITIONS[currentState]?.[action];
    if (!valid) {
      return currentState;
    }
    return valid;
  }
}
