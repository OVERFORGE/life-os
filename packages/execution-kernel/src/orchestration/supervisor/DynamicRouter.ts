import { AgentDomain } from "../contracts/AgentContracts";
import { FastPathExecutor } from "./FastPathExecutor";

export type RoutingStrategy = "FAST_PATH" | "SINGLE_SPECIALIST" | "MULTI_AGENT";

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
 * Classifies user intent and routes to Fast-Path, Single-Specialist, or Multi-Agent ReAct.
 * Invariant: Simple requests never incur multi-agent overhead.
 */
export class DynamicRouter {
  constructor(private fastPath: FastPathExecutor) {}

  route(message: string): RoutingDecision {
    // 1. Check Fast Path
    if (this.fastPath.canHandle(message)) {
      return {
        strategy: "FAST_PATH",
        confidence: 0.95,
        rationale: "Deterministic high-velocity intent matching Fast Path criteria",
      };
    }

    // 2. Classify domain signals using word boundaries to prevent subword false positives
    const lower = message.toLowerCase();
    const hasProductivity = /\b(task|project|deadline|work|backlog|schedule|todo|priority|goal)s?\b/i.test(lower);
    const hasHealth = /\b(health|fitness|workout|training|train|trained|gym|run|running|jog|jogging|diet|meal|nutrition|weight|calories|hydration|water|sleep|sleeping|swim|swimming|walk|walking|cycling)s?\b/i.test(lower);
    const hasWellness = /\b(exhausted|burnout|stress|tired|recovery|overwhelmed|rest|mood|energy|mental)\b/i.test(lower);

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

    // Default to productivity specialist
    return {
      strategy: "SINGLE_SPECIALIST",
      targetDomain: "productivity",
      selectedSpecialists: ["productivity"],
      confidence: 0.8,
      rationale: "Productivity & task execution intent",
    };
  }
}
