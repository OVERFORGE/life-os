import { AgentDomain } from "../contracts/AgentContracts";
import { SemanticTurn } from "../contracts/SemanticTurnContracts";
import { hasStructuralDataDependencies } from "./StructuralDependencyAnalyzer";

export type RoutingStrategy =
  | "FAST_PATH"
  | "CONVERSATIONAL_LLM"
  | "SINGLE_SPECIALIST"
  | "MULTI_AGENT"
  | "DYNAMIC_WORKFLOW";

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
 * Classifies user intent and routes to Fast-Path, Conversational LLM, Single-Specialist, Multi-Agent ReAct,
 * or Dynamic Workflow.
 * Invariant: Guided strictly by canonical SemanticTurn contracts and structural data dependencies;
 * zero regex intent guessing.
 */
export class DynamicRouter {
  constructor(_legacyFastPath?: any) {}

  route(message: string, semanticTurn?: SemanticTurn): RoutingDecision {
    // 1. If structured SemanticTurn is provided, route deterministically from contracts
    if (semanticTurn) {
      if (
        semanticTurn.primaryClassification === "CANCEL_OR_DISMISS" ||
        semanticTurn.primaryClassification === "CASUAL_DIALOGUE" ||
        semanticTurn.primaryClassification === "STATE_OBSERVATION"
      ) {
        return {
          strategy: "CONVERSATIONAL_LLM",
          confidence: 1.0,
          rationale: `Semantic classification '${semanticTurn.primaryClassification}' routed to Chief of Staff`,
        };
      }

      // Check structural data dependencies for dynamic multi-step workflows
      if (
        semanticTurn.operations.length > 1 &&
        hasStructuralDataDependencies(semanticTurn.operations)
      ) {
        return {
          strategy: "DYNAMIC_WORKFLOW",
          confidence: 1.0,
          rationale: "Composite dynamic multi-step workflow detected from structural dependencies",
        };
      }

      // Action requests with operations
      if (semanticTurn.primaryClassification === "ACTION_REQUEST" && semanticTurn.operations.length > 0) {
        const domains = Array.from(
          new Set(semanticTurn.operations.map((o) => o.domain).filter(Boolean))
        ) as AgentDomain[];

        // Single atomic operation or independent batch
        if (!hasStructuralDataDependencies(semanticTurn.operations)) {
          return {
            strategy: "FAST_PATH",
            targetDomain: domains[0] || "productivity",
            selectedSpecialists: domains,
            confidence: 1.0,
            rationale:
              semanticTurn.operations.length === 1
                ? "Single atomic operation eligible for fast execution"
                : "Independent operation batch eligible for fast execution",
          };
        }

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
            targetDomain: domains[0],
            selectedSpecialists: domains,
            confidence: 0.95,
            rationale: `Single-domain intent from SemanticTurn: ${domains[0]}`,
          };
        }
      }
    }

    // 2. Default: Conversational dialogue processed by Chief of Staff LLM (Zero regex guessing)
    return {
      strategy: "CONVERSATIONAL_LLM",
      confidence: 1.0,
      rationale: "Conversational turn processed by Chief of Staff persona",
    };
  }
}
