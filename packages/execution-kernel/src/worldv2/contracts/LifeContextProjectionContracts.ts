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

export type CognitiveEvaluationStatus = "EVALUATED" | "INSUFFICIENT_EVIDENCE" | "STALE";

export interface ICognitiveProjection {
  state: "DEEP_FOCUS" | "NORMAL" | "DEPLETED" | "OVERLOADED" | "FRAGMENTED" | "UNKNOWN";
  confidence: number | null;
  provenance: EvidenceProvenanceType;
  freshnessTimestamp: number;
  primaryDrivers: string[];
  estimatedFatigue: number | null; // [0.0 - 1.0]
  estimatedReadiness: number | null; // [0.0 - 1.0]
  evidenceEvaluationStatus?: CognitiveEvaluationStatus;
}

export interface IPhysicalProjection {
  readinessScore: number | null; // [0.0 - 1.0]
  sleepDurationMinutes: number | null;
  sleepQualityScore: number | null; // [0.0 - 1.0]
  recoveryStatus: "OPTIMAL" | "ADEQUATE" | "IMPAIRED" | "UNKNOWN";
  freshnessTimestamp: number;
}

export interface IOperationalScheduleProjection {
  hardCommitmentCount: number;
  todayMeetingCount: number;
  meetingCount: number;
  todayMeetingDurationMinutes: number;
  uniqueOccupiedBlockCount: number;
  totalOccupiedDurationMinutes: number;
  remainingFreeIntervalsCount: number;
  freeFocusBlocksRemaining: number;
  nextCommitmentTime?: string; // ISO 8601 or HH:MM
  nextCommitmentTitle?: string;
  inProgressCommitmentTitle?: string;
  isScheduleTight: boolean;
  scheduleDensity: number; // [0.0 - 1.0]
  calendarState: "FREE" | "LIGHT" | "MODERATE" | "PACKED" | "UNKNOWN";
  activeDaySpanMinutes?: number;
  freshnessTimestamp: number;
  dataQualityStatus?: "AUTHORITATIVE" | "PARTIAL" | "FALLBACK_EMPTY" | "DEGRADED";
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

export interface IBehavioralProfileProjection {
  taskCompletionRate: number | null;
  procrastinationTendency: number | null;
  deepWorkConsistency: number;
  confidenceTier: "LOW" | "MODERATE" | "HIGH";
  decayHalfLifeDays: number;
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
  behavioralProfile?: IBehavioralProfileProjection;
  activeContextMode?: string;
  quietHoursActive: boolean;
  systemPromptContextSummary?: string;
}
