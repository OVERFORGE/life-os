import { KernelExecutionResult } from "../contracts/ActionProposalContracts";
import { SemanticTurn } from "../contracts/SemanticTurnContracts";

export interface GroundedResponseOptions {
  userMessage?: string;
  conversationalSummary?: string;
}

/**
 * GroundedResponseGenerator
 * 
 * Invariant: The verbal response to the user must be strictly grounded
 * in the authoritative KernelExecutionResult.
 * 
 * If an action fails, Aven must NEVER claim success.
 * If multiple actions occur (compound turn), Aven reports both successes
 * and failures transparently.
 */
export class GroundedResponseGenerator {
  private static instance: GroundedResponseGenerator;

  static getInstance(): GroundedResponseGenerator {
    if (!GroundedResponseGenerator.instance) {
      GroundedResponseGenerator.instance = new GroundedResponseGenerator();
    }
    return GroundedResponseGenerator.instance;
  }

  generateResponse(
    turn: SemanticTurn,
    results: KernelExecutionResult[],
    options?: GroundedResponseOptions
  ): string {
    // 1. If turn requires clarification, strictly return clarification question
    if (turn.clarification?.required && turn.clarification.questionToUser) {
      return turn.clarification.questionToUser;
    }

    // 2. If user cancelled or dismissed
    if (turn.primaryClassification === "CANCEL_OR_DISMISS") {
      return "Understood. I've cancelled that.";
    }

    // 3. If no operations requested (casual dialogue or informational)
    if (results.length === 0) {
      return turn.conversationalSummary || "I understand. How else can I assist you?";
    }

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    const successSentences: string[] = [];
    for (const r of successes) {
      successSentences.push(this.formatSuccess(r));
    }

    const failureSentences: string[] = [];
    for (const r of failures) {
      failureSentences.push(this.formatFailure(r));
    }

    // Case A: All succeeded
    if (failures.length === 0) {
      return successSentences.join(" ");
    }

    // Case B: All failed
    if (successes.length === 0) {
      return failureSentences.join(" ");
    }

    // Case C: Mixed compound outcome
    return `${successSentences.join(" ")} However, ${failureSentences.join(" ")}`;
  }

  private formatSuccess(result: KernelExecutionResult): string {
    const { actionType, data } = result;

    switch (actionType) {
      case "create_task": {
        const title = data?.taskTitle || data?.title || data?.task?.title || "task";
        const due = data?.dueDate ? ` for ${data.dueDate}` : "";
        const time = data?.dueTime ? ` at ${data.dueTime}` : "";
        return `I've scheduled that task: "${title}"${due}${time}.`;
      }

      case "complete_task": {
        const title = data?.task?.title || data?.taskTitle || data?.title || "Task";
        return `Marked "${title}" as complete.`;
      }

      case "update_task": {
        const title = data?.task?.title || data?.title || "task";
        return `Updated task "${title}".`;
      }

      case "delete_task": {
        return `Deleted that task.`;
      }

      case "log_meal": {
        const desc = data?.description || data?.meal?.name || "your meal";
        const cals = data?.dailyTotals?.calories || data?.calories || data?.macros?.calories;
        const calStr = cals ? ` (${cals} kcal)` : "";
        return `Logged ${desc}${calStr}.`;
      }

      case "record_mental_estimate": {
        const parts: string[] = [];
        if (data?.energy !== undefined) parts.push(`Energy: ${data.energy}/10`);
        if (data?.stress !== undefined) parts.push(`Stress: ${data.stress}/10`);
        if (data?.mood !== undefined) parts.push(`Mood: ${data.mood}/10`);
        const metricsStr = parts.length > 0 ? ` (${parts.join(", ")})` : "";
        return `Recorded your mental state check-in${metricsStr}.`;
      }

      case "set_context_mode": {
        const mode = data?.mode || "focus";
        return `Switched context mode to ${mode}.`;
      }

      case "clear_context_mode": {
        return `Reset context mode to default.`;
      }

      case "propose_goal": {
        const title = data?.title || "goal";
        return `Drafted goal proposal: "${title}".`;
      }

      default:
        return `Successfully completed ${actionType.replace(/_/g, " ")}.`;
    }
  }

  private formatFailure(result: KernelExecutionResult): string {
    const err = result.error || "Execution failed";
    const actionDesc = result.actionType.replace(/_/g, " ");
    return `I couldn't complete ${actionDesc}: ${err}.`;
  }
}
