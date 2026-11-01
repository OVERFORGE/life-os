/**
 * CapabilityContracts.ts
 *
 * Strict contracts governing the unified capability catalog, schema boundary,
 * four-tier provider error classification, and resource declarations.
 */

export type CapabilitySource = "INTERNAL_ADAPTER" | "MODULAR_PROVIDER" | "MCP_GATEWAY";

export type CapabilityAccessMode = "EXCLUSIVE_LOCK" | "SHARED_READ";

export interface CapabilityResourceRequirement {
  type: string;
  uriTemplate?: string;
  accessMode: CapabilityAccessMode;
}

export type CapabilityStatus = "ACTIVE" | "DEPRECATED" | "REVOKED";

export interface CapabilityDescriptor {
  capabilityURN: string;
  source: CapabilitySource;
  displayName: string;
  description: string;
  category: string;
  operationKind?:
    | "CREATE"
    | "READ"
    | "UPDATE"
    | "DELETE"
    | "COMPLETE"
    | "CANCEL"
    | "RESCHEDULE"
    | "PRIORITIZE"
    | "APPEND_CORRECT"
    | "CONFIRM"
    | "RETRACT"
    | "START"
    | "DEFER"
    | "PAUSE"
    | "RESUME"
    | "COMPENSATE";
  reversibility?: "atomic_single_doc" | "reversible_with_compensation" | "irreversible_external" | "irreversible_local";
  domain?: string;
  targetEntityType?: string;
  verbalization?: { entityNoun?: string; actionVerb?: string };
  parametersSchema: Record<string, any>;
  outputSchema?: Record<string, any>;
  requiredResources?: CapabilityResourceRequirement[];
  isIdempotent: boolean;
  isReversible: boolean;
  compensationCapabilityURN?: string;
  requiresApproval: boolean;
  verificationMethod?: "POLL" | "WEBHOOK" | "READ_BACK" | "OBSERVATION_PROBE" | "NONE";
  observationProbeCapabilityURN?: string;
  timeoutMs: number;
  contractHash: string;
  tags?: string[];
  rateLimit?: { tokensPerMinute: number };
  status?: CapabilityStatus;
}

export type ProviderErrorCategory =
  | "DEFINITIVE_REJECTION"
  | "AMBIGUOUS_PROVIDER_FAILURE"
  | "UNKNOWN_PROVIDER_SEMANTICS"
  | "CONFIRMED_SUCCESS";

export interface ProviderErrorClassification {
  category: ProviderErrorCategory;
  isUncertainMutation: boolean;
  auditStatus: "SUCCEEDED" | "FAILED_CONFIRMED" | "OUTCOME_UNKNOWN";
  nodeStatus: "VERIFICATION_PENDING" | "FAILED" | "OUTCOME_UNKNOWN";
  safeToRetryWithoutProbe: boolean;
  code: string;
  message: string;
  rawError?: unknown;
}

export interface CapabilityQueryFilter {
  category?: string;
  source?: CapabilitySource;
  tags?: string[];
  supportsIdempotency?: boolean;
  query?: string;
}

export interface CapabilityValidationResult {
  valid: boolean;
  errors?: string[];
  reason?: string;
}

