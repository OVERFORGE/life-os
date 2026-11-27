/**
 * DynamicWorkflowPlanner.ts
 *
 * Schema-grounded dynamic workflow planner.
 * Ingests discovered capabilities from CapabilityRegistry, constructs structured prompts,
 * generates DAG plans with Kahn's topological consistency, and supports narrow deterministic fallback.
 */

import { CapabilityRegistry } from "../capabilities/CapabilityRegistry";
import { PlanStepDefinition, WorkflowExecutionPlan } from "../contracts/WorkflowExecutionContracts";
import { cleanLLMResponse, createAbortError, isAbortError } from "../../shared/groq";
import { PlanValidator } from "./PlanValidator";

export interface PlannerOptions {
  llmClient?: {
    complete(prompt: string, signal?: AbortSignal): Promise<string>;
  };
  registry?: CapabilityRegistry;
  allowBenchmarkFallback?: boolean;
}

export class DynamicWorkflowPlanner {
  private registry: CapabilityRegistry;
  private llmClient?: { complete(prompt: string, signal?: AbortSignal): Promise<string> };
  private allowBenchmarkFallback: boolean;

  constructor(options: PlannerOptions = {}) {
    this.registry = options.registry || CapabilityRegistry.getInstance();
    this.llmClient = options.llmClient;
    this.allowBenchmarkFallback = options.allowBenchmarkFallback ?? true;
  }

  /**
   * Generates a DAG execution plan from user request and goal.
   */
  async planWorkflow(input: {
    userRequest: string;
    goal: string;
    context?: Record<string, any>;
    signal?: AbortSignal;
  }): Promise<WorkflowExecutionPlan> {
    const { userRequest, goal, context, signal } = input;
    if (signal?.aborted) {
      throw createAbortError();
    }

    // 1. If LLM client is available, attempt dynamic LLM planning
    if (this.llmClient) {
      try {
        const plan = await this.planWithLLM(userRequest, goal, context, signal);
        const validation = PlanValidator.validate(plan, this.registry);
        if (validation.valid && validation.normalizedPlan) {
          return validation.normalizedPlan;
        }
      } catch (err) {
        if (isAbortError(err) || signal?.aborted) {
          throw createAbortError();
        }
        // Fall through to fallback or fail-closed
      }
    }

    // Fail closed if structured LLM planning is unavailable or invalid (zero keyword fallback guessing)
    throw new Error(
      `[PLANNING_FAILED]: Unable to generate a valid execution plan for objective: "${goal}".`
    );
  }

  /**
   * Replans the remainder of an uncompleted workflow graph.
   * Completed anchor nodes remain completely immutable.
   */
  async replanRemainder(input: {
    currentPlan: WorkflowExecutionPlan;
    failedStepId: string;
    failureReason: string;
    completedSteps: Array<{ stepId: string; data: any }>;
    temporalContext?: { localDate: string; dayOfWeek?: string; timezone: string };
    tailoredContext?: string;
    signal?: AbortSignal;
  }): Promise<WorkflowExecutionPlan> {
    const { currentPlan, failedStepId, failureReason, completedSteps, signal } = input;
    if (signal?.aborted) {
      throw createAbortError();
    }

    const completedStepIds = new Set(completedSteps.map((s) => s.stepId));
    const immutableSteps = currentPlan.steps.filter((s) => completedStepIds.has(s.stepId));

    const failedStep = currentPlan.steps.find((s) => s.stepId === failedStepId);
    if (!failedStep) {
      throw new Error(`[REPLANNING_ERROR]: Failed step "${failedStepId}" not found in current plan.`);
    }

    // Attempt LLM-guided adaptive replanning when llmClient is configured
    if (this.llmClient) {
      try {
        const capabilities = this.registry.listCapabilities().map((c) => ({
          urn: c.capabilityURN,
          operationKind: c.operationKind,
          description: c.description,
          parametersSchema: c.parametersSchema,
          requiresApproval: c.requiresApproval,
        }));
        const replanPrompt = `You are Aven's Bounded Adaptive Replanner.
Original Goal: "${currentPlan.goal}"
Failed Step: ${JSON.stringify(failedStep)}
Failure Reason: "${failureReason}"
Completed Immutable Step IDs: ${JSON.stringify(Array.from(completedStepIds))}
Temporal Context: ${JSON.stringify(input.temporalContext || {})}
${input.tailoredContext ? `World Context:\n${input.tailoredContext}\n` : ""}
Available Capabilities:
${JSON.stringify(capabilities, null, 2)}

Produce a strictly valid JSON WorkflowExecutionPlan for the REMAINING steps only (do NOT repeat completed stepIds). Keep steps <= 10 and preserve DAG acyclicity.`;

        const rawResp = await this.llmClient.complete(replanPrompt, signal);
        const cleaned = cleanLLMResponse(rawResp);
        const startIdx = cleaned.indexOf("{");
        const endIdx = cleaned.lastIndexOf("}");
        if (startIdx !== -1 && endIdx > startIdx) {
          const parsed = JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as WorkflowExecutionPlan;
          const adaptedRemainder = (parsed.steps || []).filter((s) => !completedStepIds.has(s.stepId));
          if (adaptedRemainder.length > 0) {
            const candidatePlan: WorkflowExecutionPlan = {
              goal: currentPlan.goal,
              userRequest: currentPlan.userRequest,
              steps: [...immutableSteps, ...adaptedRemainder],
              overallSuccessCriteria: currentPlan.overallSuccessCriteria,
            };
            const llmValidation = PlanValidator.validate(candidatePlan, this.registry);
            if (llmValidation.valid && llmValidation.normalizedPlan) {
              return llmValidation.normalizedPlan;
            }
          }
        }
      } catch (err) {
        if (isAbortError(err) || signal?.aborted) {
          throw createAbortError();
        }
        // Fall back to deterministic recovery below
      }
    }

    // Fallback: If failed step was a storage write with invalid path, propose an alternative safe path
    const replacementSteps: PlanStepDefinition[] = [];

    if (
      failedStep.capabilityURN === "productivity.storage.write_file" ||
      failedStep.actionType === "productivity.storage.write_file"
    ) {
      // Recovery revision: alternate path in workspace storage
      const originalPath = failedStep.parameters?.path || "output.txt";
      let trimmedPath = String(originalPath);
      while (trimmedPath.startsWith("/") || trimmedPath.startsWith("\\")) {
        trimmedPath = trimmedPath.slice(1);
      }
      const recoveryPath = originalPath.includes("recovered_")
        ? originalPath
        : `recovered_${trimmedPath}`;

      replacementSteps.push({
        stepId: `${failedStepId}_recovered`,
        actionType: failedStep.actionType,
        capabilityURN: failedStep.capabilityURN,
        parameters: {
          ...failedStep.parameters,
          path: recoveryPath,
        },
        dependsOn: failedStep.dependsOn,
        rationale: `Replanned after error (${failureReason}): Redirected to safe alternate path "${recoveryPath}"`,
      });
    } else {
      // Default replacement: clone failed step with retry rationale
      replacementSteps.push({
        stepId: `${failedStepId}_retry`,
        actionType: failedStep.actionType,
        capabilityURN: failedStep.capabilityURN,
        parameters: { ...failedStep.parameters },
        dependsOn: failedStep.dependsOn,
        rationale: `Replanned remainder for step ${failedStepId} due to: ${failureReason}`,
      });
    }

    // Carry over subsequent downstream steps, rewiring their dependencies
    const remainingSteps = currentPlan.steps.filter(
      (s) => !completedStepIds.has(s.stepId) && s.stepId !== failedStepId
    );

    const replacementStepId = replacementSteps[0].stepId;
    const rewiredRemaining = remainingSteps.map((s) => {
      const deps = (s.dependsOn || []).map((dep) => (dep === failedStepId ? replacementStepId : dep));
      // Also update $ref references
      const params = JSON.parse(
        JSON.stringify(s.parameters || {}).replaceAll(`$ref:${failedStepId}`, `$ref:${replacementStepId}`)
      );
      return {
        ...s,
        dependsOn: deps,
        parameters: params,
      };
    });

    const revisedPlan: WorkflowExecutionPlan = {
      goal: currentPlan.goal,
      userRequest: currentPlan.userRequest,
      steps: [...immutableSteps, ...replacementSteps, ...rewiredRemaining],
      overallSuccessCriteria: currentPlan.overallSuccessCriteria,
    };

    const validation = PlanValidator.validate(revisedPlan, this.registry);
    if (!validation.valid || !validation.normalizedPlan) {
      throw new Error(`[REPLANNING_VALIDATION_ERROR]: Replanned graph failed validation: ${validation.reason}`);
    }

    return validation.normalizedPlan;
  }

  /**
   * Prompts the LLM with registered capability schemas, temporal context, and tailored world context
   * to generate a structured DAG plan.
   */
  private async planWithLLM(
    userRequest: string,
    goal: string,
    context?: Record<string, any>,
    signal?: AbortSignal
  ): Promise<WorkflowExecutionPlan> {
    const candidateCapabilities = this.registry.listCapabilities();
    const prompt = this.buildPrompt(userRequest, goal, candidateCapabilities, context);
    const response = await this.llmClient!.complete(prompt, signal);

    const cleaned = cleanLLMResponse(response);
    const startIdx = cleaned.indexOf("{");
    const endIdx = cleaned.lastIndexOf("}");
    if (startIdx === -1 || endIdx <= startIdx) {
      throw new Error(`[LLM_PARSING_ERROR]: LLM response did not contain valid JSON plan: ${response}`);
    }

    return JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as WorkflowExecutionPlan;
  }

  /**
   * Constructs the prompt injecting capability schemas, temporal anchors, and world context.
   */
  private buildPrompt(
    userRequest: string,
    goal: string,
    capabilities: any[],
    context?: Record<string, any>
  ): string {
    const catalogSummary = capabilities.map((c) => {
      const isRead = c.operationKind === "READ";
      return {
        urn: c.capabilityURN,
        source: c.source,
        op: c.operationKind,
        domain: c.contextDomain,
        desc: c.description,
        params: isRead
          ? c.parametersSchema
          : {
            required: c.parametersSchema?.required,
            keys: c.parametersSchema?.properties ? Object.keys(c.parametersSchema.properties) : [],
          },
        out: c.outputSchema?.properties ? Object.keys(c.outputSchema.properties) : undefined,
        hitl: c.requiresApproval || undefined,
      };
    });

    const temporalContext = this.resolveTemporalContext(context);
    const tailoredContext =
      typeof context?.tailoredContext === "string" && context.tailoredContext.trim().length > 0
        ? context.tailoredContext.trim()
        : undefined;

    return `You are Aven's Sovereign Workflow Planner.
Generate a strictly validated JSON WorkflowExecutionPlan for the user's objective.

Goal: "${goal}"
User Request: "${userRequest}"
User Temporal Context: ${JSON.stringify(temporalContext)}
${tailoredContext ? `\nTailored LifeOS World Context:\n${tailoredContext}\n` : ""}
Available Capabilities:
${JSON.stringify(catalogSummary)}

Strict Requirements:
1. Output ONLY a valid JSON object matching:
{
  "goal": string,
  "userRequest": string,
  "steps": [
    {
      "stepId": string,
      "actionType": "external_capability_action" | "synthesis" | <capabilityURN>,
      "capabilityURN": string,
      "parameters": object,
      "dependsOn": string[],
      "rationale": string
    }
  ]
}
2. Dependencies must form a Directed Acyclic Graph (DAG) with maximum depth 5 and max 15 steps.
3. For READ queries across independent LifeOS or external sources (including "lifeos.memory.search" alongside "lifeos.tasks.query", "lifeos.goals.query", "lifeos.schedule.query_occurrences", or "lifeos.daily_logs.query_range"), run independent read steps in parallel (empty dependsOn: []) and add a final "synthesis" step (capabilityURN: "synthesis", actionType: "synthesis") whose dependsOn lists those read stepIds.
4. For internal LifeOS READ capabilities (source INTERNAL_ADAPTER), resolve relative dates ("today", "last 7 days") into exact YYYY-MM-DD strings using User Temporal Context.
5. Use "$ref:stepId.property" for parameters derived from upstream step outputs.
`;
  }

  private resolveTemporalContext(context?: Record<string, any>): {
    localDate: string;
    dayOfWeek: string;
    timezone: string;
  } {
    if (context?.temporalContext?.localDate && context?.temporalContext?.timezone) {
      return {
        localDate: String(context.temporalContext.localDate),
        dayOfWeek: String(context.temporalContext.dayOfWeek || ""),
        timezone: String(context.temporalContext.timezone),
      };
    }

    const timezone = typeof context?.timezone === "string" && context.timezone ? context.timezone : "UTC";
    const refDate =
      typeof context?.referenceTimeMs === "number" ? new Date(context.referenceTimeMs) : new Date();
    try {
      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(refDate);
      const dayOfWeek = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "long",
      }).format(refDate);
      return { localDate, dayOfWeek, timezone };
    } catch (_) {
      return {
        localDate: refDate.toISOString().slice(0, 10),
        dayOfWeek: "Today",
        timezone: "UTC",
      };
    }
  }

}

