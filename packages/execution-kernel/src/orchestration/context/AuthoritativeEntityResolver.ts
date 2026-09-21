import mongoose from "mongoose";

export interface EntityResolutionRequest {
  userId: string;
  entityType: "task" | "goal";
  rawExpression: string;
  statusFilter?: string; // e.g. "pending"
}

export type EntityResolutionOutcome =
  | { status: "RESOLVED"; entityId: string; title: string; entityType: string }
  | { status: "AMBIGUOUS"; candidateIds: string[]; candidateTitles: string[]; clarificationQuestion: string }
  | { status: "NOT_FOUND"; clarificationQuestion: string };

/**
 * Authoritative Entity Resolution Service
 * 
 * Invariant: Never resolve an ambiguous mutation using first result, highest fuzzy score,
 * or arbitrary ordering.
 * If 1 candidate exists: RESOLVE.
 * If >1 candidates exist: CLARIFY.
 * If 0 candidates exist: CLARIFY.
 */
export class AuthoritativeEntityResolver {
  private static instance: AuthoritativeEntityResolver;

  static getInstance(): AuthoritativeEntityResolver {
    if (!AuthoritativeEntityResolver.instance) {
      AuthoritativeEntityResolver.instance = new AuthoritativeEntityResolver();
    }
    return AuthoritativeEntityResolver.instance;
  }

  async resolveTask(
    userId: string,
    rawExpression: string,
    statusFilter: string = "pending",
    knownTasks?: Array<{ id: string; title: string }>
  ): Promise<EntityResolutionOutcome> {
    const trimmed = (rawExpression || "").trim().toLowerCase();
    if (!trimmed) {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: "Could you specify which task you're referring to?",
      };
    }

    let candidates: Array<{ _id: string; title: string }> = [];

    if (knownTasks && knownTasks.length > 0) {
      candidates = knownTasks
        .filter((t) => {
          const tLower = t.title.toLowerCase();
          return tLower.includes(trimmed) || trimmed.includes(tLower);
        })
        .map((t) => ({ _id: t.id, title: t.title }));
    } else if (mongoose.connection && mongoose.connection.readyState === 1) {
      const { Task } = await import("@/server/db/models/Task");
      const userObjId = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;

      const query: any = { userId: userObjId };
      if (statusFilter) {
        query.status = statusFilter;
      }

      // Escape regex characters
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.title = { $regex: escaped, $options: "i" };

      const dbCandidates = await Task.find(query).select("_id title status").lean();
      candidates = dbCandidates.map((c: any) => ({ _id: c._id.toString(), title: c.title }));
    } else {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: `I couldn't verify tasks for "${rawExpression}" while database is disconnected.`,
      };
    }

    if (candidates.length === 0) {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: `I couldn't find a pending task matching "${rawExpression}". Could you clarify the task title?`,
      };
    }

    // 1. Check for exact title match
    const exactMatches = candidates.filter((c) => c.title.toLowerCase().trim() === trimmed);
    if (exactMatches.length === 1) {
      return {
        status: "RESOLVED",
        entityId: exactMatches[0]._id,
        title: exactMatches[0].title,
        entityType: "task",
      };
    }

    // 2. Single candidate match
    if (candidates.length === 1) {
      return {
        status: "RESOLVED",
        entityId: candidates[0]._id,
        title: candidates[0].title,
        entityType: "task",
      };
    }

    // 3. Ambiguous multiple candidates -> strictly CLARIFY
    const candidateTitles = candidates.map((c) => c.title);
    const candidateIds = candidates.map((c) => c._id);
    const formattedList = candidateTitles.map((t: string) => `"${t}"`).join(" or ");

    return {
      status: "AMBIGUOUS",
      candidateIds,
      candidateTitles,
      clarificationQuestion: `I found multiple tasks matching "${rawExpression}": ${formattedList}. Which one did you mean?`,
    };
  }

  async resolveGoal(
    userId: string,
    rawExpression: string
  ): Promise<EntityResolutionOutcome> {
    const trimmed = (rawExpression || "").trim().toLowerCase();
    if (!trimmed) {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: "Could you specify which goal you're referring to?",
      };
    }

    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: `Cannot resolve goals while database is disconnected.`,
      };
    }

    const { Goal } = await import("@/features/goals/models/Goal");
    const userObjId = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;

    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const candidates = await Goal.find({
      userId: userObjId,
      title: { $regex: escaped, $options: "i" },
    }).select("_id title").lean();

    if (candidates.length === 0) {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: `I couldn't find an active goal matching "${rawExpression}".`,
      };
    }

    if (candidates.length === 1) {
      return {
        status: "RESOLVED",
        entityId: candidates[0]._id.toString(),
        title: candidates[0].title,
        entityType: "goal",
      };
    }

    const candidateTitles = candidates.map((c: any) => c.title);
    const candidateIds = candidates.map((c: any) => c._id.toString());
    const formattedList = candidateTitles.map((t: string) => `"${t}"`).join(" or ");

    return {
      status: "AMBIGUOUS",
      candidateIds,
      candidateTitles,
      clarificationQuestion: `I found multiple goals matching "${rawExpression}": ${formattedList}. Which one did you mean?`,
    };
  }
}
