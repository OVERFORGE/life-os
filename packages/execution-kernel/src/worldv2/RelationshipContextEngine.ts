export interface RelationshipSummary {
  personName: string;
  role: string;
  importance: number; // 0.0 to 1.0
  interactionFrequency: "Daily" | "Weekly" | "Occasional";
  executionInfluence: "Positive" | "Neutral" | "Distracting";
  supportLevel: "High" | "Moderate" | "Low";
  summaryText: string;
}

/**
 * RelationshipContextEngine Subsystem
 * 
 * SOLE OWNER of modeling relationship context and execution influence.
 * Zero raw conversation text storage — purely models influence and interaction dynamics.
 */
export class RelationshipContextEngine {
  private static instance: RelationshipContextEngine;

  static getInstance(): RelationshipContextEngine {
    if (!RelationshipContextEngine.instance) {
      RelationshipContextEngine.instance = new RelationshipContextEngine();
    }
    return RelationshipContextEngine.instance;
  }

  getRelationshipContext(): RelationshipSummary[] {
    return [
      {
        personName: "Primary Support Network",
        role: "Family / Partner",
        importance: 0.95,
        interactionFrequency: "Daily",
        executionInfluence: "Positive",
        supportLevel: "High",
        summaryText: "Daily interaction providing strong emotional and operational support.",
      },
    ];
  }
}
