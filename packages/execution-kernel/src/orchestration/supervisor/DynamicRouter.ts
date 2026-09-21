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
    // If structured SemanticTurn is provided, route directly from canonical semantic operations
    if (semanticTurn) {
      if (semanticTurn.primaryClassification === "CANCEL_OR_DISMISS" || semanticTurn.operations.length === 0) {
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

      return {
        strategy: "SINGLE_SPECIALIST",
        targetDomain: domains[0] || "productivity",
        selectedSpecialists: domains,
        confidence: 0.95,
        rationale: `Single-domain intent from SemanticTurn: ${domains[0] || "productivity"}`,
      };
    }

    // 1. Check Fast Path for deterministic mutation commands (legacy fallback: DEPRECATED)
    // Invariant: In V2/V3 architecture, routing is strictly driven by canonical SemanticTurn
    console.warn("[DEPRECATION_WARNING] DynamicRouter.route() called without SemanticTurn. String regex routing is deprecated.");
    if (this.fastPath.canHandle(message)) {
      return {
        strategy: "FAST_PATH",
        confidence: 0.95,
        rationale: "Deterministic high-velocity intent matching Fast Path criteria",
      };
    }

    const lower = message.toLowerCase().trim();

    // 2. Classify domain signals using word boundaries
    const hasProductivity = /\b(task|tasks|project|projects|deadline|deadlines|work|backlog|schedule|todo|todos|priority|priorities|goal|goals)\b/i.test(lower);
    const hasHealth = /\b(health|fitness|workout|workouts|training|train|trained|gym|run|running|jog|jogging|diet|meal|meals|nutrition|weight|calories|hydration|water|sleep|sleeping|swim|swimming|walk|walking|cycling)\b/i.test(lower);
    const hasWellness = /\b(exhausted|burnout|stress|stressed|tired|recovery|overwhelmed|rest|mood|energy|mental)\b/i.test(lower);

    const hasDomainAction = /\b(organize|reschedule|prioritize|plan|execute|optimize|analyze|review|audit|summarize|list|balance)\b/i.test(lower);

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

    // Explicit domain action triggers specialist execution
    if (hasDomainAction) {
      if (hasProductivity) {
        return {
          strategy: "SINGLE_SPECIALIST",
          targetDomain: "productivity",
          selectedSpecialists: ["productivity"],
          confidence: 0.85,
          rationale: "Productivity & task execution intent",
        };
      }
      if (hasHealth) {
        return {
          strategy: "SINGLE_SPECIALIST",
          targetDomain: "health",
          selectedSpecialists: ["health"],
          confidence: 0.85,
          rationale: "Health & physiological training intent",
        };
      }
      if (hasWellness) {
        return {
          strategy: "SINGLE_SPECIALIST",
          targetDomain: "wellness",
          selectedSpecialists: ["wellness"],
          confidence: 0.85,
          rationale: "Wellness & mental state recovery intent",
        };
      }
    }

    // Conversational dialogue, greetings, questions, explanations, and follow-ups
    const isConversational =
      /^(?:what|why|how|who|when|where|which|can\s+you|could\s+you|would\s+you|tell\s+me|explain|help|hello|hi|hey|greetings|howdy|thanks|thank\s+you|cool|ok|okay|wdym|what\s+do\s+you\s+mean)\b/i.test(
        lower
      ) || domains.length === 0;

    if (isConversational) {
      return {
        strategy: "CONVERSATIONAL_LLM",
        confidence: 0.95,
        rationale: "Conversational dialogue and natural language comprehension routed to Chief of Staff LLM",
      };
    }

    if (hasProductivity) {
      return {
        strategy: "SINGLE_SPECIALIST",
        targetDomain: "productivity",
        selectedSpecialists: ["productivity"],
        confidence: 0.85,
        rationale: "Productivity & task execution intent",
      };
    }

    if (hasHealth) {
      return {
        strategy: "SINGLE_SPECIALIST",
        targetDomain: "health",
        selectedSpecialists: ["health"],
        confidence: 0.85,
        rationale: "Health & physiological training intent",
      };
    }

    if (hasWellness) {
      return {
        strategy: "SINGLE_SPECIALIST",
        targetDomain: "wellness",
        selectedSpecialists: ["wellness"],
        confidence: 0.85,
        rationale: "Wellness & mental state recovery intent",
      };
    }

    // Default to Conversational LLM
    return {
      strategy: "CONVERSATIONAL_LLM",
      confidence: 0.9,
      rationale: "Conversational dialogue processed by Chief of Staff LLM",
    };
  }
}
