import {
  ISpecialistAgent,
  AgentDomain,
  AgentTask,
  SpecialistOutput,
} from "../contracts/AgentContracts";
import { DomainActionType, ActionProposal } from "../contracts/ActionProposalContracts";
import { ObservationRecord, EstimateRecord, HypothesisRecord } from "../contracts/EpistemicTypes";
import { LLMProvider, DefaultLLMProvider } from "../../shared/llmAdapter";
import { generateId } from "../../shared/ids";

export class AllowlistViolationError extends Error {
  constructor(public domain: AgentDomain, public attemptedAction: string) {
    super(`[ALLOWLIST_VIOLATION]: ${domain} specialist is not authorized to propose '${attemptedAction}'`);
    this.name = "AllowlistViolationError";
  }
}

export abstract class BaseSpecialistAgent implements ISpecialistAgent {
  abstract readonly domain: AgentDomain;
  abstract readonly allowedActions: ReadonlyArray<DomainActionType>;

  constructor(protected llmProvider: LLMProvider = DefaultLLMProvider.getInstance()) {}

  /**
   * Enforces that every proposed action belongs strictly to the agent's allowlist.
   * Invariant 13 & TC-13.
   */
  validateProposals(proposals: ActionProposal[]): ActionProposal[] {
    for (const proposal of proposals) {
      if (!this.allowedActions.includes(proposal.actionType)) {
        throw new AllowlistViolationError(this.domain, proposal.actionType);
      }
    }
    return proposals;
  }

  abstract buildSystemPrompt(task: AgentTask, contextProjection: any): string;

  /**
   * Main domain reasoning loop over an immutable projected context slice.
   * Never mutates authoritative state.
   */
  async analyze(task: AgentTask, contextProjection: any): Promise<SpecialistOutput> {
    const systemPrompt = this.buildSystemPrompt(task, contextProjection);
    const userPrompt = `Task: ${task.instruction}\nFocus Entities: ${JSON.stringify(task.focusEntities || [])}\nConstraints: ${JSON.stringify(task.constraints || [])}\nContext: ${JSON.stringify(contextProjection)}`;

    // 1. LLM Generation (Genuine provider errors re-throw for fault isolation)
    const responseText = await this.llmProvider.chat(userPrompt, systemPrompt);

    // 2. Structured Output Parsing & Validation
    try {
      const parsed = JSON.parse(responseText);
      
      const observations: ObservationRecord[] = (parsed.observations || []).map((o: any) => ({
        id: generateId("obs"),
        category: "Observation",
        source: this.domain === "productivity" ? "Productivity" : this.domain === "health" ? "Health" : "Wellness",
        timestamp: Date.now(),
        observedAt: Date.now(),
        payload: o.payload || o,
      }));

      const estimates: EstimateRecord[] = (parsed.estimates || []).map((e: any) => ({
        id: generateId("est"),
        category: "Estimate",
        source: this.domain === "productivity" ? "Productivity" : this.domain === "health" ? "Health" : "Wellness",
        timestamp: Date.now(),
        confidence: typeof e.confidence === "number" ? e.confidence : 0.7,
        evidenceSources: e.evidenceSources || [this.domain],
        payload: e.payload || e,
      }));

      const hypotheses: HypothesisRecord[] = (parsed.hypotheses || []).map((h: any) => ({
        id: generateId("hyp"),
        category: "Hypothesis",
        source: this.domain === "productivity" ? "Productivity" : this.domain === "health" ? "Health" : "Wellness",
        timestamp: Date.now(),
        confidence: typeof h.confidence === "number" ? h.confidence : 0.6,
        falsificationCriteria: h.falsificationCriteria || [],
        payload: h.payload || h,
      }));

      const rawProposals: ActionProposal[] = (parsed.proposals || []).map((p: any) => ({
        id: generateId("act"),
        domain: this.domain,
        actionType: p.actionType,
        targetEntityId: p.targetEntityId,
        payload: p.payload || {},
        rationale: p.rationale || `${this.domain} recommendation`,
        reversibility: p.reversibility || "reversible_with_compensation",
        idempotencyKey: p.idempotencyKey || `${this.domain}_${task.executionId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      }));

      // Strictly validate proposals against allowlist
      const validatedProposals = this.validateProposals(rawProposals);

      return {
        domain: this.domain,
        summary: parsed.summary || `${this.domain} reasoning completed.`,
        observations,
        estimates,
        hypotheses,
        proposals: validatedProposals,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.85,
        unresolvedQuestions: parsed.unresolvedQuestions || [],
      };
    } catch (err: any) {
      if (err instanceof AllowlistViolationError) {
        throw err;
      }
      // Deterministic fallback if LLM response is not valid JSON
      return {
        domain: this.domain,
        summary: `Analysis fallback: Unable to parse LLM structured output.`,
        observations: [],
        estimates: [],
        hypotheses: [],
        proposals: [],
        confidence: 0.1,
        unresolvedQuestions: [`Parsing error: ${err.message}`],
      };
    }
  }
}
