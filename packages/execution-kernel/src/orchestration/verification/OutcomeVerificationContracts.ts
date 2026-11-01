import crypto from "node:crypto";
import { assertValidHmacSecret } from "../contracts/WorkflowExecutionContracts";
import { StepDataResolver } from "../workspace/StepDataResolver";

export type VerificationLayer =
  | "MECHANICAL_VERIFICATION"
  | "STATE_CHANGE_VERIFICATION"
  | "REQUIREMENT_VERIFICATION"
  | "SEMANTIC_VERIFICATION"
  | "OBJECTIVE_VERIFICATION";

export type VerificationOutcomeStatus =
  | "VERIFIED"
  | "VERIFIED_WITH_LIMITATIONS"
  | "NOT_VERIFIED"
  | "INCONCLUSIVE";

export type VerificationClass =
  | "CLASS_1_ARTIFACT_READ_BACK"
  | "CLASS_2_EPISTEMIC_QUERY"
  | "CLASS_3_SYNTHESIS_PROVENANCE"
  | "CLASS_4_DOMAIN_GRAPH_MUTATION"
  | "CLASS_5_EXTERNAL_ACTION";

export type EvidenceAuthority =
  | "KERNEL_AUTHORITATIVE"
  | "PROVIDER_AUTHORITATIVE"
  | "INDIRECT_TELEMETRY";

export type EvidenceCompleteness = "EXHAUSTIVE" | "SAMPLED";
export type EvidenceRelevance = "DIRECT_MUTATION" | "CORRELATED_EFFECT";

export interface ExecutionEvidenceRecord {
  evidenceId: string;
  executionId: string;
  stepId: string;
  checkpointId: string;
  verificationClass: VerificationClass;
  sourceURN: string;
  observedAt: number;
  freshnessTtlMs: number;
  authority: EvidenceAuthority;
  completeness: EvidenceCompleteness;
  relevance: EvidenceRelevance;
  rawObservation: Record<string, any>;
  canonicalObservationHash: string;
  testedCriteria: string[];
  passedCriteria: string[];
  failedCriteria: string[];
  summary: string;
  keyVersion: string;
  envelopeHmac: string;
}

export interface CanonicalEvidenceEnvelope {
  authority: string;
  canonicalObservationHash: string;
  checkpointId: string;
  completeness: string;
  evidenceId: string;
  executionId: string;
  failedCriteria: string[];
  freshnessTtlMs: number;
  keyVersion: string;
  observedAt: number;
  passedCriteria: string[];
  relevance: string;
  sourceURN: string;
  stepId: string;
  summary: string;
  testedCriteria: string[];
  verificationClass: string;
}

export const EVIDENCE_STORAGE_BUDGETS = {
  maxObservationBytes: 10 * 1024,        // 10 KB per raw observation
  maxEvidenceRecordBytes: 20 * 1024,     // 20 KB per record
  maxEvidenceRecordsPerStep: 3,          // Max 3 evidence records per step
  maxAggregateEvidenceBytes: 200 * 1024, // 200 KB total evidence budget in workspace
} as const;

export class EvidenceSizeLimitExceededError extends Error {
  constructor(message: string) {
    super(`[EVIDENCE_SIZE_LIMIT_EXCEEDED]: ${message}`);
    this.name = "EvidenceSizeLimitExceededError";
  }
}

export class EvidenceTamperDetectedError extends Error {
  constructor(message: string) {
    super(`[EVIDENCE_TAMPER_DETECTED]: ${message}`);
    this.name = "EvidenceTamperDetectedError";
  }
}

export class EvidenceIntegrityConflictError extends Error {
  constructor(message: string) {
    super(`[EVIDENCE_INTEGRITY_CONFLICT]: ${message}`);
    this.name = "EvidenceIntegrityConflictError";
  }
}

export interface StepVerificationResult {
  stepId: string;
  status: VerificationOutcomeStatus;
  layer: VerificationLayer;
  verificationClass: VerificationClass;
  evidence: ExecutionEvidenceRecord[];
  disclosure?: string;
  reason?: string;
}

export interface ObjectiveVerificationAssessment {
  verified: boolean;
  outcomeStatus: VerificationOutcomeStatus;
  primaryLayer: VerificationLayer;
  testedRequirements: string[];
  authoritativeEvidence: ExecutionEvidenceRecord[];
  truthfulDisclosure: string;
  limitationDisclosures?: string[];
}

export interface VerificationContext {
  userId: string;
  executionId: string;
  goal: string;
  checkpointId: string;
  workspaceStateVersion: number;
  generation: number;
  workerLeaseToken: string;
}

export interface IVerificationStrategy<TInput = any> {
  readonly verificationClass: VerificationClass;
  canVerify(step: any, goal: string): boolean;
  verify(context: VerificationContext, step: any): Promise<StepVerificationResult>;
}

/**
 * Constructs and cryptographically signs a canonical evidence envelope.
 * Strictly adheres to RFC 8785 JSON Canonicalization Scheme (JCS).
 */
export function signEvidenceEnvelope(
  params: {
    evidenceId: string;
    executionId: string;
    stepId: string;
    checkpointId: string;
    verificationClass: VerificationClass;
    sourceURN: string;
    observedAt?: number;
    freshnessTtlMs?: number;
    authority: EvidenceAuthority;
    completeness: EvidenceCompleteness;
    relevance: EvidenceRelevance;
    rawObservation: Record<string, any>;
    testedCriteria: string[];
    passedCriteria: string[];
    failedCriteria: string[];
    summary: string;
    keyVersion?: string;
  },
  secretOverride?: string
): ExecutionEvidenceRecord {
  const secret = assertValidHmacSecret(secretOverride);
  const keyVersion = params.keyVersion || process.env.KERNEL_HMAC_KEY_VERSION || "v2";
  const observedAt = params.observedAt || Date.now();
  const freshnessTtlMs = params.freshnessTtlMs || 300000; // 5 min default

  // 1. Sanitize and enforce size limit on raw observation
  const sanitizedObservation = StepDataResolver.sanitizeForPersistence(params.rawObservation || {});
  const serializedRaw = StepDataResolver.canonicalize(sanitizedObservation);
  const rawBytes = Buffer.byteLength(serializedRaw, "utf8");

  if (rawBytes > EVIDENCE_STORAGE_BUDGETS.maxObservationBytes) {
    throw new EvidenceSizeLimitExceededError(
      `Observation payload (${rawBytes} bytes) exceeds limit of ${EVIDENCE_STORAGE_BUDGETS.maxObservationBytes} bytes`
    );
  }

  // 2. Compute canonical observation hash
  const canonicalObservationHash = crypto
    .createHash("sha256")
    .update(serializedRaw, "utf8")
    .digest("hex");

  // 3. Construct canonical envelope object with explicitly sorted keys
  const envelope: CanonicalEvidenceEnvelope = {
    authority: params.authority,
    canonicalObservationHash,
    checkpointId: params.checkpointId,
    completeness: params.completeness,
    evidenceId: params.evidenceId,
    executionId: params.executionId,
    failedCriteria: [...params.failedCriteria].sort(),
    freshnessTtlMs,
    keyVersion,
    observedAt,
    passedCriteria: [...params.passedCriteria].sort(),
    relevance: params.relevance,
    sourceURN: params.sourceURN,
    stepId: params.stepId,
    summary: params.summary,
    testedCriteria: [...params.testedCriteria].sort(),
    verificationClass: params.verificationClass,
  };

  // 4. Serialize envelope via RFC 8785 JCS and compute HMAC-SHA256
  const canonicalEnvelopeString = StepDataResolver.canonicalize(envelope);
  const envelopeBytes = Buffer.byteLength(canonicalEnvelopeString, "utf8");

  if (envelopeBytes > EVIDENCE_STORAGE_BUDGETS.maxEvidenceRecordBytes) {
    throw new EvidenceSizeLimitExceededError(
      `Evidence envelope (${envelopeBytes} bytes) exceeds limit of ${EVIDENCE_STORAGE_BUDGETS.maxEvidenceRecordBytes} bytes`
    );
  }

  const envelopeHmac = crypto
    .createHmac("sha256", secret)
    .update(canonicalEnvelopeString, "utf8")
    .digest("hex");

  return {
    ...envelope,
    rawObservation: sanitizedObservation,
    envelopeHmac,
    verificationClass: params.verificationClass,
    authority: params.authority,
    completeness: params.completeness,
    relevance: params.relevance,
  };
}

/**
 * Validates the HMAC signature and canonical contents of an evidence envelope.
 * Fails closed on any modification to any field in the envelope or raw observation.
 */
export function verifyEvidenceEnvelope(
  record: ExecutionEvidenceRecord,
  activeSecretOverride?: string,
  previousSecretOverride?: string
): { valid: boolean; reason?: string } {
  if (!record || !record.envelopeHmac || !record.canonicalObservationHash) {
    return { valid: false, reason: "Evidence record is missing signature or canonical hash." };
  }

  // Check freshness
  if (record.observedAt + record.freshnessTtlMs < Date.now()) {
    return { valid: false, reason: `Evidence expired: observed at ${record.observedAt}, TTL ${record.freshnessTtlMs}ms` };
  }

  // Verify raw observation hash
  const serializedRaw = StepDataResolver.canonicalize(record.rawObservation || {});
  const expectedObsHash = crypto.createHash("sha256").update(serializedRaw, "utf8").digest("hex");
  if (expectedObsHash !== record.canonicalObservationHash) {
    return { valid: false, reason: "Raw observation does not match canonical observation hash." };
  }

  // Reconstruct canonical envelope
  const envelope: CanonicalEvidenceEnvelope = {
    authority: record.authority,
    canonicalObservationHash: record.canonicalObservationHash,
    checkpointId: record.checkpointId,
    completeness: record.completeness,
    evidenceId: record.evidenceId,
    executionId: record.executionId,
    failedCriteria: [...(record.failedCriteria || [])].sort(),
    freshnessTtlMs: record.freshnessTtlMs,
    keyVersion: record.keyVersion,
    observedAt: record.observedAt,
    passedCriteria: [...(record.passedCriteria || [])].sort(),
    relevance: record.relevance,
    sourceURN: record.sourceURN,
    stepId: record.stepId,
    summary: record.summary,
    testedCriteria: [...(record.testedCriteria || [])].sort(),
    verificationClass: record.verificationClass,
  };

  const canonicalEnvelopeString = StepDataResolver.canonicalize(envelope);

  // Validate HMAC using active secret, or fallback to previous secret if key version differs
  const activeSecret = assertValidHmacSecret(activeSecretOverride);
  const activeHmac = crypto.createHmac("sha256", activeSecret).update(canonicalEnvelopeString, "utf8").digest("hex");

  if (crypto.timingSafeEqual(Buffer.from(record.envelopeHmac, "hex"), Buffer.from(activeHmac, "hex"))) {
    return { valid: true };
  }

  if (previousSecretOverride) {
    const prevSecret = assertValidHmacSecret(previousSecretOverride);
    const prevHmac = crypto.createHmac("sha256", prevSecret).update(canonicalEnvelopeString, "utf8").digest("hex");
    if (crypto.timingSafeEqual(Buffer.from(record.envelopeHmac, "hex"), Buffer.from(prevHmac, "hex"))) {
      return { valid: true };
    }
  }

  return { valid: false, reason: "Envelope HMAC signature verification failed. Tamper detected." };
}

