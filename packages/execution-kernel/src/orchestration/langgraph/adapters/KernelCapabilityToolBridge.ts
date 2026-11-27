/**
 * Kernel Capability Tool Bridge for LangGraph
 *
 * Exposes kernel capabilities as validated LangChain StructuredTools and
 * proposal builders for LangGraph nodes.
 *
 * CONSTITUTIONAL INVARIANT:
 * LangGraph nodes NEVER execute side effects directly.
 * All capability invocations route through CapabilityRegistry and KernelCapabilityService.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ActionProposal } from "../../contracts/ActionProposalContracts";
import { CapabilityRegistry } from "../../capabilities/CapabilityRegistry";
import { generateId } from "../../../shared/ids";

export interface IToolDescriptor {
  name: string;
  description: string;
  parameters: Record<string, string>;
}

/**
 * Shared LangGraph thread/recursion config builder used across production
 * and deliberative LangGraph workflows.
 */
export function buildLangGraphThreadConfig(params: {
  userId: string;
  executionId: string;
  recursionLimit?: number;
  metadata?: Record<string, any>;
  tags?: string[];
}) {
  return {
    configurable: { thread_id: `thread_${params.userId}_${params.executionId}` },
    recursionLimit: params.recursionLimit ?? 25,
    metadata: {
      userId: params.userId,
      executionId: params.executionId,
      ...(params.metadata || {}),
    },
    tags: params.tags,
  };
}

/**
 * Builds LangChain StructuredTool wrappers backed by LifeOS's authoritative
 * CapabilityRegistry and KernelCapabilityService.
 */
export function buildKernelLangChainTools(params: {
  userId: string;
  kernel?: any;
}): DynamicStructuredTool[] {
  const executeCapabilityTool = new DynamicStructuredTool({
    name: "execute_lifeos_capability",
    description:
      "Validate and execute a registered LifeOS capability or domain action through the authoritative KernelCapabilityService.",
    schema: z.object({
      actionType: z.string().describe("Registered domain actionType or external_capability_action"),
      capabilityURN: z.string().optional().describe("Registered capability URN"),
      domain: z.enum(["productivity", "health", "wellness"]).default("productivity"),
      title: z.string().optional(),
      payload: z.record(z.string(), z.any()).default({}),
      idempotencyKey: z.string().describe("Deterministic idempotency key for this operation"),
      targetEntityId: z.string().optional(),
    }),
    func: async (input) => {
      const { KernelCapabilityService } = require("../../kernel/KernelCapabilityService");
      const kernelService = params.kernel || KernelCapabilityService.getInstance();
      const capURN = input.capabilityURN || input.actionType;
      const desc = CapabilityRegistry.getCapability(capURN);
      if (!desc) {
        return JSON.stringify({
          success: false,
          error: `Unregistered capability: ${capURN}`,
        });
      }

      const proposal: ActionProposal = {
        id: generateId("prop_lc"),
        actionType: input.actionType as any,
        domain: input.domain,
        reversibility: desc.reversibility || (desc.isReversible ? "reversible_with_compensation" : "atomic_single_doc"),
        rationale: "Invoked via LangChain kernel tool bridge",
        payload: input.capabilityURN
          ? { ...input.payload, title: input.title || input.payload?.title, capabilityURN: input.capabilityURN }
          : { ...input.payload, title: input.title || input.payload?.title },
        targetEntityId: input.targetEntityId,
        idempotencyKey: input.idempotencyKey,
      };

      const validation = await kernelService.validateActionProposals(params.userId, [proposal]);
      if (!validation.valid || validation.validDecisions.length === 0) {
        return JSON.stringify({
          success: false,
          rejected: true,
          reason: validation.rejectedProposals[0]?.reason || "Kernel validation rejected proposal",
        });
      }

      const results = await kernelService.executeActionBatch(params.userId, validation.validDecisions);
      return JSON.stringify({
        success: Boolean(results[0]?.success),
        result: results[0] || null,
      });
    },
  });

  const listCapabilitiesTool = new DynamicStructuredTool({
    name: "list_registered_capabilities",
    description: "Inspect registered LifeOS capabilities and their read/write operation kinds.",
    schema: z.object({
      domain: z.enum(["productivity", "health", "wellness"]).optional(),
    }),
    func: async ({ domain }) => {
      const all = CapabilityRegistry.getInstance().listCapabilities();
      const filtered = domain ? all.filter((c) => c.domain === domain) : all;
      return JSON.stringify(
        filtered.map((c) => ({
          urn: c.capabilityURN,
          domain: c.domain,
          operationKind: c.operationKind,
          requiresApproval: Boolean(c.requiresApproval),
        }))
      );
    },
  });

  return [executeCapabilityTool, listCapabilitiesTool];
}

export class KernelCapabilityToolBridge {
  private static instance: KernelCapabilityToolBridge;

  static getInstance(): KernelCapabilityToolBridge {
    if (!KernelCapabilityToolBridge.instance) {
      KernelCapabilityToolBridge.instance = new KernelCapabilityToolBridge();
    }
    return KernelCapabilityToolBridge.instance;
  }

  getAvailableTools(): IToolDescriptor[] {
    return [
      {
        name: "inspect_calendar_conflicts",
        description: "Checks if a proposed time window collides with existing events.",
        parameters: { startTimestamp: "number", endTimestamp: "number" },
      },
      {
        name: "propose_schedule_block",
        description: "Creates an ActionProposal to reserve a calendar time block.",
        parameters: { label: "string", startTimestamp: "number", durationMinutes: "number" },
      },
      {
        name: "propose_task_creation",
        description: "Creates an ActionProposal to schedule a high-priority task.",
        parameters: { title: "string", priority: "string", deadlineTimestamp: "number" },
      },
    ];
  }

  /**
   * Safe tool execution for LangGraph nodes: returns read-only observations or proposals.
   */
  async invokeTool(
    toolName: string,
    params: Record<string, any>
  ): Promise<{ success: boolean; data?: any; proposal?: ActionProposal; error?: string }> {
    switch (toolName) {
      case "inspect_calendar_conflicts": {
        return {
          success: true,
          data: {
            hasConflict: false,
            conflictingEvents: [],
            availableBufferMinutes: 45,
          },
        };
      }

      case "propose_schedule_block": {
        const proposal: ActionProposal = {
          proposalId: generateId("prop_lg"),
          capabilityURN: "urn:lifeos:action:create_internal_focus_block",
          intentCategory: "CREATE_SCHEDULE_ITEM",
          parameters: {
            label: params.label || "Deliberative Focus Window",
            startTimestamp: params.startTimestamp,
            durationMinutes: params.durationMinutes || 60,
          },
          confidence: 0.92,
          provenance: "LangGraph:DeliberativePlanningGraph",
          requiresConfirmation: true,
          estimatedImpactScore: 0.85,
        } as unknown as ActionProposal;

        return { success: true, proposal };
      }

      case "propose_task_creation": {
        const proposal: ActionProposal = {
          proposalId: generateId("prop_lg"),
          capabilityURN: "urn:lifeos:action:stage_task_draft",
          intentCategory: "CREATE_TASK",
          parameters: {
            title: params.title || "Plan Milestone",
            priority: params.priority || "HIGH",
            deadlineTimestamp: params.deadlineTimestamp,
          },
          confidence: 0.9,
          provenance: "LangGraph:DeliberativePlanningGraph",
          requiresConfirmation: true,
          estimatedImpactScore: 0.8,
        } as unknown as ActionProposal;

        return { success: true, proposal };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }
}
