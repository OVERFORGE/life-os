import { OrchestrationEvent } from "./OrchestrationEvents";

export type OrchestrationEventHandler<T = any> = (event: OrchestrationEvent<T>) => void | Promise<void>;

/**
 * OrchestrationEventBus
 * 
 * Ephemeral In-Memory Event Dispatcher.
 * Dispatches live events during request execution.
 * Does NOT guarantee durability across process crashes (handled separately by ExecutionEventLedger).
 */
export class OrchestrationEventBus {
  private static instance: OrchestrationEventBus;
  private listeners: Map<string, Set<OrchestrationEventHandler>> = new Map();

  static getInstance(): OrchestrationEventBus {
    if (!OrchestrationEventBus.instance) {
      OrchestrationEventBus.instance = new OrchestrationEventBus();
    }
    return OrchestrationEventBus.instance;
  }

  subscribe<T = any>(eventType: string, handler: OrchestrationEventHandler<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler as OrchestrationEventHandler);

    return () => {
      this.listeners.get(eventType)?.delete(handler as OrchestrationEventHandler);
    };
  }

  publish<T = any>(event: OrchestrationEvent<T>): void {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (err) {
          console.error(`[OrchestrationEventBus] Handler failed for event ${event.type}:`, err);
        }
      });
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
