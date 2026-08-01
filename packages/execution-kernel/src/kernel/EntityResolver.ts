import { SemanticEntityReference } from "./ConversationSemantics";
import { WorldSnapshot } from "../world/WorldSnapshot";
import { Task } from "@/server/db/models/Task";
import { GoalProposal } from "@/server/db/models/GoalProposal";

export interface ConcreteEntity {
  type: string;
  id: string; // Concrete DB ID — generated here only
  name: string;
  source: "stm" | "world" | "db";
  rawPayload?: any;
}

export interface ShortTermMemoryState {
  activeEntity?: {
    type: string;
    id: string;
    name: string;
    lastMentionedAt?: Date;
  } | null;
  pendingConfirmations?: any[];
  currentWorkflow?: string | null;
  [key: string]: any;
}

/**
 * EntityResolver
 * 
 * SOLE OWNER of semantic reference resolution.
 * Converts natural language semantic references (e.g., "sleep goal", "the workout task")
 * into concrete database entities.
 * 
 * ARCHITECTURAL RULE:
 * The Reasoner NEVER touches database IDs. EntityResolver is the ONLY subsystem
 * that resolves database IDs.
 */
export class EntityResolver {
  private static instance: EntityResolver;

  static getInstance(): EntityResolver {
    if (!EntityResolver.instance) {
      EntityResolver.instance = new EntityResolver();
    }
    return EntityResolver.instance;
  }

  /**
   * Resolves a semantic entity reference against STM active entity, WorldSnapshot, and DB queries.
   */
  async resolve(
    ref: SemanticEntityReference | null,
    stm: ShortTermMemoryState | null,
    snapshot: WorldSnapshot | null,
    userId: string
  ): Promise<ConcreteEntity | null> {
    if (!ref) return null;

    const mentionLower = (ref.mention || "").toLowerCase().trim();
    const typeLower = (ref.type || "").toLowerCase().trim();

    // Priority 1: STM activeEntity (if mention refers to active entity or recency is "active")
    if (stm?.activeEntity) {
      const active = stm.activeEntity;
      const activeNameLower = (active.name || "").toLowerCase();
      const activeTypeLower = (active.type || "").toLowerCase();

      const isTypeMatch = !typeLower || activeTypeLower.includes(typeLower) || typeLower.includes(activeTypeLower);
      const isMentionMatch =
        ref.recency === "active" ||
        mentionLower === "it" ||
        mentionLower === "that" ||
        mentionLower === "this" ||
        activeNameLower.includes(mentionLower) ||
        mentionLower.includes(activeNameLower);

      if (isTypeMatch && isMentionMatch) {
        console.log(`🔍 [ENTITY_RESOLVER] Resolved from STM Active Entity: "${active.name}" (${active.id})`);
        return {
          type: active.type,
          id: active.id,
          name: active.name,
          source: "stm",
        };
      }
    }

    // Priority 2: WorldSnapshot activeEntities
    if (snapshot?.activeEntities && snapshot.activeEntities.length > 0) {
      for (const entity of snapshot.activeEntities) {
        const entityName: string = (entity.attributes?.name as string) || (entity.attributes?.title as string) || "";
        const nameLower = entityName.toLowerCase();
        const eTypeLower = (entity.type || "").toLowerCase();

        const isTypeMatch = !typeLower || eTypeLower.includes(typeLower) || typeLower.includes(eTypeLower);
        const isMentionMatch =
          nameLower.includes(mentionLower) || mentionLower.includes(nameLower);

        if (isTypeMatch && isMentionMatch && nameLower) {
          console.log(`🔍 [ENTITY_RESOLVER] Resolved from WorldSnapshot: "${entityName}" (${entity.id})`);
          return {
            type: entity.type,
            id: entity.id,
            name: entityName,
            source: "world",
          };
        }
      }
    }

    // Priority 3: Database Lookup by Type and Name/Title prefix
    try {
      if (typeLower.includes("task") || typeLower === "todo") {
        const task = await Task.findOne({
          userId,
          title: { $regex: mentionLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
        }).lean();

        if (task) {
          console.log(`🔍 [ENTITY_RESOLVER] Resolved Task from DB: "${(task as any).title}" (${(task as any)._id})`);
          return {
            type: "task",
            id: (task as any)._id.toString(),
            name: (task as any).title,
            source: "db",
            rawPayload: task,
          };
        }
      }

      if (typeLower.includes("goal")) {
        const proposal = await GoalProposal.findOne({
          userId,
          status: "pending",
        })
          .sort({ createdAt: -1 })
          .lean();

        if (proposal) {
          console.log(`🔍 [ENTITY_RESOLVER] Resolved Goal Proposal from DB: "${(proposal as any).title}" (${(proposal as any)._id})`);
          return {
            type: "goal_proposal",
            id: (proposal as any)._id.toString(),
            name: (proposal as any).title,
            source: "db",
            rawPayload: proposal,
          };
        }
      }
    } catch (err) {
      console.error("Error during DB entity resolution:", err);
    }

    console.log(`⚠️ [ENTITY_RESOLVER] Could not resolve entity for mention: "${ref.mention}" (type: ${ref.type})`);
    return null;
  }
}
