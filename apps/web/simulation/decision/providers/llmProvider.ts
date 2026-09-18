import { PromptDocument, LLMResponse } from "../contracts/decisionContracts";
import { DecisionIntent } from "../schema/decisionSchema";

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generateCompletion(prompt: PromptDocument): Promise<LLMResponse>;
}

export interface MockProviderConfig {
  intent?: DecisionIntent;
  target?: string;
  parameters?: Record<string, unknown>;
  reasoning?: string;
  confidence?: number;
  rawOverride?: string;
  shouldReturnInvalidJson?: boolean;
}

export class MockLLMProvider implements LLMProvider {
  public readonly name: string = "mock-llm-provider";
  public readonly model: string = "deterministic-v1";

  constructor(private config?: MockProviderConfig) {}

  public async generateCompletion(_prompt: PromptDocument): Promise<LLMResponse> {
    if (this.config?.shouldReturnInvalidJson) {
      return {
        rawResponse: "INVALID_NON_JSON_PROSE_OUTPUT",
        provider: this.name,
        model: this.model,
      };
    }

    if (this.config?.rawOverride) {
      return {
        rawResponse: this.config.rawOverride,
        provider: this.name,
        model: this.model,
      };
    }

    const intent: DecisionIntent = this.config?.intent ?? "WORK_ON_TASK";
    const target = this.config?.target ?? "task_deep_work";
    const parameters = this.config?.parameters ?? { durationMinutes: 60, priority: "HIGH" };
    const reasoning = this.config?.reasoning ?? "Persona peak productivity window aligns with current virtual clock.";
    const confidence = this.config?.confidence ?? 0.95;

    // LLM outputs ONLY intent, target, parameters, reasoning, confidence
    const mockModelOutput = {
      intent,
      target,
      parameters,
      reasoning,
      confidence,
    };

    return {
      rawResponse: JSON.stringify(mockModelOutput, null, 2),
      provider: this.name,
      model: this.model,
    };
  }
}
