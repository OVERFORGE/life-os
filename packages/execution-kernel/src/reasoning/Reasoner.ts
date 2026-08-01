import { Brain } from "../brain/Brain";
import { ExecutionContext } from "../runtime/ExecutionContext";
import { Understanding, createUnderstanding } from "./Understanding";
import { InferenceReasoningStrategy } from "./InferenceReasoningStrategy";
import { WorldSnapshot } from "../world/WorldSnapshot";

export interface InterpretInput {
  message: string;
  historyText?: string;
  model?: string;
  hasPendingProposal?: boolean;
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

    // 2. Try Deterministic Reasoning Strategy first
    const deterministicUnderstanding = this.evaluateDeterministicStrategy(input, context, snapshot);
    if (deterministicUnderstanding) {
      return deterministicUnderstanding;
    }

    // 3. Fallback to Native Inference Reasoning Strategy (LLM-based interpretation)
    return await this.evaluateInferenceStrategy(input, context, snapshot);
  }

  /**
   * Deterministic Reasoning Strategy
   * Evaluates explicit hard guards and combines WorldSnapshot predictions & insights with conversational context.
   */
  private evaluateDeterministicStrategy(
    input: InterpretInput,
    context: ExecutionContext,
    snapshot: WorldSnapshot
  ): Understanding | null {
    const trimmed = input.message.trim().toLowerCase();

    // Consume prediction types directly from WorldSnapshot
    const detectedConditions: string[] = snapshot.predictions.map((p) => p.type);

    // Hard Guard: Confirm Goal Proposal
    if (
      input.hasPendingProposal &&
      ["yes", "yeah", "yep", "sure", "ok", "confirm", "accept", "do it"].includes(trimmed)
    ) {
      return createUnderstanding(
        "confirm_goal",
        1.0,
        [...detectedConditions, "pending_proposal_active"],
        {
          pendingProposalConfirmed: true,
          predictions: snapshot.predictions,
          insights: snapshot.insights,
          suggestions: snapshot.suggestions,
        },
        ["goal_tracking"]
      );
    }

    // Hard Guard: Direct single-word clear
    if (["clear", "reset"].includes(trimmed)) {
      return createUnderstanding(
        "general_chat",
        1.0,
        detectedConditions,
        {
          predictions: snapshot.predictions,
          insights: snapshot.insights,
          suggestions: snapshot.suggestions,
        },
        [],
        false
      );
    }

    return null;
  }

  /**
   * Native Inference Reasoning Strategy
   * Leverages decoupled LLMProvider for ambiguous natural language interpretation, enriched with WorldSnapshot.
   */
  private async evaluateInferenceStrategy(
    input: InterpretInput,
    context: ExecutionContext,
    snapshot: WorldSnapshot
  ): Promise<Understanding> {
    const { intent, confidence } = await this.inferenceStrategy.infer(
      input.message,
      input.historyText || "",
      input.model,
      input.hasPendingProposal
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
      intent !== "casual_chat"
    );
  }
}
