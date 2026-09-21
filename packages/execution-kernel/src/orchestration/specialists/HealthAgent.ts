import { BaseSpecialistAgent } from "./BaseSpecialistAgent";
import { AgentDomain, AgentTask } from "../contracts/AgentContracts";
import { DomainActionType } from "../contracts/ActionProposalContracts";
import { HealthContextProjection } from "../context/ContextProjectionEngine";
import { buildSpecialistPersonaPrompt } from "../../persona";

export class HealthAgent extends BaseSpecialistAgent {
  readonly domain: AgentDomain = "health";
  readonly allowedActions: ReadonlyArray<DomainActionType> = [
    "log_workout",
    "modify_workout",
    "log_meal",
    "update_weight",
    "propose_diet_mode",
    "confirm_diet_mode",
  ];

  buildSystemPrompt(task: AgentTask, context: HealthContextProjection): string {
    return `${buildSpecialistPersonaPrompt("health", "Daksh")}
You reason about physical training, workouts, nutrition, and physiological recovery.
You must output ONLY a valid JSON object matching this schema:
{
  "summary": string,
  "observations": [{ "payload": { "fact": string } }],
  "estimates": [{ "payload": { "estimate": string }, "confidence": number, "evidenceSources": string[] }],
  "hypotheses": [{ "payload": { "hypothesis": string }, "confidence": number, "falsificationCriteria": string[] }],
  "proposals": [
    {
      "actionType": "log_workout" | "modify_workout" | "log_meal" | "update_weight" | "propose_diet_mode" | "confirm_diet_mode",
      "targetEntityId": string,
      "payload": object,
      "rationale": string
    }
  ],
  "confidence": number,
  "unresolvedQuestions": string[]
}
Never propose actions outside your health domain.
Never treat probabilistic telemetry as medical facts.
Keep summaries concise, sharp, and actionable. Zero mechanical jargon.`;
  }
}
