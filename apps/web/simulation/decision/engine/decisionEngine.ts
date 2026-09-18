import { RuntimeSnapshot, SimulationPersonaDTO } from "../../types";
import { LLMProvider, MockLLMProvider } from "../providers/llmProvider";
import { buildPromptDocument } from "../builder/promptBuilder";
import { parseLLMOutput } from "../parser/structuredParser";
import { DecisionValidator } from "../validator/decisionValidator";
import { DecisionDTO } from "../schema/decisionSchema";
import { DecisionEngineResult, DecisionTrace } from "../contracts/decisionContracts";
import {
  PROMPT_VERSION,
  DECISION_SCHEMA_VERSION,
  DECISION_ENGINE_VERSION,
  DECISION_VALIDATOR_VERSION,
} from "../constants";

export class DecisionEngine {
  private decisionSequenceCounter: number = 0;

  constructor(private provider: LLMProvider = new MockLLMProvider()) {}

  /**
   * Evaluates simulation snapshot & persona to produce a validated, engine-owned DecisionDTO.
   * Deterministic, zero side effects, zero runtime state mutation.
   */
  public async evaluate(
    snapshot: RuntimeSnapshot,
    persona: SimulationPersonaDTO
  ): Promise<DecisionEngineResult> {
    const promptDoc = buildPromptDocument(snapshot, persona);

    try {
      const response = await this.provider.generateCompletion(promptDoc);

      // Step 1: Parser — JSON & Schema Type Validation
      const parseResult = parseLLMOutput(response.rawResponse);
      if (!parseResult.success || !parseResult.data) {
        return {
          success: false,
          decision: null,
          prompt: promptDoc,
          response,
          error: parseResult.error,
          trace: null,
        };
      }

      // Step 2: Validator — Semantic Validation
      const validationResult = DecisionValidator.validate(parseResult.data);
      if (!validationResult.valid) {
        return {
          success: false,
          decision: null,
          prompt: promptDoc,
          response,
          error: validationResult.error,
          trace: null,
        };
      }

      // Step 3: Engine Ownership — Deterministic decisionId generation
      this.decisionSequenceCounter += 1;
      const runUid = snapshot.context.runUid || "RUN_0001";
      const decisionId = `DEC_${runUid}_${snapshot.tick}_${this.decisionSequenceCounter}`;

      // Step 4: Construct DecisionTrace
      const trace: DecisionTrace = {
        promptHash: promptDoc.promptHash,
        provider: response.provider || this.provider.name,
        model: response.model || this.provider.model,
        promptVersion: PROMPT_VERSION,
        schemaVersion: DECISION_SCHEMA_VERSION,
        engineVersion: DECISION_ENGINE_VERSION,
        validatorVersion: DECISION_VALIDATOR_VERSION,
      };

      // Step 5: Construct complete engine-owned DecisionDTO
      const decision: DecisionDTO = {
        decisionId,
        intent: parseResult.data.intent,
        target: parseResult.data.target ?? "self",
        parameters: parseResult.data.parameters ?? {},
        reasoning: parseResult.data.reasoning,
        confidence: parseResult.data.confidence,
        metadata: {
          provider: trace.provider,
          model: trace.model,
          promptVersion: trace.promptVersion,
          schemaVersion: trace.schemaVersion,
          engineVersion: trace.engineVersion,
          validatorVersion: trace.validatorVersion,
          promptHash: trace.promptHash,
        },
      };

      return {
        success: true,
        decision,
        prompt: promptDoc,
        response,
        error: null,
        trace,
      };
    } catch (err: unknown) {
      return {
        success: false,
        decision: null,
        prompt: promptDoc,
        response: null,
        error: {
          code: "SEMANTIC_VALIDATION_FAILED",
          message: err instanceof Error ? err.message : "LLM provider invocation failed.",
        },
        trace: null,
      };
    }
  }
}
