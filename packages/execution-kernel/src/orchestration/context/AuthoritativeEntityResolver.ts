import mongoose from "mongoose";
import {
  EntityResolutionStatus,
  ResolutionMethod,
  EntityResolutionEvidence,
  IContextEntityRef,
  SemanticReferenceKind,
} from "../contracts/SemanticTurnContracts";

export interface EntityResolutionRequest {
  userId: string;
  rawExpression: string;
  semanticDescriptor?: string;
  kind?: SemanticReferenceKind;
  contextualRelation?: "ACTIVE_FOCUS" | "PENDING_OPERATION" | "RECENT_OPERATION" | "GENERAL_SEARCH";
  entityType?: "task" | "goal" | "workout" | "meal" | "activity" | "weight" | "context_mode" | "schedule_block";
  statusFilter?: string; // e.g. "pending"
  activeFocus?: IContextEntityRef | null;
  recentEntities?: IContextEntityRef[];
  pendingCandidates?: Array<{ entityId: string; displayName: string; temporalAnchor?: string }>;
  knownTasks?: Array<{ id: string; title: string }>;
  temporalFilter?: string;
}

export type EntityResolutionOutcome =
  | {
      status: "RESOLVED";
      entityId: string;
      title: string;
      entityType: string;
      candidateIds?: string[];
      candidateTitles?: string[];
      clarificationQuestion?: string;
      evidence?: EntityResolutionEvidence;
    }
  | {
      status: "AMBIGUOUS";
      entityId?: string;
      title?: string;
      entityType?: string;
      candidateIds: string[];
      candidateTitles: string[];
      clarificationQuestion: string;
      evidence?: EntityResolutionEvidence;
    }
  | {
      status: "NOT_FOUND";
      entityId?: string;
      title?: string;
      entityType?: string;
      candidateIds?: string[];
      candidateTitles?: string[];
      clarificationQuestion: string;
      evidence?: EntityResolutionEvidence;
    }
  | {
      status: "UNRESOLVED";
      entityId?: string;
      title?: string;
      entityType?: string;
      candidateIds?: string[];
      candidateTitles?: string[];
      clarificationQuestion?: string;
      evidence?: EntityResolutionEvidence;
    };

/**
 * Authoritative Entity Resolution Service
 * 
 * Invariant S-4: Material Ambiguity Safety. Never silently pick an entity by recency
 * when meaningful ambiguity remains.
 * Resolution precedence:
 * 1. Active Pending Operation Candidates (scoped to pending clarification)
 * 2. STM Active Focus (when user expression aligns with active focus)
 * 3. Authoritative DB match (exact or single candidate)
 * 4. Disambiguation (temporal/status differentiation; if materially ambiguous, strictly CLARIFY)
 */
export class AuthoritativeEntityResolver {
  private static instance: AuthoritativeEntityResolver;

  static getInstance(): AuthoritativeEntityResolver {
    if (!AuthoritativeEntityResolver.instance) {
      AuthoritativeEntityResolver.instance = new AuthoritativeEntityResolver();
    }
    return AuthoritativeEntityResolver.instance;
  }

  async resolveEntity(req: EntityResolutionRequest): Promise<EntityResolutionOutcome> {
    const type = req.entityType || "task";
    switch (type) {
      case "goal":
        return this.resolveGoal(req.userId, req.rawExpression, {
          activeFocus: req.activeFocus,
          recentEntities: req.recentEntities,
          pendingCandidates: req.pendingCandidates,
          semanticDescriptor: req.semanticDescriptor,
          kind: req.kind,
          contextualRelation: req.contextualRelation,
        });
      case "workout":
        return this.resolveWorkout(req.userId, req.rawExpression, {
          activeFocus: req.activeFocus,
          recentEntities: req.recentEntities,
          pendingCandidates: req.pendingCandidates,
        });
      case "task":
      default:
        return this.resolveTask(
          req.userId,
          req.rawExpression,
          req.statusFilter || "pending",
          req.knownTasks,
          {
            activeFocus: req.activeFocus,
            recentEntities: req.recentEntities,
            pendingCandidates: req.pendingCandidates,
            semanticDescriptor: req.semanticDescriptor,
            kind: req.kind,
            contextualRelation: req.contextualRelation,
          }
        );
    }
  }

  async resolveTask(
    userId: string,
    rawExpression: string,
    statusFilter: string = "pending",
    knownTasks?: Array<{ id: string; title: string }>,
    context?: {
      activeFocus?: IContextEntityRef | null;
      recentEntities?: IContextEntityRef[];
      pendingCandidates?: Array<{ entityId: string; displayName: string; temporalAnchor?: string }>;
      semanticDescriptor?: string;
      kind?: SemanticReferenceKind;
      contextualRelation?: "ACTIVE_FOCUS" | "PENDING_OPERATION" | "RECENT_OPERATION" | "GENERAL_SEARCH";
    }
  ): Promise<EntityResolutionOutcome> {
    const trimmed = (rawExpression || "").trim().toLowerCase();
    if (!trimmed && !context?.semanticDescriptor) {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: "Could you specify which task you're referring to?",
        evidence: {
          status: "NOT_FOUND",
          method: "AUTHORITATIVE_EXACT_MATCH",
          confidence: 0,
          evidenceDetails: {},
          clarificationReason: "Empty task reference expression",
        },
      };
    }

    const cleanExpr = trimmed
      .replace(/^(?:the|a|an|my|that|this)\s+/i, "")
      .replace(/^(?:task\s+(?:to\s+)?)/i, "")
      .trim();

    const searchTerm = (context?.semanticDescriptor || cleanExpr || trimmed).toLowerCase().trim();

    // 1. Check Pending Operation Candidates (Continuation Precedence)
    if (context?.pendingCandidates && context.pendingCandidates.length > 0) {
      const pendingMatch = context.pendingCandidates.find((c) => {
        const dLower = c.displayName.toLowerCase();
        return (
          dLower === trimmed ||
          dLower === searchTerm ||
          dLower.includes(searchTerm) ||
          searchTerm.includes(dLower)
        );
      });
      if (pendingMatch) {
        return {
          status: "RESOLVED",
          entityId: pendingMatch.entityId,
          title: pendingMatch.displayName,
          entityType: "task",
          evidence: {
            status: "RESOLVED",
            selectedEntityId: pendingMatch.entityId,
            selectedDisplayName: pendingMatch.displayName,
            method: "PENDING_OPERATION_CANDIDATE",
            confidence: 0.98,
            evidenceDetails: { domainMatch: true },
          },
        };
      }
    }

    // 2. Check STM Active Focus (Contextual Anaphora Precedence)
    const isAnaphoric =
      context?.kind === "CONTEXTUAL_ANAPHORIC" ||
      context?.contextualRelation === "ACTIVE_FOCUS" ||
      /^(?:that|this|the|it|that\s+one|the\s+one)(?:\s+task)?$/i.test(trimmed) ||
      trimmed.includes("that task") ||
      trimmed.includes("this task") ||
      trimmed === "it" ||
      trimmed === "that";

    if (context?.activeFocus && context.activeFocus.entityType === "task") {
      const focusTitleLower = context.activeFocus.displayName.toLowerCase();
      const matchesFocus =
        isAnaphoric ||
        focusTitleLower === trimmed ||
        focusTitleLower === searchTerm ||
        focusTitleLower.includes(searchTerm) ||
        searchTerm.includes(focusTitleLower);
      if (matchesFocus) {
        return {
          status: "RESOLVED",
          entityId: context.activeFocus.entityId,
          title: context.activeFocus.displayName,
          entityType: "task",
          evidence: {
            status: "RESOLVED",
            selectedEntityId: context.activeFocus.entityId,
            selectedDisplayName: context.activeFocus.displayName,
            method: "STM_ACTIVE_FOCUS",
            confidence: 0.95,
            evidenceDetails: { domainMatch: true },
          },
        };
      }
    }

    // 3. Query Active Candidates (knownTasks or live MongoDB)
    let candidates: Array<{ _id: string; title: string; dueDate?: string; dueTime?: string }> = [];

    if (knownTasks && knownTasks.length > 0) {
      candidates = knownTasks
        .filter((t) => {
          const tLower = t.title.toLowerCase();
          return (
            tLower.includes(searchTerm) ||
            searchTerm.includes(tLower) ||
            tLower.includes(trimmed)
          );
        })
        .map((t) => ({ _id: t.id, title: t.title, dueDate: (t as any).dueDate, dueTime: (t as any).dueTime }));
    } else if (mongoose.connection && mongoose.connection.readyState === 1) {
      const { Task } = await import("@/server/db/models/Task");
      const userObjId = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;

      const query: any = { userId: { $in: [userId, userObjId] } };
      if (statusFilter) {
        query.status = statusFilter;
      }

      // If anaphoric reference and no active focus matched, return all recent pending tasks
      if (!isAnaphoric) {
        const queryTerm = searchTerm.length > 0 ? searchTerm : trimmed;
        const escaped = queryTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.title = { $regex: escaped, $options: "i" };
      }

      const dbCandidates = await Task.find(query)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(10)
        .select("_id title status dueDate dueTime")
        .lean();

      candidates = dbCandidates.map((c: any) => ({
        _id: c._id.toString(),
        title: c.title,
        dueDate: c.dueDate,
        dueTime: c.dueTime,
      }));
    } else {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: `I couldn't verify tasks for "${rawExpression}" while database is disconnected.`,
        evidence: {
          status: "NOT_FOUND",
          method: "AUTHORITATIVE_EXACT_MATCH",
          confidence: 0,
          evidenceDetails: {},
          clarificationReason: "Database disconnected",
        },
      };
    }

    if (candidates.length === 0) {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: `I couldn't find a pending task matching "${rawExpression}". Could you clarify the task title?`,
        evidence: {
          status: "NOT_FOUND",
          method: "AUTHORITATIVE_EXACT_MATCH",
          confidence: 0,
          evidenceDetails: {},
          clarificationReason: `No pending task found matching "${rawExpression}"`,
        },
      };
    }

    // 4. Single candidate match
    if (candidates.length === 1) {
      return {
        status: "RESOLVED",
        entityId: candidates[0]._id,
        title: candidates[0].title,
        entityType: "task",
        evidence: {
          status: "RESOLVED",
          selectedEntityId: candidates[0]._id,
          selectedDisplayName: candidates[0].title,
          method: "AUTHORITATIVE_EXACT_MATCH",
          confidence: 0.90,
          evidenceDetails: { matchedField: "title" },
        },
      };
    }

    // 5. Evaluate Exact Matches
    const exactMatches = candidates.filter((c) => {
      const cLower = c.title.toLowerCase().trim();
      return cLower === trimmed || cLower === searchTerm;
    });
    if (exactMatches.length === 1) {
      return {
        status: "RESOLVED",
        entityId: exactMatches[0]._id,
        title: exactMatches[0].title,
        entityType: "task",
        evidence: {
          status: "RESOLVED",
          selectedEntityId: exactMatches[0]._id,
          selectedDisplayName: exactMatches[0].title,
          method: "AUTHORITATIVE_EXACT_MATCH",
          confidence: 0.95,
          evidenceDetails: { matchedField: "title" },
        },
      };
    }

    // 6. Multiple candidates: check STM Active Focus or Duplicate Consolidation
    if (context?.activeFocus) {
      const activeMatch = candidates.find((c) => c._id === context.activeFocus?.entityId);
      if (activeMatch) {
        return {
          status: "RESOLVED",
          entityId: activeMatch._id,
          title: activeMatch.title,
          entityType: "task",
          evidence: {
            status: "RESOLVED",
            selectedEntityId: activeMatch._id,
            selectedDisplayName: activeMatch.title,
            method: "STM_ACTIVE_FOCUS",
            confidence: 0.92,
            evidenceDetails: { domainMatch: true },
          },
        };
      }
    }

    // Check if candidates are identical duplicates (same title and date)
    const titlesAreIdentical = candidates.every((c) => c.title.toLowerCase().trim() === candidates[0].title.toLowerCase().trim());
    if (titlesAreIdentical) {
      // Identical titles: check if temporal parameters differentiate them
      const timesDifferentiate = candidates.some((c) => c.dueTime && c.dueTime !== candidates[0].dueTime);
      if (timesDifferentiate) {
        // Material ambiguity: multiple tasks with same title at different times
        const candidateTitles = candidates.map((c) => `${c.title} (${c.dueTime || "no time"})`);
        const candidateIds = candidates.map((c) => c._id);
        const formattedList = candidateTitles.map((t) => `"${t}"`).join(" or ");
        return {
          status: "AMBIGUOUS",
          candidateIds,
          candidateTitles,
          clarificationQuestion: `I found multiple tasks with that title at different times: ${formattedList}. Which one did you mean?`,
          evidence: {
            status: "AMBIGUOUS",
            candidateIds,
            candidateTitles,
            method: "AMBIGUOUS_MULTI_CANDIDATE",
            confidence: 0.5,
            evidenceDetails: { matchedField: "dueTime" },
            clarificationReason: "Multiple identical-title tasks at different times",
          },
        };
      }

      // Exact identical duplicates on same slot: consolidate to the first/oldest pending instance
      return {
        status: "RESOLVED",
        entityId: candidates[0]._id,
        title: candidates[0].title,
        entityType: "task",
        evidence: {
          status: "RESOLVED",
          selectedEntityId: candidates[0]._id,
          selectedDisplayName: candidates[0].title,
          method: "AUTHORITATIVE_EXACT_MATCH",
          confidence: 0.85,
          evidenceDetails: { matchedField: "duplicate_consolidation" },
        },
      };
    }

    // 7. Materially Ambiguous distinct candidates -> strictly CLARIFY
    const candidateTitles = Array.from(new Set(candidates.map((c) => c.title)));
    const candidateIds = candidates.map((c) => c._id);
    const formattedList = candidateTitles.map((t) => `"${t}"`).join(" or ");

    return {
      status: "AMBIGUOUS",
      candidateIds,
      candidateTitles,
      clarificationQuestion: `I found multiple tasks matching "${rawExpression}": ${formattedList}. Which one did you mean?`,
      evidence: {
        status: "AMBIGUOUS",
        candidateIds,
        candidateTitles,
        method: "AMBIGUOUS_MULTI_CANDIDATE",
        confidence: 0.5,
        evidenceDetails: {},
        clarificationReason: "Multiple materially distinct candidate tasks matched without disambiguating criteria",
      },
    };
  }

  async resolveGoal(
    userId: string,
    rawExpression: string,
    context?: {
      activeFocus?: IContextEntityRef | null;
      recentEntities?: IContextEntityRef[];
      pendingCandidates?: Array<{ entityId: string; displayName: string }>;
      semanticDescriptor?: string;
      kind?: SemanticReferenceKind;
      contextualRelation?: "ACTIVE_FOCUS" | "PENDING_OPERATION" | "RECENT_OPERATION" | "GENERAL_SEARCH";
      statusFilter?: string;
    }
  ): Promise<EntityResolutionOutcome> {
    const trimmed = (rawExpression || "").trim().toLowerCase();
    const searchTerm = (context?.semanticDescriptor || trimmed).toLowerCase().trim();
    if (!trimmed && !searchTerm) {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: "Could you specify which goal you're referring to?",
        evidence: {
          status: "NOT_FOUND",
          method: "AUTHORITATIVE_EXACT_MATCH",
          confidence: 0,
          evidenceDetails: {},
          clarificationReason: "Empty goal reference expression",
        },
      };
    }

    // 1. Pending Candidates
    if (context?.pendingCandidates && context.pendingCandidates.length > 0) {
      const match = context.pendingCandidates.find((c) => {
        const dLower = c.displayName.toLowerCase();
        return dLower === searchTerm || dLower.includes(searchTerm) || searchTerm.includes(dLower);
      });
      if (match) {
        return {
          status: "RESOLVED",
          entityId: match.entityId,
          title: match.displayName,
          entityType: "goal",
          evidence: {
            status: "RESOLVED",
            selectedEntityId: match.entityId,
            selectedDisplayName: match.displayName,
            method: "PENDING_OPERATION_CANDIDATE",
            confidence: 0.98,
            evidenceDetails: { domainMatch: true },
          },
        };
      }
    }

    // 2. STM Active Focus
    const isAnaphoric =
      context?.kind === "CONTEXTUAL_ANAPHORIC" ||
      context?.contextualRelation === "ACTIVE_FOCUS" ||
      /^(?:that|this|the|it)(?:\s+goal)?$/i.test(trimmed);

    if (context?.activeFocus && context.activeFocus.entityType === "goal") {
      const focusLower = context.activeFocus.displayName.toLowerCase();
      if (isAnaphoric || focusLower === searchTerm || focusLower.includes(searchTerm) || searchTerm.includes(focusLower)) {
        return {
          status: "RESOLVED",
          entityId: context.activeFocus.entityId,
          title: context.activeFocus.displayName,
          entityType: "goal",
          evidence: {
            status: "RESOLVED",
            selectedEntityId: context.activeFocus.entityId,
            selectedDisplayName: context.activeFocus.displayName,
            method: "STM_ACTIVE_FOCUS",
            confidence: 0.95,
            evidenceDetails: { domainMatch: true },
          },
        };
      }
    }

    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: `Cannot resolve goals while database is disconnected.`,
        evidence: {
          status: "NOT_FOUND",
          method: "AUTHORITATIVE_EXACT_MATCH",
          confidence: 0,
          evidenceDetails: {},
          clarificationReason: "Database disconnected",
        },
      };
    }

    const { Goal } = await import("@/features/goals/models/Goal");
    const userObjId = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;

    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const candidates = await Goal.find({
      userId: { $in: [userId, userObjId] },
      status: { $in: ["active", "proposed"] },
      title: { $regex: escaped, $options: "i" },
    }).select("_id title status").lean();

    if (candidates.length === 0) {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: `I couldn't find an active goal matching "${rawExpression}".`,
        evidence: {
          status: "NOT_FOUND",
          method: "AUTHORITATIVE_EXACT_MATCH",
          confidence: 0,
          evidenceDetails: {},
          clarificationReason: `No goal found matching "${rawExpression}"`,
        },
      };
    }

    if (candidates.length === 1) {
      return {
        status: "RESOLVED",
        entityId: (candidates[0] as any)._id.toString(),
        title: (candidates[0] as any).title,
        entityType: "goal",
        evidence: {
          status: "RESOLVED",
          selectedEntityId: (candidates[0] as any)._id.toString(),
          selectedDisplayName: (candidates[0] as any).title,
          method: "AUTHORITATIVE_EXACT_MATCH",
          confidence: 0.90,
          evidenceDetails: { matchedField: "title" },
        },
      };
    }

    // Check exact matches
    const exactMatch = candidates.find(
      (c: any) => c.title.toLowerCase().trim() === searchTerm || c.title.toLowerCase().trim() === trimmed
    );
    if (exactMatch) {
      return {
        status: "RESOLVED",
        entityId: (exactMatch as any)._id.toString(),
        title: (exactMatch as any).title,
        entityType: "goal",
        evidence: {
          status: "RESOLVED",
          selectedEntityId: (exactMatch as any)._id.toString(),
          selectedDisplayName: (exactMatch as any).title,
          method: "AUTHORITATIVE_EXACT_MATCH",
          confidence: 0.95,
          evidenceDetails: { matchedField: "title" },
        },
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
      evidence: {
        status: "AMBIGUOUS",
        candidateIds,
        candidateTitles,
        method: "AMBIGUOUS_MULTI_CANDIDATE",
        confidence: 0.5,
        evidenceDetails: {},
        clarificationReason: "Multiple goals matched",
      },
    };
  }

  async resolveWorkout(
    userId: string,
    rawExpression: string,
    context?: {
      activeFocus?: IContextEntityRef | null;
      recentEntities?: IContextEntityRef[];
      pendingCandidates?: Array<{ entityId: string; displayName: string }>;
    }
  ): Promise<EntityResolutionOutcome> {
    const trimmed = (rawExpression || "").trim().toLowerCase();

    // 1. STM Active Focus
    if (context?.activeFocus && context.activeFocus.entityType === "workout") {
      return {
        status: "RESOLVED",
        entityId: context.activeFocus.entityId,
        title: context.activeFocus.displayName,
        entityType: "workout",
        evidence: {
          status: "RESOLVED",
          selectedEntityId: context.activeFocus.entityId,
          selectedDisplayName: context.activeFocus.displayName,
          method: "STM_ACTIVE_FOCUS",
          confidence: 0.95,
          evidenceDetails: { domainMatch: true },
        },
      };
    }

    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: `Cannot resolve workouts while database is disconnected.`,
      };
    }

    const { WorkoutSession } = await import("@/server/db/models/WorkoutSession");
    const userObjId = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;

    const query: any = { userId: { $in: [userId, userObjId] } };
    if (trimmed && !/^(?:that|this|the|it)(?:\s+workout)?$/i.test(trimmed)) {
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [{ name: { $regex: escaped, $options: "i" } }, { workoutType: { $regex: escaped, $options: "i" } }];
    }

    const sessions = await WorkoutSession.find(query)
      .sort({ date: -1, createdAt: -1 })
      .limit(5)
      .lean();

    if (sessions.length === 0) {
      return {
        status: "NOT_FOUND",
        clarificationQuestion: `I couldn't find a workout session matching "${rawExpression}".`,
      };
    }

    if (sessions.length === 1) {
      const s = sessions[0] as any;
      return {
        status: "RESOLVED",
        entityId: s._id.toString(),
        title: s.name || s.workoutType || "Workout",
        entityType: "workout",
        evidence: {
          status: "RESOLVED",
          selectedEntityId: s._id.toString(),
          selectedDisplayName: s.name || s.workoutType || "Workout",
          method: "AUTHORITATIVE_EXACT_MATCH",
          confidence: 0.90,
          evidenceDetails: {},
        },
      };
    }

    const candidateIds = sessions.map((s: any) => s._id.toString());
    const candidateTitles = sessions.map((s: any) => `${s.name || s.workoutType} on ${new Date(s.date).toISOString().split("T")[0]}`);
    return {
      status: "AMBIGUOUS",
      candidateIds,
      candidateTitles,
      clarificationQuestion: `I found multiple workout sessions: ${candidateTitles.map((t) => `"${t}"`).join(" or ")}. Which one would you like to modify?`,
      evidence: {
        status: "AMBIGUOUS",
        candidateIds,
        candidateTitles,
        method: "AMBIGUOUS_MULTI_CANDIDATE",
        confidence: 0.5,
        evidenceDetails: {},
      },
    };
  }
}
