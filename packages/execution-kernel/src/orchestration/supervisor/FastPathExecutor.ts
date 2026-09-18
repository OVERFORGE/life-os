import { IKernelCapabilityService } from "../kernel/IKernelCapabilityService";
import { ActionProposal, KernelExecutionResult } from "../contracts/ActionProposalContracts";
import { generateId } from "../../shared/ids";

export interface FastPathContext {
  executionId?: string;
  knownTasks?: Array<{ id: string; title: string }>;
  timezone?: string;
}

export interface FastPathResult {
  handled: boolean;
  durationMs: number;
  proposal?: ActionProposal;
  kernelResults?: KernelExecutionResult[];
  userResponse: string;
}

/**
 * FastPathExecutor
 * 
 * Bypasses full multi-agent cognitive overhead for single deterministic requests.
 * Latency budget: <= 1000ms.
 * Invariant: Never leaks DAG/ExecutionNode terminology to the user.
 */
export class FastPathExecutor {
  constructor(private kernelService: IKernelCapabilityService) {}

  /**
   * Deterministic pattern matching for high-velocity user commands.
   */
  canHandle(message: string): boolean {
    const trimmed = message.trim().toLowerCase();
    
    // Pattern 1: Mark/complete task: e.g. "mark task 123 complete", "complete task 123", "done with task 123"
    if (/^(?:mark\s+)?(?:task\s+)?(.+?)\s+(?:as\s+)?(?:done|completed?)$/i.test(trimmed) ||
        /^(?:mark\s+)?(?:done|complete)\s+(?:task\s+)?(.+)$/i.test(trimmed) ||
        /^(?:finish|check\s+off)\s+(?:task\s+)?(.+)$/i.test(trimmed)) {
      return true;
    }

    // Pattern 2: Create/add task: e.g. "create task: Review PR", "add task Buy milk", "remind me to Call mom", "create a task..."
    if (/^(?:create|add|new)\s+(?:a\s+)?task\s*[:\-]?\s*(.+)$/i.test(trimmed) ||
        /^remind\s+me\s+to\s+(.+)$/i.test(trimmed)) {
      return true;
    }

    // Pattern 3: Delete task: e.g. "delete task 123"
    if (/^(?:delete|remove)\s+task\s+(.+)$/i.test(trimmed)) {
      return true;
    }

    // Pattern 4: Log meal / hydration: e.g. "log meal oatmeal", "drank 500ml of water", "log 750 ml water"
    if (/^(log|ate|eat)\s+meal\s*[:\-]?\s*(.+)$/i.test(trimmed) ||
        /^(?:log|drank|drink)\s+(\d+)\s*(ml|oz|cups?)(?:\s+(?:of\s+)?water)?$/i.test(trimmed)) {
      return true;
    }

    // Pattern 5: Context Modes / Life Seasons
    // e.g. "start sprint mode for 7 days", "enable sanctuary mode", "enter sabbatical mode for 14 days", "set standard mode"
    if (/^(?:start|enable|switch\s+to|set|activate|enter)\s+(sprint|sanctuary|sabbatical|standard)(?:\s+mode)?(?:\s+for\s+(\d+)\s+days?)?$/i.test(trimmed)) {
      return true;
    }
    // e.g. "exit sprint mode", "leave sanctuary mode", "end sabbatical mode", "resume standard mode"
    if (/^(?:exit|leave|stop|end|clear)\s+(?:active\s+)?(sprint|sanctuary|sabbatical|context)(?:\s+mode)?$/i.test(trimmed) ||
        /^(?:resume|return\s+to)\s+standard(?:\s+mode)?$/i.test(trimmed)) {
      return true;
    }

    return false;
  }

  /**
   * Extracts a structured ActionProposal from a fast-path message.
   */
  extractProposal(message: string, userId: string, context?: FastPathContext): ActionProposal | null {
    const trimmed = message.trim();

    // Check complete task: e.g. "Mark task 123 complete", "complete task review pr"
    const completeMatch1 = trimmed.match(/^(?:mark\s+)?(?:task\s+)?(.+?)\s+(?:as\s+)?(?:done|completed?)$/i);
    const completeMatch2 = trimmed.match(/^(?:mark\s+)?(?:done|complete)\s+(?:task\s+)?(.+)$/i);
    const completeMatch3 = trimmed.match(/^(?:finish|check\s+off)\s+(?:task\s+)?(.+)$/i);
    
    const taskTarget = completeMatch1?.[1] || completeMatch2?.[1] || completeMatch3?.[1];
    if (taskTarget) {
      const cleanTarget = taskTarget.replace(/^["']|["']$/g, "").trim();
      const taskId = this.resolveTaskId(cleanTarget, context?.knownTasks);
      return {
        id: generateId("act"),
        domain: "productivity",
        actionType: "complete_task",
        targetEntityId: taskId,
        payload: { taskId, targetIdentifier: cleanTarget },
        preconditions: { mustExist: true },
        rationale: "Deterministic fast-path command to complete task",
        reversibility: "reversible_with_compensation",
        idempotencyKey: `fastpath_complete_${userId}_${taskId}_${Date.now()}`,
      };
    }

    // Check create task: e.g. "create task: Review documentation", "add task Buy milk", "remind me to Call mom", "create a task..."
    const createMatch1 = trimmed.match(/^(?:create|add|new)\s+(?:a\s+)?task\s*[:\-]?\s*(.+)$/i);
    const createMatch2 = trimmed.match(/^remind\s+me\s+to\s+(.+)$/i);
    const title = createMatch1?.[1] || createMatch2?.[1];
    if (title) {
      const cleanTitle = title.replace(/^["']|["']$/g, "").trim();
      return {
        id: generateId("act"),
        domain: "productivity",
        actionType: "create_task",
        payload: { title: cleanTitle, priority: "medium" },
        rationale: "Deterministic fast-path command to create task",
        reversibility: "reversible_with_compensation",
        idempotencyKey: `fastpath_create_${userId}_${cleanTitle.replace(/\s+/g, "_")}_${Date.now()}`,
      };
    }

    // Check delete task: e.g. "delete task 123"
    const deleteMatch = trimmed.match(/^(?:delete|remove)\s+task\s+(.+)$/i);
    if (deleteMatch?.[1]) {
      const cleanTarget = deleteMatch[1].replace(/^["']|["']$/g, "").trim();
      const taskId = this.resolveTaskId(cleanTarget, context?.knownTasks);
      return {
        id: generateId("act"),
        domain: "productivity",
        actionType: "delete_task",
        targetEntityId: taskId,
        payload: { taskId, targetIdentifier: cleanTarget },
        preconditions: { mustExist: true },
        rationale: "Deterministic fast-path command to delete task",
        reversibility: "reversible_with_compensation",
        idempotencyKey: `fastpath_delete_${userId}_${taskId}_${Date.now()}`,
      };
    }

    // Check meal / hydration log
    const mealMatch = trimmed.match(/^(?:log|ate|eat)\s+meal\s*[:\-]?\s*(.+)$/i);
    if (mealMatch?.[1]) {
      const meal = mealMatch[1].replace(/^["']|["']$/g, "").trim();
      return {
        id: generateId("act"),
        domain: "health",
        actionType: "log_meal",
        payload: { meal },
        rationale: "Deterministic fast-path command to log meal",
        reversibility: "atomic_single_doc",
        idempotencyKey: `fastpath_meal_${userId}_${Date.now()}`,
      };
    }

    const waterMatch = trimmed.match(/^(?:log|drank|drink)\s+(\d+)\s*(ml|oz|cups?)(?:\s+(?:of\s+)?water)?$/i);
    if (waterMatch) {
      const amount = parseInt(waterMatch[1], 10);
      const unit = waterMatch[2].toLowerCase();
      return {
        id: generateId("act"),
        domain: "health",
        actionType: "log_meal",
        payload: { type: "hydration", amount, unit },
        rationale: "Deterministic fast-path command to log hydration",
        reversibility: "atomic_single_doc",
        idempotencyKey: `fastpath_water_${userId}_${Date.now()}`,
      };
    }

    // Check set context mode
    const setModeMatch = trimmed.match(/^(?:start|enable|switch\s+to|set|activate|enter)\s+(sprint|sanctuary|sabbatical|standard)(?:\s+mode)?(?:\s+for\s+(\d+)\s+days?)?$/i);
    if (setModeMatch) {
      const mode = setModeMatch[1].toLowerCase() as "standard" | "sprint" | "sanctuary" | "sabbatical";
      const durationDays = setModeMatch[2] ? parseInt(setModeMatch[2], 10) : undefined;
      return {
        id: generateId("act"),
        domain: "context",
        actionType: "set_context_mode",
        payload: { mode, durationDays },
        rationale: `User activated ${mode} context mode${durationDays ? ` for ${durationDays} days` : ""}`,
        reversibility: "atomic_single_doc",
        idempotencyKey: `fastpath_mode_${userId}_${mode}_${Date.now()}`,
      };
    }

    // Check clear context mode
    const clearModeMatch = trimmed.match(/^(?:exit|leave|stop|end|clear)\s+(?:active\s+)?(sprint|sanctuary|sabbatical|context)(?:\s+mode)?$/i) ||
                           trimmed.match(/^(?:resume|return\s+to)\s+standard(?:\s+mode)?$/i);
    if (clearModeMatch) {
      return {
        id: generateId("act"),
        domain: "context",
        actionType: "clear_context_mode",
        payload: { reason: "User requested return to standard operational mode" },
        rationale: "User cleared active context mode",
        reversibility: "atomic_single_doc",
        idempotencyKey: `fastpath_clearmode_${userId}_${Date.now()}`,
      };
    }

    return null;
  }

  /**
   * Executes the fast-path request end-to-end within the <= 1000ms latency budget.
   */
  async execute(
    message: string,
    userId: string,
    context?: FastPathContext
  ): Promise<FastPathResult> {
    const startTime = Date.now();

    if (!this.canHandle(message)) {
      return {
        handled: false,
        durationMs: Date.now() - startTime,
        userResponse: "",
      };
    }

    const proposal = this.extractProposal(message, userId, context);
    if (!proposal) {
      return {
        handled: false,
        durationMs: Date.now() - startTime,
        userResponse: "",
      };
    }

    // 1. Validate through Kernel Capability Boundary
    const validation = await this.kernelService.validateActionProposals(userId, [proposal]);
    if (!validation.valid || validation.validDecisions.length === 0) {
      const reason = validation.rejectedProposals[0]?.reason || "Validation rejected";
      return {
        handled: true,
        durationMs: Date.now() - startTime,
        proposal,
        userResponse: `I couldn't complete that request: ${reason}`,
      };
    }

    // 2. Execute authoritative batch
    const results = await this.kernelService.executeActionBatch(userId, validation.validDecisions);
    const durationMs = Date.now() - startTime;

    const userResponse = this.generateUserResponse(proposal, results);

    return {
      handled: true,
      durationMs,
      proposal,
      kernelResults: results,
      userResponse,
    };
  }

  private resolveTaskId(target: string, knownTasks?: Array<{ id: string; title: string }>): string {
    if (!knownTasks || knownTasks.length === 0) {
      return target;
    }
    // Match by exact ID
    const byId = knownTasks.find((t) => t.id === target);
    if (byId) return byId.id;

    // Match by exact title
    const byTitle = knownTasks.find((t) => t.title.toLowerCase() === target.toLowerCase());
    if (byTitle) return byTitle.id;

    // Match by partial title
    const byPartial = knownTasks.find((t) => t.title.toLowerCase().includes(target.toLowerCase()));
    if (byPartial) return byPartial.id;

    return target;
  }

  /**
   * Generates a conversational response strictly free of DAG / internal kernel jargon.
   */
  private generateUserResponse(proposal: ActionProposal, results: KernelExecutionResult[]): string {
    const firstResult = results[0];
    if (!firstResult || !firstResult.success) {
      const errorMsg = firstResult?.error || "An unexpected error occurred.";
      return `I couldn't complete that request: ${errorMsg}`;
    }

    switch (proposal.actionType) {
      case "complete_task": {
        const target = proposal.payload.targetIdentifier || proposal.payload.taskId;
        return `I've marked task '${target}' as completed.`;
      }
      case "create_task": {
        return `I've created the task '${proposal.payload.title}' for you.`;
      }
      case "delete_task": {
        const target = proposal.payload.targetIdentifier || proposal.payload.taskId;
        return `I've removed task '${target}'.`;
      }
      case "log_meal": {
        if (proposal.payload.type === "hydration") {
          return `Logged ${proposal.payload.amount} ${proposal.payload.unit} of water. Stay hydrated!`;
        }
        return `Logged meal: ${proposal.payload.meal}.`;
      }
      case "set_context_mode": {
        const mode = proposal.payload.mode;
        const days = proposal.payload.durationDays;
        const durationStr = days ? ` for the next ${days} days` : "";
        switch (mode) {
          case "sprint":
            return `Sprint Mode activated${durationStr}. High-velocity execution focus engaged with sleep and physiological circuit breakers protected.`;
          case "sanctuary":
            return `Sanctuary Mode engaged${durationStr}. Alarms, urgency scoring, and pressure have been suspended. Prioritize nervous system recovery.`;
          case "sabbatical":
            return `Sabbatical Mode active${durationStr}. Habits and velocity expectations are frozen without decay penalties. Enjoy your intentional rest.`;
          case "standard":
          default:
            return `Returned to Standard operational mode. Balanced routines restored.`;
        }
      }
      case "clear_context_mode": {
        return "Active context mode cleared. Returned to Standard operational mode.";
      }
      default:
        return "Action completed successfully.";
    }
  }
}
