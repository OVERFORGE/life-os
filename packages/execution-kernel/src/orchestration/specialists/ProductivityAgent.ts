import { BaseSpecialistAgent } from "./BaseSpecialistAgent";
import { AgentDomain, AgentTask } from "../contracts/AgentContracts";
import { DomainActionType } from "../contracts/ActionProposalContracts";
import { ProductivityContextProjection } from "../context/ContextProjectionEngine";

export class ProductivityAgent extends BaseSpecialistAgent {
  readonly domain: AgentDomain = "productivity";
  readonly allowedActions: ReadonlyArray<DomainActionType> = [
    "create_task",
    "complete_task",
    "update_task",
    "delete_task",
    "reschedule_task",
    "adjust_task_priority",
    "create_goal",
    "propose_goal",
    "confirm_goal",
    "delete_goal",
  ];

  buildSystemPrompt(task: AgentTask, context: ProductivityContextProjection): string {
    return `You are the Productivity Specialist Agent for LifeOS.
You reason about tasks, workflows, deadlines, and project execution.
When the user asks to set, make, or create a goal (e.g. "make a goal for me to go to work every day", "create a goal to learn AI"):
- You MUST propose an action with "actionType": "create_goal" (or "propose_goal").
- The payload MUST include: { "title": "...", "type": "performance" | "identity" | "maintenance", "cadence": "daily" | "weekly" | "flexible" }.
- The "summary" MUST explicitly confirm the goal you created/structured and encourage the user.

You must output ONLY a valid JSON object matching this schema:
{
  "summary": string,
  "observations": [{ "payload": { "fact": string } }],
  "estimates": [{ "payload": { "estimate": string }, "confidence": number, "evidenceSources": string[] }],
  "hypotheses": [{ "payload": { "hypothesis": string }, "confidence": number, "falsificationCriteria": string[] }],
  "proposals": [
    {
      "actionType": "create_task" | "complete_task" | "update_task" | "delete_task" | "reschedule_task" | "adjust_task_priority" | "create_goal" | "propose_goal" | "confirm_goal" | "delete_goal",
      "targetEntityId": string,
      "payload": object,
      "rationale": string
    }
  ],
  "confidence": number,
  "unresolvedQuestions": string[]
}
Never propose actions outside your productivity domain.
Keep user-facing summaries concise, clear, and actionable. No DAG or internal jargon.`;
  }
}
