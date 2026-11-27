import { Inngest } from "inngest";

export interface OutboxDispatchedEventData {
  eventId: string;
  userId: string;
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

export interface MemoryTurnCommittedEventData {
  jobId: string;
  userId: string;
  conversationId?: string;
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
  "lifeos/memory.turn_committed": {
    data: MemoryTurnCommittedEventData;
  };
};

export const inngest = new Inngest({
  id: "lifeos",
});
