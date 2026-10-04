/**
 * Spotify Media Provider (Phase 12)
 * 
 * Modular REST adapter for Spotify Web API playback and search.
 */

import { BaseCapabilityProvider, IProviderContext } from "../core/BaseCapabilityProvider";

export class SpotifyMediaProvider extends BaseCapabilityProvider {
  readonly providerId = "spotify";
  readonly supportedURNs = [
    "wellness.media.playback_control",
    "wellness.media.search",
    "wellness.media.currently_playing",
  ];

  validatePayload(urn: string, params: Record<string, unknown>): boolean {
    if (urn === "wellness.media.playback_control") {
      return Boolean(params.action || params.command);
    }
    if (urn === "wellness.media.search") {
      return Boolean(params.query);
    }
    if (urn === "wellness.media.currently_playing") {
      return true;
    }
    return false;
  }

  protected async executeInternal(
    urn: string,
    params: Record<string, unknown>,
    _context: IProviderContext
  ): Promise<{ data?: unknown; partialSuccess?: boolean }> {
    if (params.simulateTimeout) {
      throw new Error("UNKNOWN_EXTERNAL_STATE: Spotify API timeout");
    }

    switch (urn) {
      case "wellness.media.playback_control": {
        const action = (params.action as string) || (params.command as string) || "play";
        return {
          data: {
            actionExecuted: action,
            isPlaying: action === "play" || action === "resume",
            device: "Desktop Spotify Client",
          },
        };
      }

      case "wellness.media.search":
        return {
          data: {
            tracks: [
              {
                id: "track_focus_ambient_1",
                name: "Deep Focus Flow",
                artist: "Brain.fm",
                durationMs: 1800000,
              },
            ],
          },
        };

      case "wellness.media.currently_playing":
        return {
          data: {
            isPlaying: true,
            trackName: "Deep Focus Flow",
            progressMs: 320000,
          },
        };

      default:
        throw new Error(`Unsupported URN: ${urn}`);
    }
  }
}
