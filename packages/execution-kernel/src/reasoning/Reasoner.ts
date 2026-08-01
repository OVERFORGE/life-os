import { Brain } from "../brain/Brain";
import { ExecutionContext } from "../runtime/ExecutionContext";
import { Understanding, createUnderstanding } from "./Understanding";
import { InferenceReasoningStrategy } from "./InferenceReasoningStrategy";
import { WorldSnapshot } from "../world/WorldSnapshot";
import { ConversationSemantics } from "../kernel/ConversationSemantics";

export interface InterpretInput {
  message: string;
  historyText?: string;
  conversationSummary?: string;
  model?: string;
  hasPendingProposal?: boolean;
  activeEntityName?: string;
}

export class Reasoner {
  private brain: Brain;
  private inferenceStrategy: InferenceReasoningStrategy;

  constructor() {
    this.brain = Brain.getInstance();
    this.inferenceStrategy = InferenceReasoningStrategy.getInstance();
  }

  static getInstance(): Reasoner {
    return new Reasoner();
  }

  async interpret(
    input: InterpretInput,
    context: ExecutionContext
  ): Promise<Understanding> {
    // 1. Fetch current WorldSnapshot from Brain facade
    const snapshot = this.brain.world.getSnapshot();

    // 2. Evaluate Inference Reasoning Strategy (LLM-based natural language understanding)
    return await this.evaluateInferenceStrategy(input, context, snapshot);
  }

  /**
   * Native Inference Reasoning Strategy
   * Leverages decoupled LLMProvider for ambiguous natural language interpretation,
   * enriched with conversation summary & history, emitting ConversationSemantics.
   */
  private async evaluateInferenceStrategy(
    input: InterpretInput,
    context: ExecutionContext,
    snapshot: WorldSnapshot
  ): Promise<Understanding> {
    // Combine conversation summary and recent history for complete context
    const fullHistoryContext = [
      input.conversationSummary ? `[Conversation Summary]: ${input.conversationSummary}` : "",
      input.historyText ? `[Recent Dialogue]:\n${input.historyText}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const { intent, confidence, semantics } = await this.inferenceStrategy.infer(
      input.message,
      fullHistoryContext,
      input.model,
      input.hasPendingProposal,
      input.activeEntityName
    );

    const detectedConditions: string[] = snapshot.predictions.map((p) => p.type);

    return createUnderstanding(
      intent,
      confidence,
      detectedConditions,
      {
        rawIntent: intent,
        predictions: snapshot.predictions,
        insights: snapshot.insights,
        suggestions: snapshot.suggestions,
      },
      [],
      intent !== "casual_chat",
      semantics
    );
  }
}
