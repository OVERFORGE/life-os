/**
 * EvidencePackageBuilder.ts
 *
 * Deterministic builder producing sanitized, allowlisted ExecutionEvidencePackage
 * objects for Stage 2 canonical synthesis. Strips raw DB metadata, credentials,
 * secrets, and sensitive free-text prose (e.g. daily-log reflections), and enforces
 * bounded character limits.
 */

import { CapabilityRegistry } from "../capabilities/CapabilityRegistry";

export type EvidenceCoverageStatus =
  | "READ_WITH_DATA"
  | "READ_EMPTY"
  | "PARTIAL_RESULT"
  | "CAPABILITY_EXECUTION_FAILED"
  | "AUTHORIZATION_OR_VALIDATION_FAILED"
  | "MUTATION_BLOCKED_UNMET_PREREQUISITE";

export interface ExecutionEvidenceItem {
  stepId: string;
  capabilityURN: string;
  operationKind: string;
  provenance: {
    auditId?: string;
    integrityHash?: string;
  };
  executionStatus: string;
  coverageStatus: EvidenceCoverageStatus;
  queriedRange?: Record<string, any>;
  totalCount?: number;
  returnedCount?: number;
  truncated: boolean;
  allowlistedSummary: any;
  limitation?: string;
}

export interface ExecutionEvidencePackage {
  objective: string;
  temporalContext?: {
    localDate: string;
    dayOfWeek?: string;
    timezone: string;
  };
  tailoredContextSummary?: string;
  items: ExecutionEvidenceItem[];
  limitations: string[];
  serializedCharCount: number;
}

const SENSITIVE_KEY_PATTERN = /^(password|secret|token|apikey|api_key|authorization|cookie|refreshToken|accessToken|__v|reflection)$/i;
const MAX_ITEM_CHARS = 6000;
const MAX_TOTAL_EVIDENCE_CHARS = 16000;

function sanitizeValue(value: any, depth: number = 0): any {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[TRUNCATED_DEPTH]";
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) continue;
      if (k === "_id" && typeof v === "object") {
        out.id = String(v);
        continue;
      }
      out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function extractQueriedRange(params?: Record<string, any>): Record<string, any> | undefined {
  if (!params || typeof params !== "object") return undefined;
  const range: Record<string, any> = {};
  for (const key of ["startDate", "endDate", "dueDateFrom", "dueDateTo", "status", "timezone", "limit"]) {
    if (params[key] !== undefined) range[key] = params[key];
  }
  return Object.keys(range).length > 0 ? range : undefined;
}

function deriveCoverageStatus(input: {
  success: boolean;
  error?: string;
  data: any;
  isMutation?: boolean;
}): { coverageStatus: EvidenceCoverageStatus; totalCount?: number; returnedCount?: number; limitation?: string } {
  const err = String(input.error || "");
  if (!input.success) {
    if (err.includes("UNMET_PREREQUISITE") || err.includes("OBJECTIVE_UNMET_EMPTY_SOURCE")) {
      return {
        coverageStatus: "MUTATION_BLOCKED_UNMET_PREREQUISITE",
        limitation: err,
      };
    }
    if (
      err.includes("VALIDATION") ||
      err.includes("INVALID_PARAMETER") ||
      err.includes("UNREGISTERED") ||
      err.includes("REVOKED") ||
      err.includes("UNAUTHORIZED") ||
      err.includes("HITL")
    ) {
      return {
        coverageStatus: "AUTHORIZATION_OR_VALIDATION_FAILED",
        limitation: err,
      };
    }
    return {
      coverageStatus: "CAPABILITY_EXECUTION_FAILED",
      limitation: err || "Capability execution failed",
    };
  }

  const data = input.data;
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.messages)
      ? data.messages
      : Array.isArray(data?.files)
        ? data.files
        : Array.isArray(data)
          ? data
          : undefined;

  const returnedCount = typeof data?.returnedCount === "number" ? data.returnedCount : items?.length;
  const totalCount = typeof data?.totalCount === "number" ? data.totalCount : returnedCount;

  if (returnedCount === 0 && !input.isMutation) {
    return {
      coverageStatus: "READ_EMPTY",
      totalCount: totalCount ?? 0,
      returnedCount: 0,
      limitation: data?.emptyReason || "No matching records found for the requested criteria.",
    };
  }

  const missingCoverage =
    data?.coverage && typeof data.coverage.missingDays === "number" && data.coverage.missingDays > 0;
  const truncated = Boolean(data?.hasMore || data?.isTruncated || missingCoverage);

  if (truncated) {
    return {
      coverageStatus: "PARTIAL_RESULT",
      totalCount,
      returnedCount,
      limitation: missingCoverage
        ? `Partial coverage (${data.coverage.loggedDays ?? "?"}/${data.coverage.totalDays ?? "?"} days logged).`
        : data?.hasMore
          ? `Showing ${returnedCount ?? "?"} of ${totalCount ?? "?"} matching records.`
          : "Result payload was bounded.",
    };
  }

  return {
    coverageStatus: "READ_WITH_DATA",
    totalCount,
    returnedCount,
  };
}

export function buildExecutionEvidencePackage(input: {
  objective: string;
  temporalContext?: { localDate: string; dayOfWeek?: string; timezone: string };
  tailoredContextSummary?: string;
  steps: Array<{
    stepId: string;
    capabilityURN?: string;
    actionType?: string;
    parameters?: Record<string, any>;
    data?: any;
    status?: string;
    success?: boolean;
    error?: string;
    auditId?: string;
    integrityHash?: string;
    isTruncated?: boolean;
  }>;
}): ExecutionEvidencePackage {
  const registry = CapabilityRegistry.getInstance();
  const items: ExecutionEvidenceItem[] = [];
  const limitations: string[] = [];
  let runningChars = 0;

  for (const step of input.steps) {
    const urn = step.capabilityURN || step.actionType || "unknown";
    if (urn === "synthesis") continue;

    const desc = registry.getCapability(urn);
    const operationKind = desc?.operationKind || "READ";
    const isSuccess =
      typeof step.success === "boolean" ? step.success : step.status === "SUCCESS" || step.status === undefined;

    const derived = deriveCoverageStatus({
      success: isSuccess,
      error: step.error,
      data: step.data,
      isMutation: operationKind !== "READ",
    });

    let sanitized = sanitizeValue(step.data);
    let serialized = JSON.stringify(sanitized ?? null);
    let truncated = Boolean(step.isTruncated || derived.coverageStatus === "PARTIAL_RESULT");

    if (serialized.length > MAX_ITEM_CHARS) {
      truncated = true;
      sanitized = {
        preview: serialized.slice(0, MAX_ITEM_CHARS),
        truncated: true,
      };
      serialized = JSON.stringify(sanitized);
    }

    if (runningChars + serialized.length > MAX_TOTAL_EVIDENCE_CHARS && items.length > 0) {
      truncated = true;
      sanitized = { omittedForBudget: true, totalCount: derived.totalCount, returnedCount: derived.returnedCount };
      serialized = JSON.stringify(sanitized);
    }
    runningChars += serialized.length;

    if (derived.limitation) {
      limitations.push(`${urn}: ${derived.limitation}`);
    }

    if (urn === "lifeos.memory.search" && isSuccess && step.data) {
      if (step.data.retrievalMode === "lexical_only") {
        limitations.push("lifeos.memory.search: Retrieval ran in lexical-only mode while semantic vector matching was unavailable.");
      }
      const memItems = Array.isArray(step.data.items) ? step.data.items : [];
      if (memItems.some((m: any) => m?.isDisputed)) {
        limitations.push("lifeos.memory.search: Some remembered items have unresolved conflicts and should be surfaced with ambiguity.");
      }
      if (memItems.some((m: any) => m?.isStale)) {
        limitations.push("lifeos.memory.search: Some remembered items are marked stale and may be outdated.");
      }
    }

    items.push({
      stepId: step.stepId,
      capabilityURN: urn,
      operationKind,
      provenance: {
        auditId: step.auditId,
        integrityHash: step.integrityHash,
      },
      executionStatus: isSuccess ? "SUCCESS" : step.status || "FAILED",
      coverageStatus: derived.coverageStatus,
      queriedRange: extractQueriedRange(step.parameters),
      totalCount: derived.totalCount,
      returnedCount: derived.returnedCount,
      truncated,
      allowlistedSummary: sanitized,
      limitation: derived.limitation,
    });
  }

  return {
    objective: input.objective,
    temporalContext: input.temporalContext,
    tailoredContextSummary: input.tailoredContextSummary
      ? input.tailoredContextSummary.slice(0, 1200)
      : undefined,
    items,
    limitations: Array.from(new Set(limitations)),
    serializedCharCount: runningChars,
  };
}
