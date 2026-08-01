import { generateId } from "../../shared/ids";

/**
 * Fact Model
 * 
 * ARCHITECTURAL NOTE:
 * Facts currently represent time-stamped atomic assertions of truth (Subject, Predicate, Object).
 * Future cognitive phases may evolve Facts toward richer semantic graph structures (e.g. entity-to-entity relations).
 */
export interface Fact<TValue = any> {
  id: string;
  entityId: string;
  predicate: string;
  value: TValue;
  timestamp: number;
}

export function createFact<TValue = any>(
  entityId: string,
  predicate: string,
  value: TValue
): Fact<TValue> {
  return {
    id: generateId("fact"),
    entityId,
    predicate,
    value,
    timestamp: Date.now(),
  };
}
