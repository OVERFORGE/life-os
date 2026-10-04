import { AgentDomain } from "../contracts/AgentContracts";
import { SemanticTurn } from "../contracts/SemanticTurnContracts";
import { FastPathExecutor } from "./FastPathExecutor";

export type RoutingStrategy = "FAST_PATH" | "CONVERSATIONAL_LLM" | "SINGLE_SPECIALIST" | "MULTI_AGENT";

export interface RoutingDecision {
  strategy: RoutingStrategy;
  targetDomain?: AgentDomain;
  selectedSpecialists?: AgentDomain[];
  confidence: number;
  rationale: string;
}

/**
 * DynamicRouter
 * 
 * Classifies user intent and routes to Fast-Path, Conversational LLM, Single-Specialist, or Multi-Agent ReAct.
 * Invariant: Guided primarily by canonical SemanticTurn operations; no regex intent guessing when SemanticTurn is present.
 */
export class DynamicRouter {
  constructor(private fastPath: FastPathExecutor) {}

  route(message: string, semanticTurn?: SemanticTurn): RoutingDecision {
    // 1. Check Fast Path for deterministic mutation commands
    if (this.fastPath.canHandle(message)) {
      return {
        strategy: "FAST_PATH",
        confidence: 0.95,
        rationale: "Deterministic high-velocity intent matching Fast Path criteria",
      };
    }

    // 2. If structured SemanticTurn with operations is provided, route directly
    if (semanticTurn) {
      if (semanticTurn.primaryClassification === "CANCEL_OR_DISMISS") {
        return {
          strategy: "CONVERSATIONAL_LLM",
          confidence: 1.0,
          rationale: "Conversational dialogue, negation, or query routed to Aven persona",
        };
      }

      const domains = Array.from(new Set(semanticTurn.operations.map((o) => o.domain))) as AgentDomain[];
      if (domains.length >= 2) {
        return {
          strategy: "MULTI_AGENT",
          selectedSpecialists: domains,
          confidence: 0.95,
          rationale: `Multi-domain intent from SemanticTurn: [${domains.join(", ")}]`,
        };
      }

      if (domains.length === 1) {
        return {
          strategy: "SINGLE_SPECIALIST",
          targetDomain: domains[0] || "productivity",
          selectedSpecialists: domains,
          confidence: 0.95,
          rationale: `Single-domain intent from SemanticTurn: ${domains[0] || "productivity"}`,
        };
      }
    }

    const lower = message.toLowerCase().trim();

    // 3. Classify domain signals using word boundaries
    const hasProductivity = /\b(task|tasks|project|projects|deadline|deadlines|work|backlog|schedule|todo|todos|priority|priorities|goal|goals)\b/i.test(lower);
    const hasHealth = /\b(health|fitness|workout|workouts|training|train|trained|gym|run|running|jog|jogging|diet|meal|meals|nutrition|weight|calories|hydration|water|sleep|sleeping|swim|swimming|walk|walking|cycling)\b/i.test(lower);
    const hasWellness = /\b(exhausted|burnout|stress|stressed|tired|recovery|overwhelmed|rest|mood|energy|mental)\b/i.test(lower);

    const domains: AgentDomain[] = [];
    if (hasProductivity) domains.push("productivity");
    if (hasHealth) domains.push("health");
    if (hasWellness) domains.push("wellness");

    // Multi-domain intent triggers parallel ReAct orchestration
    if (domains.length >= 2) {
      return {
        strategy: "MULTI_AGENT",
        selectedSpecialists: domains,
        confidence: 0.9,
        rationale: "Multi-domain intent detected; invoking parallel specialist orchestration",
      };
    }

    // Single domain intent triggers single specialist
    if (domains.length === 1) {
      const targetDomain = domains[0];
      return {
        strategy: "SINGLE_SPECIALIST",
        targetDomain,
        selectedSpecialists: [targetDomain],
        confidence: 0.85,
        rationale: `${targetDomain} intent detected`,
      };
    }

    return {
      strategy: "CONVERSATIONAL_LLM",
      confidence: 0.9,
      rationale: "Conversational dialogue processed by Chief of Staff LLM",
    };
  }
}
