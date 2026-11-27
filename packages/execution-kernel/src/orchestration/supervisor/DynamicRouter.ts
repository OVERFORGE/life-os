import { AgentDomain } from "../contracts/AgentContracts";
import { SemanticTurn } from "../contracts/SemanticTurnContracts";
import { CapabilityRegistry } from "../capabilities/CapabilityRegistry";
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

      const registry = CapabilityRegistry.getInstance();
      const readOpCount = semanticTurn.operations.filter((op) => {
        const urn = op.capabilityURN || (op.payload?.capabilityURN as string | undefined) || op.actionType;
        return registry.getCapability(urn)?.operationKind === "READ";
      }).length;

      // Stage 2: Investigative queries needing discovery/planning or multi-read workflows
      if (
        (semanticTurn.requiresRetrieval === true &&
          (semanticTurn.operations.length === 0 ||
            semanticTurn.objectiveComplexity === "INVESTIGATIVE" ||
            semanticTurn.objectiveComplexity === "MULTI_STEP")) ||
        (semanticTurn.operations.length > 1 && readOpCount > 0)
      ) {
        return {
          strategy: "DYNAMIC_WORKFLOW",
          confidence: 1.0,
          rationale: "Investigative or multi-source read objective routed to unified dynamic workflow planner",
        };
      }

      // Stage 2: Simple-read optimization (1 validated READ operation -> kernel execution + canonical synthesis)
      if (semanticTurn.operations.length === 1 && readOpCount === 1) {
        const rawDomain = semanticTurn.operations[0].domain;
        const domain: AgentDomain =
          rawDomain === "health" || rawDomain === "wellness" || rawDomain === "productivity"
            ? rawDomain
            : "productivity";
        return {
          strategy: "SINGLE_SPECIALIST",
          targetDomain: domain,
          selectedSpecialists: [domain],
          confidence: 1.0,
          rationale: "Simple read operation routed through kernel execution and canonical synthesis",
        };
      }

      // Grounded advisory / multi-domain information queries (Decision D2)
      if (
        semanticTurn.primaryClassification === "INFORMATION_QUERY" &&
        semanticTurn.operations.length === 0 &&
        Array.isArray(semanticTurn.relevanceDomains) &&
        semanticTurn.relevanceDomains.length > 0
      ) {
        const mapDomain = (raw: string): AgentDomain | null => {
          const norm = String(raw).toLowerCase();
          if (norm === "productivity" || norm === "tasks" || norm === "schedule") return "productivity";
          if (norm === "health") return "health";
          if (norm === "wellness") return "wellness";
          return null;
        };
        const specialistDomains = Array.from(
          new Set(
            semanticTurn.relevanceDomains
              .map((d) => mapDomain(d))
              .filter((d): d is AgentDomain => d !== null)
          )
        );
        if (specialistDomains.length >= 2) {
          return {
            strategy: "MULTI_AGENT",
            selectedSpecialists: specialistDomains,
            confidence: 0.95,
            rationale: `Multi-domain advisory query from SemanticTurn: [${specialistDomains.join(", ")}]`,
          };
        }
        if (specialistDomains.length === 1) {
          return {
            strategy: "SINGLE_SPECIALIST",
            targetDomain: specialistDomains[0],
            selectedSpecialists: specialistDomains,
            confidence: 0.95,
            rationale: `Single-domain advisory query from SemanticTurn: ${specialistDomains[0]}`,
          };
        }
      }

      // Action requests with operations (independent operations execute on FAST_PATH; dependent operations already routed to DYNAMIC_WORKFLOW above)
      if (semanticTurn.primaryClassification === "ACTION_REQUEST" && semanticTurn.operations.length > 0) {
        const domains = Array.from(
          new Set(semanticTurn.operations.map((o) => o.domain).filter(Boolean))
        ) as AgentDomain[];

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
    }

    // 2. Default: Conversational dialogue processed by Chief of Staff LLM (Zero regex guessing)
    return {
      strategy: "CONVERSATIONAL_LLM",
      confidence: 1.0,
      rationale: "Conversational turn processed by Chief of Staff persona",
    };
  }
}
