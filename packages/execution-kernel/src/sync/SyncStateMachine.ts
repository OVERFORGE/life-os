export type SyncState =
  | "Idle"
  | "Queueing"
  | "Uploading"
  | "WaitingForAck"
  | "Applying"
  | "Completed"
  | "RetryScheduled";

export type SyncStateListener = (state: SyncState, previousState: SyncState) => void;

/**
 * SyncStateMachine Subsystem
 * 
 * SOLE OWNER of synchronization state transitions.
 * Models sync state deterministically without hidden transitions.
 */
export class SyncStateMachine {
  private static instance: SyncStateMachine;
  private currentState: SyncState = "Idle";
  private listeners: Set<SyncStateListener> = new Set();

  static getInstance(): SyncStateMachine {
    if (!SyncStateMachine.instance) {
      SyncStateMachine.instance = new SyncStateMachine();
    }
    return SyncStateMachine.instance;
  }

  getCurrentState(): SyncState {
    return this.currentState;
  }

  transitionTo(nextState: SyncState): boolean {
    if (this.currentState === nextState) return true;

    if (!this.isValidTransition(this.currentState, nextState)) {
      console.warn(`⚠️ [SYNC_STATE_MACHINE] Invalid state transition: ${this.currentState} -> ${nextState}`);
      return false;
    }

    const prevState = this.currentState;
    this.currentState = nextState;
    console.log(`🔄 [SYNC_STATE_MACHINE] Transition: ${prevState} -> ${nextState}`);

    this.listeners.forEach((listener) => listener(nextState, prevState));
    return true;
  }

  subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private isValidTransition(from: SyncState, to: SyncState): boolean {
    const allowed: Record<SyncState, SyncState[]> = {
      Idle: ["Queueing", "Uploading"],
      Queueing: ["Uploading", "Idle"],
      Uploading: ["WaitingForAck", "RetryScheduled"],
      WaitingForAck: ["Applying", "RetryScheduled"],
      Applying: ["Completed", "RetryScheduled"],
      Completed: ["Idle"],
      RetryScheduled: ["Uploading", "Idle"],
    };

    return (allowed[from] || []).includes(to);
  }
}
