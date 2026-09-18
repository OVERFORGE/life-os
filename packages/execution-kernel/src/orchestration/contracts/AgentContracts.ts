import { ActionProposal, DomainActionType } from "./ActionProposalContracts";
import { EstimateRecord, HypothesisRecord, ObservationRecord } from "./EpistemicTypes";

export type AgentDomain = "productivity" | "health" | "wellness";

export interface AgentTask {
  taskId: string;
  executionId: string;
  domain: AgentDomain;
  instruction: string;
  focusEntities?: string[];
  constraints: string[];
}

export interface SpecialistOutput {
  domain: AgentDomain;
  summary: string;
  observations: ObservationRecord[];
  estimates: EstimateRecord[];
  hypotheses: HypothesisRecord[];
  proposals: ActionProposal[];
  confidence: number; // 0.0 - 1.0
  unresolvedQuestions?: string[];
}

export interface ISpecialistAgent {
  readonly domain: AgentDomain;
  readonly allowedActions: ReadonlyArray<DomainActionType>;
  
  /**
   * Executes domain reasoning over an immutable projected context slice.
   * Returns structured findings and proposed actions. Never mutates database.
   */
  analyze(task: AgentTask, contextProjection: any): Promise<SpecialistOutput>;
}
