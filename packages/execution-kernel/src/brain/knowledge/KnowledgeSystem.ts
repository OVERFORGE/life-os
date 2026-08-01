import { Entity } from "./Entity";
import { Fact } from "./Fact";
import { Relationship } from "./Relationship";

/**
 * KnowledgeSystem Storage Layer
 * 
 * ARCHITECTURAL DESIGN NOTE:
 * This API is intentionally kept minimal (setEntity, getEntity, addFact, getFactsForEntity, addRelationship).
 * Advanced querying, filtering, pattern matching, and graph traversal belong to future cognitive phases.
 * The Knowledge System serves exclusively as a clean, lightweight storage engine for Phase 3.
 */
export class KnowledgeSystem {
  private entities: Map<string, Entity> = new Map();
  private facts: Map<string, Fact[]> = new Map();
  private relationships: Relationship[] = [];

  setEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
  }

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  addFact(fact: Fact): void {
    if (!this.facts.has(fact.entityId)) {
      this.facts.set(fact.entityId, []);
    }
    this.facts.get(fact.entityId)!.push(fact);
  }

  getFactsForEntity(entityId: string): Fact[] {
    return this.facts.get(entityId) || [];
  }

  addRelationship(relationship: Relationship): void {
    this.relationships.push(relationship);
  }

  getRelationshipsForEntity(entityId: string): Relationship[] {
    return this.relationships.filter(
      (r) => r.sourceEntityId === entityId || r.targetEntityId === entityId
    );
  }
}
