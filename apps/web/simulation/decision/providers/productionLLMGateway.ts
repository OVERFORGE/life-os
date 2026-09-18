import { DefaultLLMProvider } from "@life-os/execution-kernel";
import { LLMProvider } from "./llmProvider";
import { PromptDocument, LLMResponse } from "../contracts/decisionContracts";

/**
 * ProductionLLMGateway
 * Adapts production kernel's DefaultLLMProvider to Simulation Lab's LLMProvider interface.
 * Vendor-agnostic, zero duplicate clients, zero duplicate API keys.
 */
export class ProductionLLMGateway implements LLMProvider {
  public readonly name: string = "production-llm-gateway";
  public readonly model: string;

  constructor(model: string = "llama-3.1-8b-instant") {
    this.model = model;
  }

  public async generateCompletion(prompt: PromptDocument): Promise<LLMResponse> {
    const userPromptText = [
      prompt.instructionsSection,
      "",
      prompt.outputSchemaSection,
    ].join("\n");

    const rawResponse = await DefaultLLMProvider.getInstance().chat(
      userPromptText,
      prompt.systemPrompt,
      this.model
    );

    return {
      rawResponse,
      provider: this.name,
      model: this.model,
    };
  }
}
