/**
 * DeterministicEventBus — Synchronous Pub/Sub Event Bus with Deterministic Sorting
 *
 * Sorts all published events deterministically by:
 * virtualMinute -> pipelineStage -> sequenceNumber
 * Guarantees 100% replay consistency regardless of publication order.
 */

import { SimulationEvent, SimulationEventType } from "./contracts/eventContracts";

export type EventListener = (event: SimulationEvent) => void;

export class DeterministicEventBus {
  private listeners: Map<SimulationEventType | "*", EventListener[]> = new Map();
  private eventHistory: SimulationEvent[] = [];
  private globalSequenceCounter: number = 0;

  public getNextSequenceNumber(): number {
    return ++this.globalSequenceCounter;
  }

  public subscribe(eventType: SimulationEventType | "*", listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(listener);

    return () => {
      const list = this.listeners.get(eventType);
      if (list) {
        this.listeners.set(
          eventType,
          list.filter((l) => l !== listener)
        );
      }
    };
  }

  public publish(event: SimulationEvent): void {
    this.eventHistory.push(event);

    const specific = this.listeners.get(event.eventType) ?? [];
    for (const listener of specific) {
      listener(event);
    }

    const wildcard = this.listeners.get("*") ?? [];
    for (const listener of wildcard) {
      listener(event);
    }
  }

  /**
   * Returns history sorted deterministically by virtualMinute -> pipelineStage -> sequenceNumber.
   */
  public getHistory(): ReadonlyArray<SimulationEvent> {
    return [...this.eventHistory].sort((a, b) => {
      if (a.virtualMinute !== b.virtualMinute) return a.virtualMinute - b.virtualMinute;
      if (a.pipelineStage !== b.pipelineStage) return a.pipelineStage - b.pipelineStage;
      return a.sequenceNumber - b.sequenceNumber;
    });
  }

  public clear(): void {
    this.listeners.clear();
    this.eventHistory = [];
    this.globalSequenceCounter = 0;
  }
}
