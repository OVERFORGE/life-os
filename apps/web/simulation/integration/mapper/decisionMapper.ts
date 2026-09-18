import { DecisionDTO } from "../../decision";
import { VirtualUserRequestBuilder } from "../builder/virtualUserRequestBuilder";

export interface MappedDecisionPayload {
  requestText: string;
  intent: string;
  target: string;
  decisionId: string;
  confidence: number;
}

export function mapDecisionToPayload(decision: DecisionDTO): MappedDecisionPayload {
  const requestText = VirtualUserRequestBuilder.build(decision);
  return {
    requestText,
    intent: decision.intent,
    target: decision.target ?? "self",
    decisionId: decision.decisionId,
    confidence: decision.confidence,
  };
}
