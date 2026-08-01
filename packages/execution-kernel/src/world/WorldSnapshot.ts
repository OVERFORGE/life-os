import { generateId } from "../shared/ids";
import { UserStateDomains } from "../brain/state/UserState";
import { Entity } from "../brain/knowledge/Entity";
import { MemoryRecord } from "../brain/memory/Memory";
import { Prediction } from "../prediction/Prediction";
import { Insight } from "../insights/Insight";
import { Suggestion } from "../proactive/Suggestion";

/**
 * WorldSnapshot Model
 * 
 * An immutable, point-in-time snapshot representing what the system currently
 * believes about the user's world, enriched with Predictions, Insights, and passive Suggestions.
 */
export interface WorldSnapshot {
  snapshotId: string;
  timestamp: number;
  activeEntities: Entity[];
  userState: UserStateDomains;
  recentMemories: MemoryRecord[];
  predictions: Prediction[];
  insights: Insight[];
  suggestions: Suggestion[];
  activeContext: Record<string, any>;
}

export function createWorldSnapshot(
  activeEntities: Entity[],
  userState: UserStateDomains,
  recentMemories: MemoryRecord[],
  predictions: Prediction[] = [],
  insights: Insight[] = [],
  suggestions: Suggestion[] = [],
  activeContext: Record<string, any> = {}
): WorldSnapshot {
  return {
    snapshotId: generateId("snap"),
    timestamp: Date.now(),
    activeEntities: [...activeEntities],
    userState: { ...userState },
    recentMemories: [...recentMemories],
    predictions: [...predictions],
    insights: [...insights],
    suggestions: [...suggestions],
    activeContext: { ...activeContext },
  };
}
