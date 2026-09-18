import { LLMProvider } from "../../shared/llmAdapter";

export interface MockLLMRoute {
  pattern: RegExp | string;
  response?: string | object;
  delayMs?: number;
  error?: Error;
}

/**
 * Deterministic Mock LLM Provider for Unit & Integration Testing
 * Allows routing prompts to predetermined structured JSON responses without network calls.
 */
export class MockLLMProvider implements LLMProvider {
  private routes: MockLLMRoute[] = [];
  private fallbackResponse: string = "{}";
  public invocationHistory: Array<{ prompt: string; systemPrompt: string; model?: string }> = [];

  constructor(routes: MockLLMRoute[] = [], fallback: string = "{}") {
    this.routes = routes;
    this.fallbackResponse = fallback;
  }

  addRoute(route: MockLLMRoute): this {
    this.routes.unshift(route); // Prepend so latest routes take precedence
    return this;
  }

  setFallback(response: string | object): this {
    this.fallbackResponse = typeof response === "string" ? response : JSON.stringify(response);
    return this;
  }

  clearHistory(): void {
    this.invocationHistory = [];
  }

  async chat(prompt: string, systemPrompt: string, model?: string): Promise<string> {
    this.invocationHistory.push({ prompt, systemPrompt, model });

    const combinedText = `${systemPrompt}\n${prompt}`;

    for (const route of this.routes) {
      const matches = typeof route.pattern === "string"
        ? combinedText.includes(route.pattern)
        : route.pattern.test(combinedText);

      if (matches) {
        if (route.delayMs && route.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, route.delayMs));
        }

        if (route.error) {
          throw route.error;
        }

        return typeof route.response === "string"
          ? route.response
          : JSON.stringify(route.response);
      }
    }

    return this.fallbackResponse;
  }
}
