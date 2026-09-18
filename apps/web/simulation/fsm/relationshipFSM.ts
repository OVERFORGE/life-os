/**
 * RelationshipFSM — Finite State Machine for Social & Colleague Interactions
 *
 * States: INACTIVE | CONVERSING | WAITING | CONFLICT | RECOVERY
 */

export type RelationshipState =
  | "INACTIVE"
  | "CONVERSING"
  | "WAITING"
  | "CONFLICT"
  | "RECOVERY";

export type RelationshipAction =
  | "INTERACT"
  | "AWAIT_REPLY"
  | "DISAGREE"
  | "RESOLVE"
  | "END";

const TRANSITIONS: Record<RelationshipState, Partial<Record<RelationshipAction, RelationshipState>>> = {
  INACTIVE: {
    INTERACT: "CONVERSING",
  },
  CONVERSING: {
    AWAIT_REPLY: "WAITING",
    DISAGREE: "CONFLICT",
    END: "INACTIVE",
  },
  WAITING: {
    INTERACT: "CONVERSING",
    END: "INACTIVE",
  },
  CONFLICT: {
    RESOLVE: "RECOVERY",
  },
  RECOVERY: {
    END: "INACTIVE",
  },
};

export class RelationshipFSM {
  public static transition(currentState: RelationshipState, action: RelationshipAction): RelationshipState {
    const valid = TRANSITIONS[currentState]?.[action];
    return valid ?? currentState;
  }
}
