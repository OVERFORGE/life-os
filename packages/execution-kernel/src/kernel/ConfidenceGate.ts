import { ConversationSemantics } from "./ConversationSemantics";
import { ConcreteEntity } from "./EntityResolver";

export const MUTATION_CONFIDENCE_THRESHOLD = 0.8;

export type GateResult =
  | { pass: true }
  | { pass: false; clarificationPrompt: string };

/**
 * ConfidenceGate
 * 
 * Safety evaluation step before state-changing mutations execute.
 * If a request intends to modify or delete user state (isMutation = true) and has low confidence (< 0.80)
 * or ambiguous entity resolution, it blocks execution and requests user clarification.
 */
export class ConfidenceGate {
  private static instance: ConfidenceGate;

  static getInstance(): ConfidenceGate {
    if (!ConfidenceGate.instance) {
      ConfidenceGate.instance = new ConfidenceGate();
    }
    return ConfidenceGate.instance;
  }

  evaluate(
    semantics: ConversationSemantics,
    resolvedEntity: ConcreteEntity | null
  ): GateResult {
    // 1. Non-mutating requests always pass
    if (!semantics.isMutation) {
      return { pass: true };
    }

    // 2. Check confidence threshold for mutation intents
    if (semantics.confidence < MUTATION_CONFIDENCE_THRESHOLD) {
      console.warn(
        `🛡️ [CONFIDENCE_GATE] Blocked mutation due to low confidence (${semantics.confidence.toFixed(2)} < ${MUTATION_CONFIDENCE_THRESHOLD})`
      );

      return {
        pass: false,
        clarificationPrompt:
          "I want to make sure I get this right. Could you please clarify which item or action you'd like me to update or remove?",
      };
    }

    // 3. Check for missing entity resolution on delete/update intents
    if (
      (semantics.conversationIntent === "delete_entity" ||
        semantics.conversationIntent === "update_entity") &&
      !resolvedEntity
    ) {
      console.warn(
        `🛡️ [CONFIDENCE_GATE] Blocked ${semantics.conversationIntent} because target entity could not be resolved cleanly.`
      );

      return {
        pass: false,
        clarificationPrompt:
          "I'm not completely sure which specific item you are referring to. Could you specify the exact title or goal name?",
      };
    }

    return { pass: true };
  }
}
