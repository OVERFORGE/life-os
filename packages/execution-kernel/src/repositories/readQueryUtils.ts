import crypto from "node:crypto";
import mongoose from "mongoose";

export const STAGE1_READ_QUERY_TIMEOUT_MS = 2500;

export type UserIdStorageMode = "MIXED" | "OBJECT_ID" | "STRING";

/**
 * Fails closed when MongoDB is not connected (readyState !== 1).
 * Stage 1 read capabilities never return synthetic or mock data on DB disconnect.
 */
export function assertReadDbReady(capabilityURN: string): void {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    throw new Error(
      `[READ_DB_DISCONNECTED]: Cannot execute '${capabilityURN}' because MongoDB is disconnected.`
    );
  }
}

/**
 * Builds a tenant-scoped userId matcher tailored to the target Mongoose schema type.
 */
export function buildUserIdMatcher(userId: string, mode: "STRING"): string;
export function buildUserIdMatcher(userId: string, mode: "OBJECT_ID"): mongoose.Types.ObjectId;
export function buildUserIdMatcher(
  userId: string,
  mode: "MIXED"
): string | { $in: Array<string | mongoose.Types.ObjectId> };
export function buildUserIdMatcher(
  userId: string,
  mode: UserIdStorageMode
): string | mongoose.Types.ObjectId | { $in: Array<string | mongoose.Types.ObjectId> } {
  const normalized = typeof userId === "string" ? userId.trim() : "";
  if (!normalized) {
    throw new Error("[INVALID_USER_ID]: Authenticated userId is required for read queries.");
  }

  if (mode === "STRING") {
    return normalized;
  }

  if (mode === "OBJECT_ID") {
    if (!mongoose.Types.ObjectId.isValid(normalized)) {
      throw new Error(`[INVALID_USER_ID]: Invalid ObjectId '${normalized}' for ObjectId-scoped model.`);
    }
    return new mongoose.Types.ObjectId(normalized);
  }

  // MIXED: match both string and ObjectId representations
  if (mongoose.Types.ObjectId.isValid(normalized)) {
    return { $in: [normalized, new mongoose.Types.ObjectId(normalized)] };
  }
  return normalized;
}

/**
 * Validates a strict YYYY-MM-DD calendar date string (rejects invalid dates like 2026-02-30).
 */
export function validateCalendarDate(dateStr: string): { valid: boolean; reason?: string } {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { valid: false, reason: `Invalid date format '${dateStr}'. Expected YYYY-MM-DD.` };
  }
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return { valid: false, reason: `Non-existent calendar date '${dateStr}'.` };
  }
  return { valid: true };
}

/**
 * Computes inclusive calendar day count between startDate and endDate (YYYY-MM-DD).
 * Example: 2026-05-01 to 2026-05-01 => 1 day.
 * Throws if either date is invalid or endDate < startDate.
 */
export function calculateInclusiveDayCount(startDate: string, endDate: string): number {
  const sCheck = validateCalendarDate(startDate);
  if (!sCheck.valid) {
    throw new Error(`[INVALID_DATE_RANGE]: ${sCheck.reason}`);
  }
  const eCheck = validateCalendarDate(endDate);
  if (!eCheck.valid) {
    throw new Error(`[INVALID_DATE_RANGE]: ${eCheck.reason}`);
  }

  const [sy, sm, sd] = startDate.split("-").map((n) => parseInt(n, 10));
  const [ey, em, ed] = endDate.split("-").map((n) => parseInt(n, 10));
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);

  if (endMs < startMs) {
    throw new Error(
      `[INVALID_DATE_RANGE]: endDate (${endDate}) must be on or after startDate (${startDate}).`
    );
  }

  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

/**
 * Enforces bounded pagination parameters.
 */
export function clampPagination(
  limit?: number,
  offset?: number,
  defaultLimit: number = 50,
  maxLimit: number = 100,
  maxOffset: number = 5000
): { limit: number; offset: number } {
  const rawLimit = typeof limit === "number" && Number.isFinite(limit) ? Math.floor(limit) : defaultLimit;
  const rawOffset = typeof offset === "number" && Number.isFinite(offset) ? Math.floor(offset) : 0;

  return {
    limit: Math.min(maxLimit, Math.max(1, rawLimit)),
    offset: Math.min(maxOffset, Math.max(0, rawOffset)),
  };
}

/**
 * Strips internal concurrency/mongoose metadata fields from returned read DTOs.
 */
export function redactInternalFields<T extends Record<string, any>>(
  doc: T,
  extraStripKeys: string[] = []
): Record<string, any> {
  const stripSet = new Set(["__v", "recentMutationReceipts", "mutationEpoch", ...extraStripKeys]);
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (stripSet.has(key)) continue;
    if (key === "_id" && value != null) {
      out._id = typeof value === "object" && typeof value.toString === "function" ? value.toString() : String(value);
      continue;
    }
    if (key === "goalId" && value != null) {
      out.goalId = typeof value === "object" && typeof value.toString === "function" ? value.toString() : String(value);
      continue;
    }
    if (key === "parentTaskId" && value != null) {
      out.parentTaskId = typeof value === "object" && typeof value.toString === "function" ? value.toString() : String(value);
      continue;
    }
    if (key === "userId" && value != null) {
      out.userId = typeof value === "object" && typeof value.toString === "function" ? value.toString() : String(value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Escapes user-supplied search strings before building a MongoDB $regex query.
 */
export function escapeSearchRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a bounded, sanitized audit summary + SHA-256 result hash for READ capabilities.
 * Sensitive free-text fields (e.g., reflection, notes, titles) are excluded.
 */
export function buildSanitizedReadAuditSummary(
  capabilityURN: string,
  result: Record<string, any>
): Record<string, any> {
  const canonical = JSON.stringify(result ?? {});
  const resultHash = crypto.createHash("sha256").update(canonical).digest("hex");
  return {
    _auditSummary: true,
    capabilityURN,
    returnedCount: typeof result?.returnedCount === "number" ? result.returnedCount : undefined,
    totalCount: typeof result?.totalCount === "number" ? result.totalCount : undefined,
    hasMore: typeof result?.hasMore === "boolean" ? result.hasMore : undefined,
    emptyReason: typeof result?.emptyReason === "string" ? result.emptyReason : undefined,
    availabilityStatus: typeof result?.availabilityStatus === "string" ? result.availabilityStatus : undefined,
    resultHash,
    recordedAt: Date.now(),
  };
}
