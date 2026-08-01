import { KernelEvent } from "./Event";

export type EventHandler<T = any> = (event: KernelEvent<T>) => void | Promise<void>;

export class EventBus {
  private static instance: EventBus;
  private subscribers: Map<string, Set<EventHandler>> = new Map();

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  subscribe<T = any>(eventType: string, handler: EventHandler<T>): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(handler as EventHandler);

    return () => this.unsubscribe(eventType, handler);
  }

  unsubscribe<T = any>(eventType: string, handler: EventHandler<T>): void {
    const handlers = this.subscribers.get(eventType);
    if (handlers) {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) {
        this.subscribers.delete(eventType);
      }
    }
  }

  publish<T = any>(event: KernelEvent<T>): void {
    const handlers = this.subscribers.get(event.type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (err) {
          console.error(`[EventBus] Error handling event ${event.type}:`, err);
        }
      });
    }
  }
}
