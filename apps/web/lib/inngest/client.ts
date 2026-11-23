import { Inngest } from "inngest";

export interface OutboxDispatchedEventData {
  eventId: string;
  category: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  aggregateVersion: number;
  payload: Record<string, any>;
  occurredAt: string;
}

export interface GoalDecomposeEventData {
  goalId: string;
  userId: string;
  expectedEpoch: number;
  correlationId?: string;
}

export interface OutboxSweepEventData {
  batchSize?: number;
}

export type LifeOSEvents = {
  "lifeos/outbox.dispatched": {
    data: OutboxDispatchedEventData;
  };
  "lifeos/goal.decompose": {
    data: GoalDecomposeEventData;
  };
  "lifeos/cron.outbox-sweep": {
    data: OutboxSweepEventData;
  };
};

export const inngest = new Inngest({
  id: "lifeos",
});
