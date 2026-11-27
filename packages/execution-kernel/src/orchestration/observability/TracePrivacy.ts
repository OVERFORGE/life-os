/**
 * TracePrivacy.ts
 *
 * Enforces observability privacy & bounded payload governance:
 * - Strips <think> / <planning> internal reasoning tags
 * - Redacts tokens, secrets, credentials, passwords, and signatures
 * - Truncates oversized strings/arrays/objects cleanly
 */

const MAX_FIELD_CHARS = 16384;
const MAX_ARRAY_ITEMS = 25;
const MAX_OBJECT_DEPTH = 6;

const SENSITIVE_KEY_PATTERN =
  /^(password|passcode|secret|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|authorization|cookie|set-cookie|approvalSignature|envelopeHmac|privateKey|clientSecret|webhookSecret|credentials)$/i;

export function stripReasoningTags(text: string): string {
  if (!text) return "";
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "[redacted-reasoning]")
    .replace(/<planning>[\s\S]*?<\/planning>/gi, "[redacted-planning]")
    .trim();
}

export function redactStringSecrets(text: string): string {
  const cleaned = stripReasoningTags(text);
  return cleaned
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(gsk_|lsv2_|sk-|AIza)[A-Za-z0-9\-_]{10,}\b/g, "$1[REDACTED]")
    .replace(/(mongodb(\+srv)?:\/\/[^:]+:)[^@]+(@)/gi, "$1[REDACTED]$3");
}

export function sanitizeTracePayload(value: unknown, depth = 0): any {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    const redacted = redactStringSecrets(value);
    if (redacted.length > MAX_FIELD_CHARS) {
      return `${redacted.slice(0, MAX_FIELD_CHARS)}... [_truncated:${redacted.length}chars]`;
    }
    return redacted;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= MAX_OBJECT_DEPTH) {
    return "[_truncated:max_depth]";
  }

  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeTracePayload(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      sliced.push(`[_truncated_items:${value.length - MAX_ARRAY_ITEMS}]`);
    }
    return sliced;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, any>;
    const out: Record<string, any> = {};
    const keys = Object.keys(obj);
    for (let i = 0; i < Math.min(keys.length, 60); i++) {
      const k = keys[i];
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeTracePayload(obj[k], depth + 1);
      }
    }
    if (keys.length > 60) {
      out._truncatedKeys = keys.length - 60;
    }
    return out;
  }

  return String(value);
}
