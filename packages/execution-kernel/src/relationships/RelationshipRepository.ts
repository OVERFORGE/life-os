/**
 * RelationshipRepository.ts
 * Authoritative data access for interpersonal connections, roles, and commitments.
 * Supports high-speed in-memory caching and MongoDB persistence.
 * Part of Phase 5 Behavioral, Relationship & Physical Models.
 */

import mongoose from "mongoose";
import { IRelationshipRecord } from "./contracts/RelationshipContracts";
import { RelationshipModel } from "../server/db/models/RelationshipModel";

export class RelationshipRepository {
  private static instance: RelationshipRepository;
  private cache: Map<string, Map<string, IRelationshipRecord>> = new Map();

  static getInstance(): RelationshipRepository {
    if (!RelationshipRepository.instance) {
      RelationshipRepository.instance = new RelationshipRepository();
    }
    return RelationshipRepository.instance;
  }

  public async getRelationships(userId: string): Promise<IRelationshipRecord[]> {
    const userMap = await this.getOrHydrate(userId);
    return Array.from(userMap.values());
  }

  public async getRelationshipById(userId: string, entityId: string): Promise<IRelationshipRecord | null> {
    const userMap = await this.getOrHydrate(userId);
    return userMap.get(entityId) || null;
  }

  /**
   * Resolves contact by normalized name or alias without regex.
   * If single match, returns the contact. If multiple matches or none, returns null.
   */
  public async findContactByAliasOrName(userId: string, query: string): Promise<IRelationshipRecord | null> {
    const candidates = await this.findAmbiguousContacts(userId, query);
    if (candidates.length === 1) {
      return candidates[0];
    }
    return null;
  }

  /**
   * Finds all matching contacts for a query string by name or aliases.
   */
  public async findAmbiguousContacts(userId: string, query: string): Promise<IRelationshipRecord[]> {
    const userMap = await this.getOrHydrate(userId);
    const normalized = query.trim().toLowerCase();

    const matches: IRelationshipRecord[] = [];
    for (const record of userMap.values()) {
      const nameMatch = record.name.toLowerCase() === normalized;
      const aliasMatch = record.aliases.some((a) => a.toLowerCase() === normalized);

      // Check partial / substring containment without regex
      const partialNameMatch = record.name.toLowerCase().includes(normalized);

      if (nameMatch || aliasMatch || partialNameMatch) {
        matches.push(record);
      }
    }

    return matches;
  }

  /**
   * Saves or updates a relationship record.
   */
  public async saveRelationship(record: IRelationshipRecord): Promise<void> {
    const userMap = await this.getOrHydrate(record.userId);
    userMap.set(record.entityId, record);

    if (mongoose.connection.readyState === 1) {
      try {
        await RelationshipModel.updateOne(
          { userId: record.userId, entityId: record.entityId },
          { $set: record },
          { upsert: true }
        );
      } catch (err) {
        console.warn(`[RelationshipRepository] DB save failed: ${err}`);
      }
    }
  }

  /**
   * Records an interaction with a contact, resetting cadence timer.
   */
  public async recordInteraction(userId: string, entityId: string, timestamp: number = Date.now()): Promise<void> {
    const userMap = await this.getOrHydrate(userId);
    const record = userMap.get(entityId);
    if (record) {
      record.lastInteractedAt = timestamp;
      await this.saveRelationship(record);
    }
  }

  public clearMemoryCache(): void {
    this.cache.clear();
  }

  private async getOrHydrate(userId: string): Promise<Map<string, IRelationshipRecord>> {
    let userMap = this.cache.get(userId);
    if (userMap) return userMap;

    userMap = new Map<string, IRelationshipRecord>();
    this.cache.set(userId, userMap);

    if (mongoose.connection.readyState === 1) {
      try {
        const docs = await RelationshipModel.find({ userId }).lean().exec();
        for (const doc of docs) {
          userMap.set(doc.entityId, {
            userId: doc.userId,
            entityId: doc.entityId,
            name: doc.name,
            aliases: doc.aliases || [],
            role: doc.role,
            importanceScore: doc.importanceScore,
            interactionCadenceDays: doc.interactionCadenceDays,
            lastInteractedAt: doc.lastInteractedAt,
            activeCommitments: (doc.activeCommitments || []) as any,
            notes: doc.notes,
          });
        }
      } catch (err) {
        // Fall back to empty map
      }
    }

    return userMap;
  }
}
