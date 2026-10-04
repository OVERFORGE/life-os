/**
 * Weather Provider (Phase 12)
 * 
 * Modular REST adapter for Weather capabilities.
 */

import { BaseCapabilityProvider, IProviderContext } from "../core/BaseCapabilityProvider";

export class WeatherProvider extends BaseCapabilityProvider {
  readonly providerId = "weather";
  readonly supportedURNs = [
    "environment.weather.current",
    "environment.weather.forecast",
  ];

  validatePayload(urn: string, params: Record<string, unknown>): boolean {
    if (urn === "environment.weather.current" || urn === "environment.weather.forecast") {
      return Boolean(params.location || params.city || params.coordinates);
    }
    return false;
  }

  protected async executeInternal(
    urn: string,
    params: Record<string, unknown>,
    _context: IProviderContext
  ): Promise<{ data?: unknown; partialSuccess?: boolean }> {
    if (params.simulateTimeout) {
      throw new Error("UNKNOWN_EXTERNAL_STATE: Weather service timeout");
    }

    const loc = (params.location as string) || (params.city as string) || "San Francisco";

    switch (urn) {
      case "environment.weather.current":
        return {
          data: {
            location: loc,
            temperatureC: 19,
            condition: "Clear",
            humidityPercent: 62,
          },
        };

      case "environment.weather.forecast":
        return {
          data: {
            location: loc,
            forecast: [
              { day: "Today", highC: 21, lowC: 14, condition: "Sunny" },
              { day: "Tomorrow", highC: 20, lowC: 13, condition: "Partly Cloudy" },
            ],
          },
        };

      default:
        throw new Error(`Unsupported URN: ${urn}`);
    }
  }
}
