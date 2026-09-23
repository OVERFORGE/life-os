import { KernelExecutionResult, DOMAIN_CAPABILITIES } from "../contracts/ActionProposalContracts";
import { SemanticTurn, EntityResolutionEvidence } from "../contracts/SemanticTurnContracts";

export interface GroundedResponseOptions {
  userMessage?: string;
  conversationalSummary?: string;
}

/**
 * GroundedResponseGenerator
 * 
 * Invariant S-7 / Phase 5: Strictly grounded first-person executive communication.
 * Zero internal technical jargon ("taskId", "validation failed", "adapter"),
 * zero third-person LLM prompt leakage ("User wants...").
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
    options?: GroundedResponseOptions,
    evidence?: EntityResolutionEvidence[]
  ): string {
    // 1. If turn requires clarification, return clarification question
    if (turn.clarification?.required && turn.clarification.questionToUser) {
      return turn.clarification.questionToUser;
    }

    // 2. If user cancelled or dismissed
    if (turn.primaryClassification === "CANCEL_OR_DISMISS") {
      return "Understood. I've cancelled that.";
    }

    // 3. If no operations were requested (casual dialogue or informational)
    if (results.length === 0) {
      // Strip any accidental third-person prefix from conversationalSummary
      const summary = turn.conversationalSummary || "";
      if (summary.startsWith("User wants") || summary.startsWith("The user") || summary.startsWith("User ")) {
        return "I understand. How else can I assist you?";
      }
      return summary || "I understand. How else can I assist you?";
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

    // Case C: Mixed outcome
    return `${successSentences.join(" ")} However, ${failureSentences.join(" ")}`;
  }

  private formatSuccess(result: KernelExecutionResult): string {
    const { actionType, data } = result;
    const cap = DOMAIN_CAPABILITIES[actionType];

    switch (actionType) {
      case "create_task": {
        const title = result.targetEntity?.displayName || data?.taskTitle || data?.title || data?.task?.title || "task";
        const due = data?.dueDate ? ` for ${data.dueDate}` : "";
        const time = data?.dueTime ? ` at ${data.dueTime}` : "";
        return `I've scheduled that task: "${title}"${due}${time}.`;
      }

      case "complete_task": {
        const title = result.targetEntity?.displayName || data?.task?.title || data?.taskTitle || data?.title || "Task";
        return `Marked "${title}" as complete.`;
      }

      case "adjust_task_priority": {
        const title = result.targetEntity?.displayName || data?.taskTitle || data?.title || data?.task?.title || "task";
        const prio = data?.priority || data?.task?.priority || "high";
        return `I've updated the priority of "${title}" to ${prio}.`;
      }

      case "update_task": {
        const title = result.targetEntity?.displayName || data?.task?.title || data?.title || "task";
        return `Updated task "${title}".`;
      }

      case "reschedule_task": {
        const title = result.targetEntity?.displayName || data?.task?.title || data?.title || "task";
        const due = data?.dueDate || data?.task?.dueDate || "";
        return `Rescheduled "${title}" for ${due}.`;
      }

      case "delete_task": {
        const title = result.targetEntity?.displayName || data?.title || data?.task?.title;
        return title ? `Deleted task "${title}".` : "Deleted that task.";
      }

      case "create_goal":
      case "propose_goal": {
        const title = result.targetEntity?.displayName || data?.title || data?.goal?.title || "goal";
        return `I've proposed that goal: "${title}".`;
      }

      case "confirm_goal": {
        const title = result.targetEntity?.displayName || data?.title || data?.goal?.title || "goal";
        return `Confirmed and activated your goal: "${title}".`;
      }

      case "delete_goal": {
        const title = result.targetEntity?.displayName || data?.title || data?.goal?.title;
        return title ? `Deleted the goal: "${title}".` : "Deleted that goal.";
      }

      case "log_meal": {
        const desc = data?.description || data?.meal?.name || "your meal";
        const cals = data?.dailyTotals?.calories || data?.calories || data?.macros?.calories;
        const calStr = cals ? ` (${cals} kcal)` : "";
        return `Logged ${desc}${calStr}.`;
      }

      case "log_workout": {
        const name = data?.name || data?.workoutType || "workout";
        return `Logged your workout: "${name}".`;
      }

      case "modify_workout": {
        const name = data?.workout?.name || data?.name || "workout";
        return `Updated your workout: "${name}".`;
      }

      case "update_weight": {
        const weight = data?.weight || data?.data?.weight;
        return `Recorded your weight: ${weight} kg.`;
      }

      case "record_mental_estimate": {
        const parts: string[] = [];
        if (data?.energy !== undefined) parts.push(`Energy: ${data.energy}/10`);
        if (data?.stress !== undefined) parts.push(`Stress: ${data.stress}/10`);
        if (data?.mood !== undefined) parts.push(`Mood: ${data.mood}/10`);
        const metricsStr = parts.length > 0 ? ` (${parts.join(", ")})` : "";
        return `Recorded your mental state check-in${metricsStr}.`;
      }

      case "log_activity": {
        const act = data?.activityType || "activity";
        return `Logged activity: ${act}.`;
      }

      case "apply_recovery_constraint": {
        return `Applied recovery constraint for today.`;
      }

      case "set_context_mode": {
        const mode = data?.mode || "focus";
        return `Switched context mode to ${mode}.`;
      }

      case "clear_context_mode": {
        return `Reset context mode to default.`;
      }

      default: {
        const noun = cap?.verbalization?.entityNoun || "item";
        const verb = cap?.verbalization?.actionVerbPast || "processed";
        const title = data?.title || data?.name || noun;
        return `I've ${verb} "${title}".`;
      }
    }
  }

  private formatFailure(result: KernelExecutionResult): string {
    const err = result.error || "";

    // Clean duplicate conflict prompts
    if (err.includes("CONFLICT_REQUIRES_CLARIFICATION:")) {
      return err.replace(/^CONFLICT_REQUIRES_CLARIFICATION:\s*/, "");
    }

    if (err.includes("DUPLICATE_DETECTED:")) {
      return err.replace(/^DUPLICATE_DETECTED:\s*/, "");
    }

    // Clean missing entity errors into natural clarification requests
    if (err.includes("taskId is required") || err.includes("Target entity")) {
      return "Which task would you like me to update?";
    }

    if (err.includes("goalId is required")) {
      return "Which goal are you referring to?";
    }

    if (err.includes("sessionId is required")) {
      return "Which workout session would you like to update?";
    }

    if (err) {
      return `I couldn't complete ${result.actionType.replace("_", " ")}: ${err}`;
    }

    const cap = DOMAIN_CAPABILITIES[result.actionType];
    const noun = cap?.verbalization?.entityNoun || "request";
    return `I wasn't able to complete that ${noun}. Could you clarify the details?`;
  }
}
