/**
 * SemanticTurnContracts.ts
 * 
 * Canonical intermediate representation for natural language interpretation.
 * Invariant: Captures complete linguistic meaning, entities, temporal expressions,
 * and provenance required for 100% deterministic replay without invoking LLMs.
 */

import { DomainActionType } from "./ActionProposalContracts";

export type TurnPrimaryClassification =
  | "ACTION_REQUEST"         // User desires state mutation (task, meal, mental, goal)
  | "INFORMATION_QUERY"       // User asks about status, metrics, past logs, or schedule
  | "STATE_OBSERVATION"       // Somatic, affective, or dietary report without explicit command
  | "CASUAL_DIALOGUE"         // Greetings, meta-dialogue, conversational banter
  | "CLARIFICATION_RESPONSE"  // User answering an outstanding system clarification prompt
  | "CONFIRMATION"           // User confirming an active proposal (e.g. "yes sure do that")
  | "CANCEL_OR_DISMISS"       // User retracting, cancelling, or dismissing a prior turn
  | "EXPLICIT_CORRECTION"     // User explicitly correcting a previous entity/parameter
  | "EXPLICIT_RETRACTION";    // User explicitly commanding rollback or cancellation of previous action

export type AmbiguityStatus =
  | "UNAMBIGUOUS"             // All operations, entities, and temporal targets are explicit
  | "OPERATION_AMBIGUOUS"     // Unclear what action is requested
  | "ENTITY_AMBIGUOUS"        // Multiple candidate entities match
  | "TEMPORAL_AMBIGUOUS"      // Timeframe is broad or underspecified ("sometime", "later")
  | "CONFLICTING_INTENTS";    // Contradictory requests within the same turn

export type EntityResolutionStatus =
  | "RESOLVED"
  | "AMBIGUOUS"
  | "NOT_FOUND"
  | "UNRESOLVED";

export type ResolutionMethod =
  | "EXPLICIT_IDENTIFIER"
  | "PENDING_OPERATION_CANDIDATE"
  | "STM_ACTIVE_FOCUS"
  | "STM_RECENT_ENTITY_RECENCY"
  | "AUTHORITATIVE_EXACT_MATCH"
  | "AUTHORITATIVE_CONTEXTUAL_MATCH"
  | "AMBIGUOUS_MULTI_CANDIDATE";

export interface EntityResolutionEvidence {
  status: EntityResolutionStatus;
  selectedEntityId?: string;
  selectedDisplayName?: string;
  candidateIds?: string[];
  candidateTitles?: string[];
  method: ResolutionMethod;
  confidence: number; // 0.0 - 1.0 diagnostic only, not execution gate
  evidenceDetails: {
    matchedField?: string;
    temporalAlignment?: boolean;
    domainMatch?: boolean;
    recencyDeltaMs?: number;
  };
  clarificationReason?: string;
  clarificationQuestion?: string;
}

export type SemanticReferenceKind =
  | "EXPLICIT_IDENTIFIER"     // Exact database ID or verbatim exact title
  | "CONTEXTUAL_ANAPHORIC"   // Coreference ("that task", "it", "the one we just discussed")
  | "DESCRIPTIVE";           // Descriptive concept ("project budget", "reading habit")

export interface EntityReference {
  referenceId: string;
  kind?: SemanticReferenceKind;
  rawExpression: string;      // "the presentation", "it", "that project budget task"
  semanticDescriptor?: string;// Clean descriptive concept extracted by Aven: "project budget"
  entityType: "task" | "goal" | "meal" | "workout" | "schedule_block" | "activity" | "weight" | "context_mode";
  domain?: "productivity" | "health" | "wellness" | "context";
  temporalConstraint?: {
    dateAnchor?: string;
    relativeSlot?: "morning" | "afternoon" | "evening";
  };
  contextualRelation?: "ACTIVE_FOCUS" | "PENDING_OPERATION" | "RECENT_OPERATION" | "GENERAL_SEARCH";
  resolutionStrategy: "EXPLICIT_ID" | "EXACT_TITLE" | "CONTEXTUAL_RECENT" | "AMBIGUOUS_CANDIDATES" | "UNRESOLVED";
  candidateIds?: string[];    // Populated if multiple entities match
  resolvedEntityId?: string;  // Populated ONLY by Contextual Entity Resolution Layer
  evidence?: EntityResolutionEvidence;
}

export type PendingOperationState =
  | "CREATED"
  | "AWAITING_CLARIFICATION"
  | "CONTINUED"
  | "CANCELLED"
  | "EXPIRED"
  | "COMPLETED";

export interface IPendingOperationContext {
  operationId: string;
  turnId: string;
  actionType: DomainActionType;
  domain: "productivity" | "health" | "wellness" | "context";
  partialPayload: Record<string, any>;
  missingRequirement: {
    kind: "TARGET_ENTITY_RESOLUTION" | "TEMPORAL_SPECIFICATION" | "PARAMETER_VALUE" | "DUPLICATE_CONFIRMATION";
    targetEntityType?: "task" | "goal" | "meal" | "workout" | "schedule_block" | "activity" | "weight" | "context_mode";
    parameterName?: string;
  };
  clarificationQuestion: string;
  candidateEntities?: Array<{
    entityId: string;
    displayName: string;
    temporalAnchor?: string;
    metadata?: Record<string, any>;
  }>;
  state: PendingOperationState;
  createdAt: Date | string;
  expiresAt: Date | string;
}

export interface IContextEntityRef {
  entityType: "task" | "goal" | "meal" | "workout" | "schedule_block" | "activity" | "incident" | "context_mode" | "weight";
  entityId: string;
  displayName: string;
  domain: "productivity" | "health" | "wellness" | "context";
  status?: string;
  temporalAnchor?: string; // e.g. "2026-09-21" or "2026-09-21T21:00:00Z"
  metadata?: Record<string, any>;
  lastReferencedTurnId?: string;
  updatedAt?: Date | string;
}

export interface IExecutedOperationSnapshot {
  operationId: string;
  turnId: string;
  actionType: DomainActionType;
  domain: "productivity" | "health" | "wellness" | "context";
  targetEntity?: {
    entityType: string;
    entityId: string;
    displayName: string;
  };
  payloadSnapshot: Record<string, any>;
  success: boolean;
  executedAt: Date | string;
  reversibility: "atomic_single_doc" | "reversible_with_compensation" | "irreversible_external";
}

export interface BoundedContextProjection {
  userId: string;
  conversationId: string;
  timezone: string;
  referenceTimeMs: number;
  recentDialogue: Array<{ role: "user" | "assistant"; content: string }>;
  activeFocus: IContextEntityRef | null;
  recentEntities: IContextEntityRef[];
  pendingOperation: {
    operationId: string;
    actionType: DomainActionType;
    clarificationQuestion: string;
    missingRequirement: string;
    candidateEntities?: Array<{ entityId: string; displayName: string; temporalAnchor?: string }>;
  } | null;
  activeMode: string;
  activeIncidents: string[];
}

export interface TemporalExpression {
  rawExpression: string;      // "tomorrow afternoon", "next Monday at 3pm", "after lunch"
  type: "POINT_IN_TIME" | "DATE_ONLY" | "RELATIVE_OFFSET" | "TIME_OF_DAY_RANGE" | "RECURRING";
  parsedAnchor?: string;      // Base ISO date string YYYY-MM-DD
  resolvedDate?: string;      // Computed ISO date YYYY-MM-DD
  resolvedTime?: string;      // Computed 24-hour time HH:MM
  timezone: string;           // e.g. "America/New_York" or "Asia/Kolkata"
  isAmbiguous: boolean;       // true if time has multiple interpretations without policy
}

export type OperationRiskClass =
  | "READ_ONLY"               // Queries, no state changes
  | "LOW_REVERSIBLE"          // Task creation, meal logging, mental state tracking
  | "MEDIUM_COMPENSABLE"      // Rescheduling, context mode switch, priority adjustments
  | "HIGH_IRREVERSIBLE";      // Deletions, cancellations, external sync

export interface SemanticOperation<TPayload = any> {
  operationId: string;
  domain: "productivity" | "health" | "wellness" | "context";
  actionType: DomainActionType;
  riskClass: OperationRiskClass;
  targetReference?: EntityReference;
  temporal?: TemporalExpression;
  payload: TPayload;          // Strongly-typed per DomainActionType
  dependencies: string[];     // IDs of prior operations that must succeed first
  executionEligibility: "READY" | "BLOCKED_BY_DEPENDENCY" | "REQUIRES_CLARIFICATION";
}

export interface SomaticMetric {
  value: number;              // 1-10 normalized score
  confidence: number;         // 0.0 - 1.0
}

export interface SomaticAffectiveEvidence {
  energy?: SomaticMetric;
  stress?: SomaticMetric;
  mood?: SomaticMetric;
  focus?: SomaticMetric;
  reportedFatigue: boolean;
  somaticSymptoms: string[];  // e.g. ["headache", "brain fog", "sore back"]
  rawVerbatim: string;
}

export interface SemanticTurnProvenance {
  interpreterProvider: "groq" | "gemini" | "openai";
  modelIdentifier: string;    // e.g. "openai/gpt-oss-120b"
  promptVersionHash: string;  // SHA-256 hash of system prompt
  contextSnapshotId: string;  // ID of active context snapshot
  contextSnapshotHash: string;// SHA-256 of context at interpretation time
  inferenceDurationMs: number;
}

export interface ClarificationGuidance {
  required: boolean;
  reason?: string;
  questionToUser?: string;
  options?: string[];
}

export interface SemanticTurn {
  // Provenance & Replay Boundary
  turnId: string;
  schemaVersion: number;      // e.g. 2
  userId: string;
  conversationId: string;
  timestamp: number;
  rawInput: string;
  normalizedTimezone: string;
  
  // LLM Provenance (Persisted for Replay Audit)
  provenance: SemanticTurnProvenance;

  // Semantic Output
  primaryClassification: TurnPrimaryClassification;
  ambiguityStatus: AmbiguityStatus;
  operations: SemanticOperation[];
  affectiveEvidence?: SomaticAffectiveEvidence;
  conversationalSummary: string; // Factual gist for dialogue history
  clarification?: ClarificationGuidance;
}

/**
 * Deterministic policy gate to determine whether an operation is safely executable.
 * Invariant: Replaces the deprecated 0.80 LLM confidence gate.
 */
export function isOperationExecutable(op: SemanticOperation): { executable: boolean; reason?: string } {
  if (op.executionEligibility !== "READY") {
    return { executable: false, reason: `Operation eligibility is ${op.executionEligibility}` };
  }

  // Check target reference if action requires existing entity
  if (op.targetReference) {
    if (op.targetReference.resolutionStrategy === "AMBIGUOUS_CANDIDATES") {
      return { executable: false, reason: "Target entity is ambiguous (multiple candidates matched)" };
    }
    if (op.targetReference.resolutionStrategy === "UNRESOLVED") {
      return { executable: false, reason: "Target entity could not be found in active state" };
    }
  }

  // Check temporal ambiguity if time is required
  if (op.temporal && op.temporal.isAmbiguous) {
    return { executable: false, reason: "Temporal timeframe is ambiguous and requires clarification" };
  }

  // Required field checks for common operations
  if (op.actionType === "create_task" && (!op.payload?.title || typeof op.payload.title !== "string")) {
    return { executable: false, reason: "Task title is required" };
  }

  if (op.actionType === "complete_task" && !op.payload?.taskId && !op.targetReference?.resolvedEntityId) {
    return { executable: false, reason: "TaskId or resolved targetEntityId is required to complete a task" };
  }

  return { executable: true };
}
