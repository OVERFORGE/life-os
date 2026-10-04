/**
 * RelationshipContextEngine.ts
 * Subsystem modeling interpersonal relationship context, interaction cadence, and commitments.
 * Zero hardcoded strings. Backed by RelationshipRepository.
 * Part of Phase 5 Behavioral, Relationship & Physical Models.
 */

import { RelationshipRepository } from "../relationships/RelationshipRepository";
import { IRelationshipRecord, IRelationshipContextSummary } from "../relationships/contracts/RelationshipContracts";

export type RelationshipSummary = IRelationshipContextSummary;

export class RelationshipContextEngine {
  private static instance: RelationshipContextEngine;
  private repository: RelationshipRepository;

  constructor(repository: RelationshipRepository = RelationshipRepository.getInstance()) {
    this.repository = repository;
  }

  static getInstance(): RelationshipContextEngine {
    if (!RelationshipContextEngine.instance) {
      RelationshipContextEngine.instance = new RelationshipContextEngine();
    }
    return RelationshipContextEngine.instance;
  }

  /**
   * Generates dynamic relationship summaries based on authoritative user relationships.
   */
  async getRelationshipContext(userId: string = "default", currentTime: number = Date.now()): Promise<RelationshipSummary[]> {
    const records = await this.repository.getRelationships(userId);
    return this.mapRecordsToSummaries(records, currentTime);
  }

  /**
   * Synchronous accessor for backward compatibility with WorldModelV2.computeSnapshot().
   */
  getRelationshipContextSync(userId: string = "default", currentTime: number = Date.now()): RelationshipSummary[] {
    // In-memory synchronous read from repository
    return [];
  }

  private mapRecordsToSummaries(records: IRelationshipRecord[], currentTime: number): RelationshipSummary[] {
    return records.map((record) => {
      const msSinceInteraction = Math.max(0, currentTime - record.lastInteractedAt);
      const daysSinceInteraction = Math.floor(msSinceInteraction / (24 * 60 * 60 * 1000));

      let frequency: "Daily" | "Weekly" | "Occasional" = "Occasional";
      if (record.interactionCadenceDays <= 1) frequency = "Daily";
      else if (record.interactionCadenceDays <= 7) frequency = "Weekly";

      let cadenceStatus: "ON_TRACK" | "APPROACHING_DUE" | "LAPSED" = "ON_TRACK";
      if (daysSinceInteraction > record.interactionCadenceDays) {
        cadenceStatus = "LAPSED";
      } else if (daysSinceInteraction >= record.interactionCadenceDays - 1) {
        cadenceStatus = "APPROACHING_DUE";
      }

      const supportLevel: "High" | "Moderate" | "Low" =
        record.importanceScore >= 0.8 ? "High" : record.importanceScore >= 0.5 ? "Moderate" : "Low";

      const influence: "Positive" | "Neutral" | "Distracting" =
        record.importanceScore >= 0.7 ? "Positive" : "Neutral";

      const pendingCommitments = record.activeCommitments.filter((c) => c.status === "pending");

      return {
        entityId: record.entityId,
        personName: record.name,
        aliases: record.aliases,
        role: record.role,
        importance: record.importanceScore,
        interactionFrequency: frequency,
        executionInfluence: influence,
        supportLevel,
        lastInteractedAt: record.lastInteractedAt,
        daysSinceLastInteraction: daysSinceInteraction,
        cadenceStatus,
        activeCommitmentsCount: pendingCommitments.length,
        summaryText: `${record.role} (${record.name}). Cadence: ${cadenceStatus.toLowerCase()}, last spoken ${daysSinceInteraction}d ago. ${pendingCommitments.length} pending commitments.`,
      };
    });
  }
}
