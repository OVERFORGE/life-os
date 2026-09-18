import { OrchestrationEvent } from "../events/OrchestrationEvents";
import { ExecutionEventLedger, MaterializedProjection } from "../workspace/ExecutionEventLedger";

export interface ReplayResult {
  executionId: string;
  totalEventsReplayed: number;
  projection: MaterializedProjection;
  isDeterministic: boolean;
}

/**
 * DeterministicReplayEngine
 * 
 * Replays historical execution events without calling LLMs or triggering kernel side-effects.
 * Invariant 10: Replay is a pure deterministic fold over the recorded event ledger.
 */
export class DeterministicReplayEngine {
  /**
   * Replays recorded historical events and computes the exact materialized workspace state.
   */
  static replay(executionId: string, events: OrchestrationEvent[]): ReplayResult {
    // 1. Sort events strictly by sequence number to guarantee monotonic order
    const orderedEvents = [...events].sort((a, b) => a.seq - b.seq);

    // 2. Initialize fresh ledger from historical events
    const ledger = new ExecutionEventLedger(executionId, orderedEvents);

    // 3. Pure deterministic fold
    const projection = ledger.project();

    return {
      executionId,
      totalEventsReplayed: orderedEvents.length,
      projection,
      isDeterministic: true,
    };
  }
}
