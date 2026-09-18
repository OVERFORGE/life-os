import { OrchestrationEvent, OrchestrationEventType, createOrchestrationEvent } from "../events/OrchestrationEvents";
import { OrchestrationEventBus } from "../events/OrchestrationEventBus";
import { ActionProposal, KernelActionDecision, KernelExecutionResult } from "../contracts/ActionProposalContracts";
import { ObservationRecord, EstimateRecord, HypothesisRecord } from "../contracts/EpistemicTypes";

export interface MaterializedProjection {
  observations: ObservationRecord[];
  estimates: EstimateRecord[];
  hypotheses: HypothesisRecord[];
  proposals: ActionProposal[];
  decisions: KernelActionDecision[];
  kernelResults: KernelExecutionResult[];
}

/**
 * ExecutionEventLedger
 * 
 * Append-Only Event Store scoped to a specific executionId.
 * Specialists append findings concurrently without write collisions.
 * Sequence numbers are strictly monotonic per execution (seq: 1..N).
 * Dispatches appended events to OrchestrationEventBus for live observers.
 */
export class ExecutionEventLedger {
  private events: OrchestrationEvent[] = [];
  private currentSeq: number = 0;
  private eventBus: OrchestrationEventBus;

  constructor(public readonly executionId: string, initialEvents: OrchestrationEvent[] = []) {
    this.eventBus = OrchestrationEventBus.getInstance();
    if (initialEvents.length > 0) {
      this.events = [...initialEvents].sort((a, b) => a.seq - b.seq);
      this.currentSeq = this.events[this.events.length - 1].seq;
    }
  }

  /**
   * Thread-safe atomic append for concurrent specialist reasoning.
   */
  append<T = any>(
    type: OrchestrationEventType,
    source: OrchestrationEvent["source"],
    payload: T,
    causalityRef?: string
  ): OrchestrationEvent<T> {
    this.currentSeq += 1;
    const event = createOrchestrationEvent({
      executionId: this.executionId,
      seq: this.currentSeq,
      type,
      source,
      payload,
      causalityRef,
    });

    this.events.push(event);
    this.eventBus.publish(event);
    return event;
  }

  getEvents(): ReadonlyArray<OrchestrationEvent> {
    return [...this.events];
  }

  getEventCount(): number {
    return this.events.length;
  }

  getLastSequence(): number {
    return this.currentSeq;
  }

  /**
   * Deterministic Fold Operator
   * Invariant 28: Replay means replaying recorded operational events to project state.
   */
  project(): MaterializedProjection {
    const projection: MaterializedProjection = {
      observations: [],
      estimates: [],
      hypotheses: [],
      proposals: [],
      decisions: [],
      kernelResults: [],
    };

    for (const event of this.events) {
      switch (event.type) {
        case "AgentObservationProduced":
          projection.observations.push(event.payload);
          break;
        case "AgentFindingProduced":
          if (event.payload.estimates) projection.estimates.push(...event.payload.estimates);
          if (event.payload.hypotheses) projection.hypotheses.push(...event.payload.hypotheses);
          break;
        case "ProposalCreated":
          projection.proposals.push(event.payload);
          break;
        case "ProposalRejected":
          projection.proposals = projection.proposals.filter((p) => p.id !== event.payload.proposalId);
          break;
        case "SupervisorDecisionMade":
          projection.decisions.push(event.payload);
          break;
        case "KernelActionExecuted":
        case "KernelActionCompensated":
          projection.kernelResults.push(event.payload);
          break;
      }
    }

    return projection;
  }
}
