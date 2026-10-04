/**
 * RelationshipContracts.ts
 * Authoritative contracts for Interpersonal Relationships & Network Modeling (Phase 5).
 * Strictly typed, zero any.
 */

export interface IRelationshipCommitment {
  commitmentId: string;
  title: string;
  dueTimestamp: number;
  status: "pending" | "completed" | "breached";
}

export interface IRelationshipRecord {
  userId: string;
  entityId: string; // Deterministic or unique: rel-{uuid}
  name: string;
  aliases: string[]; // e.g. ["co-founder", "cofounder", "partner", "investor"]
  role: string;
  importanceScore: number; // 0.0 to 1.0
  interactionCadenceDays: number; // Target days between interactions
  lastInteractedAt: number;
  activeCommitments: IRelationshipCommitment[];
  notes?: string;
}

export interface IRelationshipContextSummary {
  entityId: string;
  personName: string;
  aliases: string[];
  role: string;
  importance: number; // 0.0 to 1.0
  interactionFrequency: "Daily" | "Weekly" | "Occasional";
  executionInfluence: "Positive" | "Neutral" | "Distracting";
  supportLevel: "High" | "Moderate" | "Low";
  lastInteractedAt: number;
  daysSinceLastInteraction: number;
  cadenceStatus: "ON_TRACK" | "APPROACHING_DUE" | "LAPSED";
  activeCommitmentsCount: number;
  summaryText: string;
}
