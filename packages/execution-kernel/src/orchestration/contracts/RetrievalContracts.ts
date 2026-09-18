/**
 * Hybrid Retrieval Engine Contracts
 * 
 * Invariant 23: Future hybrid vector retrieval can plug in without rewriting agents.
 */

export interface RetrievalQuery {
  userId: string;
  queryText: string;
  entityTypes?: Array<"task" | "goal" | "daily_log" | "nutrition" | "workout" | "memory">;
  timeWindow?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export interface RetrievedDocument {
  id: string;
  source: "task" | "goal" | "daily_log" | "nutrition" | "workout" | "memory";
  title: string;
  content: string;
  date: Date;
  score: number;
  retrieverType: "structured" | "lexical" | "vector";
  metadata?: Record<string, any>;
}

export interface IRetrieverProvider {
  readonly type: "structured" | "lexical" | "vector";
  isAvailable(): Promise<boolean>;
  search(query: RetrievalQuery): Promise<RetrievedDocument[]>;
}

export interface IRetrievalEngine {
  retrieve(query: RetrievalQuery): Promise<RetrievedDocument[]>;
}
