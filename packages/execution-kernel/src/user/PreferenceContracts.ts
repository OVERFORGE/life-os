/**
 * PreferenceContracts.ts
 * Authoritative contracts for the Deep User Model & Preference Intelligence (Phase 4).
 * Strictly typed, zero any, 5-tier authority hierarchy.
 */

import { IEvidenceProvenance } from "../telemetry/contracts/ObservationEventContracts";

export type PreferenceAuthority =
  | "EXPLICIT_HARD"   // Priority 5: User explicitly set and locked; agent cannot override
  | "EXPLICIT_SOFT"   // Priority 4: User explicitly stated or confirmed; agent can suggest changes
  | "CANDIDATE"       // Priority 3: Proposed by learning engine; waiting for user confirmation
  | "LEARNED"         // Priority 2: Inferred from telemetry / repeated behavior
  | "SYSTEM_DEFAULT"; // Priority 1: Built-in platform default

export const AUTHORITY_PRIORITY: Record<PreferenceAuthority, number> = {
  EXPLICIT_HARD: 5,
  EXPLICIT_SOFT: 4,
  CANDIDATE: 3,
  LEARNED: 2,
  SYSTEM_DEFAULT: 1,
};

export interface IUserPreferenceItem {
  key: string;
  value: string | number | boolean | Record<string, unknown>;
  authority: PreferenceAuthority;
  provenance: IEvidenceProvenance;
  confidence: number; // 0.0 to 1.0
  lastReinforced: number;
  decayHalfLifeDays?: number;
  metadata?: Record<string, unknown>;
}

export interface IPreferenceResolution {
  key: string;
  effectiveValue: string | number | boolean | Record<string, unknown>;
  authority: PreferenceAuthority;
  isOverridableByAgent: boolean;
  confidence: number;
  provenance: IEvidenceProvenance;
  lastReinforced: number;
}

export interface IUserDeepProfile {
  userId: string;
  identity: {
    name: string;
    timezone: string;
    role: string;
  };
  preferences: IUserPreferenceItem[];
  operationalConstraints: string[];
  cognitiveBaseline: {
    avgFocusMinutes: number;
    peakHours: number[];
  };
  version: number;
  updatedAt: number;
}
