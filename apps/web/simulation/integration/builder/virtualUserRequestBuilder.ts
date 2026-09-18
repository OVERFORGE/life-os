import { DecisionDTO } from "../../decision";

export class VirtualUserRequestBuilder {
  /**
   * Converts a DecisionDTO intent into an authentic, natural human user request string.
   * Internal engine reasoning metadata is strictly excluded to maintain user-like messages.
   */
  public static build(decision: DecisionDTO): string {
    const targetStr = decision.target && decision.target !== "self" ? ` ${decision.target}` : "";
    const paramsKeys = Object.keys(decision.parameters);
    const paramsStr = paramsKeys.length > 0
      ? ` for ${paramsKeys.map((k) => `${k}: ${decision.parameters[k]}`).join(", ")}`
      : "";

    switch (decision.intent) {
      case "WORK_ON_TASK":
        return `I want to work on${targetStr || " my current task"}${paramsStr}.`;
      case "REST_AND_RECOVER":
        return `I need to take a rest and recovery break.`;
      case "COMMUNICATE":
        return `I need to send a message regarding${targetStr || " current progress"}${paramsStr}.`;
      case "ADJUST_PLAN":
        return `I would like to adjust my schedule plan${paramsStr}.`;
      case "TAKE_BREAK":
        return `Taking a short break.`;
      case "EXERCISE":
        return `I am starting an exercise session${paramsStr}.`;
      case "IDLE":
      default:
        return `Currently idle.`;
    }
  }
}
