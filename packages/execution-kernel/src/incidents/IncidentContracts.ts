/**
 * Incident Subsystem Contracts
 * 
 * Defines first-class Incident entities, lifecycle states,
 * and operational constraints that dynamically override baseline assumptions.
 */

export type IncidentDomain =
  | "health"
  | "work"
  | "environment"
  | "personal"
  | "academic";

export type IncidentSeverity =
  | "minor"
  | "moderate"
  | "major"
  | "critical";

export type IncidentStatus =
  | "active"
  | "mitigating"
  | "resolved"
  | "historical";

export interface OperationalConstraints {
  suppressWorkouts?: boolean;
  maxWorkloadHoursPerDay?: number;
  enforcedSleepTargetHours?: number;
  suspendedGoalIds?: string[];
  notes?: string;
}

export interface EffectiveOperationalConstraints extends OperationalConstraints {
  activeIncidentCount: number;
  highestSeverity: IncidentSeverity | null;
  activeIncidentIds: string[];
}

export interface IncidentRecord {
  id: string;
  userId: string;
  title: string;
  domain: IncidentDomain;
  severity: IncidentSeverity;
  status: IncidentStatus;
  startedAt: number;
  resolvedAt?: number;
  expectedDurationHours: number;
  summary: string;
  symptomsOrSignals: string[];
  operationalConstraints: OperationalConstraints;
  tags: string[];
  updatedAt: number;
}

export interface CreateIncidentInput {
  userId: string;
  title: string;
  domain: IncidentDomain;
  severity: IncidentSeverity;
  startedAt?: number;
  expectedDurationHours?: number;
  summary: string;
  symptomsOrSignals?: string[];
  operationalConstraints?: OperationalConstraints;
  tags?: string[];
}
