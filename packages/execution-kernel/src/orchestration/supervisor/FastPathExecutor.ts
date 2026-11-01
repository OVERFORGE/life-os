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
    
    // Reject conversational or multi-clause statements
    if (/^(?:i\s+|we\s+|can\s+you\s+|could\s+you\s+|please\s+check\s+if)/i.test(trimmed)) {
      return false;
    }

    // Contextual pronouns ("that", "it", "this") require conversational activeFocus/anaphora resolution
    if (/\b(?:that\s+task|this\s+task|task\s+that|task\s+this)\b/i.test(trimmed) ||
        /^(?:complete|mark\s+done|finish|done\s+with|delete|remove)\s+(?:that|this|it)$/i.test(trimmed)) {
      return false;
    }

    // Reject multi-clause compound requests (e.g. "..., then ...", "... and also ...", "... and create/send/log ...")
    if (/\b(?:and\s+then|then\s+also|\b(?:and|,)\s+(?:create|add|send|log|complete|mark|delete|schedule|book|order|remind)\b)/i.test(trimmed)) {
      return false;
    }

    // Pattern 1: Mark/complete task: e.g. "mark task 123 complete", "complete task 123", "done with task 123", "complete task 'Title'"
    // Target must be an exact ID token ([a-zA-Z0-9_\-]+) or explicitly quoted string ("[^"]+" / '[^']+')
    if (/^mark\s+(?:task\s+)?([a-zA-Z0-9_\-]+|"[^"]+"|\'[^\']+\')\s+(?:as\s+)?(?:done|completed?)$/i.test(trimmed) ||
        /^(?:task\s+)?([a-zA-Z0-9_\-]+|"[^"]+"|\'[^\']+\')\s+(?:as\s+)?(?:done|completed?)$/i.test(trimmed) ||
        /^(?:mark\s+)?(?:done|complete)\s+(?:task\s+)?([a-zA-Z0-9_\-]+|"[^"]+"|\'[^\']+\')$/i.test(trimmed) ||
        /^(?:finish|check\s+off)\s+(?:task\s+)?([a-zA-Z0-9_\-]+|"[^"]+"|\'[^\']+\')$/i.test(trimmed) ||
        /^done\s+with\s+(?:task\s+)?([a-zA-Z0-9_\-]+|"[^"]+"|\'[^\']+\')$/i.test(trimmed)) {
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
    const completeMatch1 = trimmed.match(/^mark\s+(?:task\s+)?([a-zA-Z0-9_\-]+|"[^"]+"|\'[^\']+\')\s+(?:as\s+)?(?:done|completed?)$/i) ||
                           trimmed.match(/^(?:task\s+)?([a-zA-Z0-9_\-]+|"[^"]+"|\'[^\']+\')\s+(?:as\s+)?(?:done|completed?)$/i);
    const completeMatch2 = trimmed.match(/^(?:mark\s+)?(?:done|complete)\s+(?:task\s+)?([a-zA-Z0-9_\-]+|"[^"]+"|\'[^\']+\')$/i);
    const completeMatch3 = trimmed.match(/^(?:finish|check\s+off)\s+(?:task\s+)?([a-zA-Z0-9_\-]+|"[^"]+"|\'[^\']+\')$/i) ||
                           trimmed.match(/^done\s+with\s+(?:task\s+)?([a-zA-Z0-9_\-]+|"[^"]+"|\'[^\']+\')$/i);
    
    const taskTarget = completeMatch1?.[1] || completeMatch2?.[1] || completeMatch3?.[1];
    if (taskTarget) {
      const cleanTarget = taskTarget.replace(/^["']|["']$/g, "").trim();
      const taskId = this.resolveTaskId(cleanTarget, context?.knownTasks);
      if (!taskId) {
        return null;
      }
      return {
        id: generateId("act"),
        domain: "productivity",
        actionType: "complete_task",
        targetEntityId: taskId,
        payload: { taskId, targetIdentifier: cleanTarget },
        preconditions: { mustExist: true },
        rationale: "Deterministic fast-path command to complete task",
        reversibility: "reversible_with_compensation",
        idempotencyKey: `fastpath_complete_${userId}_${taskId}`,
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
        payload: { title: cleanTitle }, // Zero fabricated priority defaults!
        rationale: "Deterministic fast-path command to create task",
        reversibility: "reversible_with_compensation",
        idempotencyKey: `fastpath_create_${userId}_${cleanTitle.toLowerCase().replace(/\s+/g, "_")}`,
      };
    }

    // Check delete task: e.g. "delete task 123"
    const deleteMatch = trimmed.match(/^(?:delete|remove)\s+task\s+(.+)$/i);
    if (deleteMatch?.[1]) {
      const cleanTarget = deleteMatch[1].replace(/^["']|["']$/g, "").trim();
      const taskId = this.resolveTaskId(cleanTarget, context?.knownTasks);
      if (!taskId) {
        return null;
      }
      return {
        id: generateId("act"),
        domain: "productivity",
        actionType: "delete_task",
        targetEntityId: taskId,
        payload: { taskId, targetIdentifier: cleanTarget },
        preconditions: { mustExist: true },
        rationale: "Deterministic fast-path command to delete task",
        reversibility: "reversible_with_compensation",
        idempotencyKey: `fastpath_delete_${userId}_${taskId}`,
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
        idempotencyKey: `fastpath_meal_${userId}_${meal.toLowerCase().replace(/\s+/g, "_")}`,
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
        idempotencyKey: `fastpath_water_${userId}_${amount}_${unit}`,
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
        idempotencyKey: `fastpath_mode_${userId}_${mode}${durationDays ? `_${durationDays}` : ""}`,
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
        idempotencyKey: `fastpath_clearmode_${userId}`,
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

  /**
   * Executes a validated ActionProposal directly through the kernel capability boundary.
   */
  async executeProposal(
    proposal: ActionProposal,
    userId: string,
    context?: FastPathContext
  ): Promise<FastPathResult> {
    const startTime = Date.now();
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

  private resolveTaskId(target: string, knownTasks?: Array<{ id: string; title: string }>): string | null {
    if (!knownTasks || knownTasks.length === 0) {
      return target;
    }
    // Match by exact ID
    const byId = knownTasks.find((t) => t.id === target);
    if (byId) return byId.id;

    // Match by exact title
    const byTitle = knownTasks.find((t) => t.title.toLowerCase() === target.toLowerCase());
    if (byTitle) return byTitle.id;

    // Substring matching (.includes) is strictly removed to prevent ambiguous entity hijacking.
    // If target is neither exact ID nor exact title in knownTasks, return null to yield to AuthoritativeEntityResolver!
    return null;
  }

  /**
   * Generates a conversational response strictly free of internal mechanical jargon,
   * reflecting authoritative kernel execution truth in Aven's composed voice.
   */
  private generateUserResponse(proposal: ActionProposal, results: KernelExecutionResult[]): string {
    const firstResult = results[0];
    if (!firstResult || !firstResult.success) {
      const errorMsg = firstResult?.error || "The service failed before anything was persisted.";
      return `I couldn't complete that request: ${errorMsg}`;
    }

    switch (proposal.actionType) {
      case "complete_task": {
        const target = proposal.payload.targetIdentifier || proposal.payload.taskId;
        return `Done. Marked task '${target}' as completed.`;
      }
      case "create_task": {
        return `Done. Created task '${proposal.payload.title}'.`;
      }
      case "delete_task": {
        const target = proposal.payload.targetIdentifier || proposal.payload.taskId;
        return `Removed task '${target}'.`;
      }
      case "log_meal": {
        if (proposal.payload.type === "hydration") {
          return `Logged ${proposal.payload.amount} ${proposal.payload.unit} of water.`;
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
            return `Sanctuary Mode engaged${durationStr}. Alarms, urgency scoring, and pressure have been suspended. Prioritizing nervous system recovery.`;
          case "sabbatical":
            return `Sabbatical Mode active${durationStr}. Habits and velocity expectations are frozen without decay penalties.`;
          case "standard":
          default:
            return `Returned to Standard operational mode. Balanced routines restored.`;
        }
      }
      case "clear_context_mode": {
        return "Active context mode cleared. Returned to Standard operational mode.";
      }
      default:
        return "Done. The action was persisted.";
    }
  }
}

