import { WorldSnapshot } from "./WorldSnapshot";

/**
 * World Context Formatter
 * 
 * Converts WorldSnapshot into prompt-ready context for response generation.
 */
export class WorldContextFormatter {
  static formatForPrompt(snapshot: WorldSnapshot): Record<string, any> {
    return {
      timestamp: snapshot.timestamp,
      userState: snapshot.userState,
      predictions: snapshot.predictions.map((p) => ({ type: p.type, explanation: p.explanation })),
      insights: snapshot.insights.map((i) => ({ type: i.type, summary: i.summary })),
      suggestions: snapshot.suggestions.map((s) => ({ title: s.title, message: s.message })),
      activeEntitiesCount: snapshot.activeEntities.length,
      recentMemoriesCount: snapshot.recentMemories.length,
    };
  }
}
