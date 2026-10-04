/**
 * LifeContextProjectionContracts.ts
 * Authoritative typed DTO representing the bounded LifeContextProjection.
 * Zero `any` permitted.
 * Part of Phase 1 Canonical Unified World Model & Context Bridge.
 */

export type EvidenceProvenanceType =
  | "TELEMETRY"
  | "CONVERSATION"
  | "HISTORICAL"
  | "HYBRID"
  | "INFERRED";

export interface IFieldMetadata {
  confidence: number; // Epistemic certainty [0.0 - 1.0]
  provenance: EvidenceProvenanceType;
  freshnessTimestamp: number;
  isStale: boolean;
}

export interface IContextDegradationState {
  isDegraded: boolean;
  degradationReason?: string;
  missingFields: string[];
  fallbackActive: boolean;
  lastValidSnapshotTimestamp?: number;
}

export interface ICognitiveProjection {
  state: "DEEP_FOCUS" | "NORMAL" | "DEPLETED" | "OVERLOADED" | "FRAGMENTED";
  confidence: number;
  provenance: EvidenceProvenanceType;
  freshnessTimestamp: number;
  primaryDrivers: string[];
  estimatedFatigue: number; // [0.0 - 1.0]
  estimatedReadiness: number; // [0.0 - 1.0]
}

export interface IPhysicalProjection {
  readinessScore: number; // [0.0 - 1.0]
  sleepDurationMinutes: number;
  sleepQualityScore: number; // [0.0 - 1.0]
  recoveryStatus: "OPTIMAL" | "ADEQUATE" | "IMPAIRED" | "UNKNOWN";
  freshnessTimestamp: number;
}

export interface IOperationalScheduleProjection {
  todayMeetingCount: number;
  todayMeetingDurationMinutes: number;
  freeFocusBlocksRemaining: number;
  nextCommitmentTime?: string; // ISO 8601 or HH:MM
  isScheduleTight: boolean;
  freshnessTimestamp: number;
}

export interface IGoalPressureProjection {
  goalId: string;
  title: string;
  domain: string;
  pressureScore: number; // [0.0 - 1.0]
  isCritical: boolean;
  daysUntilDeadline?: number;
}

export interface IActiveInterventionProjection {
  interventionId: string;
  strategy: string;
  appliedAt: number;
  targetDomain: string;
  status: "ACTIVE" | "PENDING_VERIFICATION";
}

export interface ILifeContextProjection {
  userId: string;
  projectionTimestamp: number;
  projectionVersion: number;
  degradation: IContextDegradationState;
  cognitiveState: ICognitiveProjection;
  physicalReadiness: IPhysicalProjection;
  operationalSchedule: IOperationalScheduleProjection;
  goalPressures: IGoalPressureProjection[];
  activeInterventions: IActiveInterventionProjection[];
  activeContextMode?: string;
  quietHoursActive: boolean;
  systemPromptContextSummary?: string;
}
