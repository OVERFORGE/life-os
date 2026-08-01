import { Plan } from "./Plan";
import { ExtractedAction } from "../dispatch/actionExtractor";

/**
 * PlanMapper
 * 
 * Utility responsible for mapping executor-agnostic `Plan` objects
 * into concrete legacy executor payloads (`ExtractedAction[]`).
 */
export class PlanMapper {
  static toLegacyActions(plan: Plan): ExtractedAction[] {
    return plan.actions.map((intended) => ({
      type: (intended.domain === "general"
        ? intended.action
        : `${intended.domain}_${intended.action}`) as ExtractedAction["type"],
      payload: intended.parameters,
    }));
  }
}
