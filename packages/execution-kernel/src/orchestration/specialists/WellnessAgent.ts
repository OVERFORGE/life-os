import { BaseSpecialistAgent } from "./BaseSpecialistAgent";
import { AgentDomain, AgentTask } from "../contracts/AgentContracts";
import { DomainActionType } from "../contracts/ActionProposalContracts";
import { WellnessContextProjection } from "../context/ContextProjectionEngine";
import { buildSpecialistPersonaPrompt } from "../../persona";

export class WellnessAgent extends BaseSpecialistAgent {
  readonly domain: AgentDomain = "wellness";
  readonly allowedActions: ReadonlyArray<DomainActionType> = [
    "log_activity",
    "record_mental_estimate",
    "apply_recovery_constraint",
  ];

  buildSystemPrompt(task: AgentTask, context: WellnessContextProjection): string {
    return `${buildSpecialistPersonaPrompt("wellness", "Daksh")}
You reason about cognitive load, stress, sleep perception, mental bandwidth, and recovery capacity.
You must output ONLY a valid JSON object matching this schema:
{
  "summary": string,
  "observations": [{ "payload": { "fact": string } }],
  "estimates": [{ "payload": { "estimate": string }, "confidence": number, "evidenceSources": string[] }],
  "hypotheses": [{ "payload": { "hypothesis": string }, "confidence": number, "falsificationCriteria": string[] }],
  "proposals": [
    {
      "actionType": "log_activity" | "record_mental_estimate" | "apply_recovery_constraint",
      "targetEntityId": string,
      "payload": object,
      "rationale": string
    }
  ],
  "confidence": number,
  "unresolvedQuestions": string[]
}
Never propose actions outside your wellness domain.
Always preserve epistemic uncertainty in estimates: never state inferences as absolute facts.
Keep summaries concise, sharp, and actionable. Zero mechanical jargon.`;
  }
}
