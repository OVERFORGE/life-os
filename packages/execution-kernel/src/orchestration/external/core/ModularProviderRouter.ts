/**
 * Modular Provider Router (Phase 12)
 * 
 * Deterministic router dispatching capability URNs to isolated provider adapters.
 * Zero fuzzy matching, zero natural language routing.
 */

import { ICapabilityProvider, IProviderContext, IProviderExecutionResult } from "./BaseCapabilityProvider";
import { GoogleCalendarProvider } from "../providers/GoogleCalendarProvider";
import { SpotifyMediaProvider } from "../providers/SpotifyMediaProvider";
import { GitHubProvider } from "../providers/GitHubProvider";
import { WeatherProvider } from "../providers/WeatherProvider";

export class ModularProviderRouter {
  private static instance: ModularProviderRouter;
  private providers: Map<string, ICapabilityProvider> = new Map();
  private urnRoutingTable: Map<string, ICapabilityProvider> = new Map();

  constructor() {
    this.registerProvider(new GoogleCalendarProvider());
    this.registerProvider(new SpotifyMediaProvider());
    this.registerProvider(new GitHubProvider());
    this.registerProvider(new WeatherProvider());
  }

  static getInstance(): ModularProviderRouter {
    if (!ModularProviderRouter.instance) {
      ModularProviderRouter.instance = new ModularProviderRouter();
    }
    return ModularProviderRouter.instance;
  }

  registerProvider(provider: ICapabilityProvider): void {
    this.providers.set(provider.providerId, provider);
    for (const urn of provider.supportedURNs) {
      this.urnRoutingTable.set(urn, provider);
    }
  }

  getProviderForURN(urn: string): ICapabilityProvider | undefined {
    return this.urnRoutingTable.get(urn);
  }

  getProvider(providerId: string): ICapabilityProvider | undefined {
    return this.providers.get(providerId);
  }

  async executeCapability(
    urn: string,
    params: Record<string, unknown>,
    context: IProviderContext
  ): Promise<IProviderExecutionResult> {
    const provider = this.getProviderForURN(urn);
    if (!provider) {
      return {
        executionId: "unsupported",
        providerId: "unknown",
        urn,
        success: false,
        lifecycleState: "EXTERNAL_REJECTED",
        error: `No modular provider registered for capability URN: ${urn}`,
        durationMs: 0,
      };
    }

    return provider.execute(urn, params, context);
  }

  getAllSupportedURNs(): string[] {
    return Array.from(this.urnRoutingTable.keys());
  }
}
