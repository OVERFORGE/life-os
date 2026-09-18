/**
 * TaskFSM — Finite State Machine for Task Lifecycle
 *
 * States: QUEUED | READY | EXECUTING | WAITING | BLOCKED | COMPLETED
 */

export type TaskState =
  | "QUEUED"
  | "READY"
  | "EXECUTING"
  | "WAITING"
  | "BLOCKED"
  | "COMPLETED";

export type TaskAction =
  | "SCHEDULE"
  | "START_EXECUTION"
  | "PAUSE"
  | "BLOCK"
  | "COMPLETE"
  | "UNBLOCK";

const TRANSITIONS: Record<TaskState, Partial<Record<TaskAction, TaskState>>> = {
  QUEUED: {
    SCHEDULE: "READY",
  },
  READY: {
    START_EXECUTION: "EXECUTING",
    BLOCK: "BLOCKED",
  },
  EXECUTING: {
    PAUSE: "WAITING",
    BLOCK: "BLOCKED",
    COMPLETE: "COMPLETED",
  },
  WAITING: {
    START_EXECUTION: "EXECUTING",
  },
  BLOCKED: {
    UNBLOCK: "READY",
  },
  COMPLETED: {},
};

export class TaskFSM {
  public static transition(currentState: TaskState, action: TaskAction): TaskState {
    const valid = TRANSITIONS[currentState]?.[action];
    return valid ?? currentState;
  }
}
