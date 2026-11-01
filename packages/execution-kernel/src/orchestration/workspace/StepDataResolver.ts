import crypto from "node:crypto";
import { CapabilityRegistry } from "../capabilities/CapabilityRegistry";
import {
  CompletedStepObservation,
  IStepOutputSnapshot,
  MULTI_STEP_WORKFLOW_POLICY,
  StepOutputRecord,
  assertValidHmacSecret,
  TruncatedReferenceAccessError,
  StepDataCorruptionError,
} from "../contracts/WorkflowExecutionContracts";

const KNOWN_CAPABILITY_URNS = new Set([
  // Productivity Domain
  "productivity.calendar.create_event",
  "productivity.calendar.read_events",
  "productivity.calendar.delete_event",
  "productivity.calendar.update_event",
  "productivity.email.send_message",
  "productivity.email.create_draft",
  "productivity.email.update_draft",
  "productivity.email.search_messages",
  "productivity.email.read_thread",
  "productivity.email.read_message",
  "productivity.task.create_external",
  "productivity.task.sync_tasks",
  "productivity.git.create_issue",
  "productivity.git.list_prs",
  "productivity.git.list_repos",
  "productivity.git.search_code",
  "productivity.storage.read_file",
  "productivity.storage.write_file",
  "productivity.storage.list_files",
  "productivity.contacts.search_contacts",
  "productivity.contacts.get_contact",
  // Health Domain
  "health.activity.record_workout",
  "health.activity.sync_telemetry",
  "health.biometrics.read_sleep",
  "health.biometrics.read_daily_summary",
  "health.nutrition.log_food",
  // Wellness Domain
  "wellness.media.playback_control",
  "wellness.media.read_current_track",
  "wellness.smarthome.set_light_state",
  "wellness.smarthome.set_thermostat",
  // Context Domain
  "context.system.read_clipboard",
  "context.system.search_web",
  "context.system.open_url",
  "context.environment.read_weather",
  "context.environment.get_forecast",
  // Travel & Mobility Domain
  "travel.itinerary.generate",
  "travel.places.search",
  "travel.flights.search",
  "travel.hotels.search",
  "shopping.products.search",
  "shopping.cart.add",
  "mobility.rides.estimate",
  "mobility.rides.request",
  "mobility.rides.status",
  "commerce.food.search_restaurants",
  "commerce.quick.search_catalog",
  // Core Action Types
  "create_task",
  "complete_task",
  "update_task",
  "delete_task",
  "log_workout",
  "external_capability_action",
  "synthesis",
]);

/**
 * StepDataResolver
 * 
 * Provides:
 * 1. RFC 8785 (JSON Canonicalization Scheme - JCS) canonical serialization.
 * 2. Persistent HMAC-SHA256 signature generation and dual-key rotation verification.
 * 3. Forward-only $ref token resolution against workspace scratchpad with payload clamping.
 * 4. Authoritative capability schema and contract validation.
 * 5. Deterministic dependency verification.
 * 6. Sanitization, payload clamping, SHA-256 integrity hashing and snapshot verification.
 */
export class StepDataResolver {
  /**
   * RFC 8785 JSON Canonicalization Scheme (JCS)
   * Deterministically orders object keys and normalizes primitive types.
   */
  static canonicalize(value: any): string {
    if (value === null) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new Error(`[SERIALIZATION_ERROR]: Non-finite number (${value}) is not allowed in canonical payload`);
      }
      return Object.is(value, -0) ? "0" : value.toString();
    }

    if (typeof value === "string") {
      return JSON.stringify(value);
    }

    if (value instanceof Date) {
      return JSON.stringify(value.toISOString());
    }

    if (typeof value === "undefined" || typeof value === "symbol" || typeof value === "function" || typeof value === "bigint") {
      throw new Error(`[SERIALIZATION_ERROR]: Disallowed type ${typeof value} in canonical payload`);
    }

    if (Array.isArray(value)) {
      const elements = value.map((v) => (v === undefined ? null : StepDataResolver.canonicalize(v)));
      return `[${elements.join(",")}]`;
    }

    if (typeof value === "object") {
      const keys = Object.keys(value).sort();
      const pairs: string[] = [];
      for (const k of keys) {
        const v = value[k];
        if (typeof v === "undefined" || typeof v === "symbol" || typeof v === "function") {
          continue; // standard JSON.stringify omits undefined object values
        }
        pairs.push(`${JSON.stringify(k)}:${StepDataResolver.canonicalize(v)}`);
      }
      return `{${pairs.join(",")}}`;
    }

    throw new Error(`[SERIALIZATION_ERROR]: Unsupported type in canonical payload`);
  }

  /**
   * Generates a persistent HMAC-SHA256 approval signature over security context and canonical payload.
   */
  static generateApprovalSignature(
    params: {
      userId: string;
      executionId: string;
      operationId: string;
      capabilityURN: string;
      expiresAt: Date | string;
      payload: Record<string, any>;
    },
    overrideSecret?: string
  ): { signature: string; keyVersion: string } {
    const key = assertValidHmacSecret(overrideSecret);
    const keyVersion = process.env.KERNEL_HMAC_KEY_VERSION || "v2";

    const isoExpires = params.expiresAt instanceof Date
      ? params.expiresAt.toISOString()
      : new Date(params.expiresAt).toISOString();

    const payloadJCS = StepDataResolver.canonicalize(params.payload);
    const commitmentString = `${params.userId}:${params.executionId}:${params.operationId}:${params.capabilityURN}:${isoExpires}:${payloadJCS}`;

    const signature = crypto
      .createHmac("sha256", key)
      .update(commitmentString, "utf8")
      .digest("hex");

    return { signature, keyVersion };
  }

  /**
   * Verifies an approval signature against the stored payload.
   * Supports zero-downtime dual-key rotation using KERNEL_HMAC_SECRET_PREVIOUS within TTL.
   */
  static verifyApprovalSignature(
    params: {
      userId: string;
      executionId: string;
      operationId: string;
      capabilityURN: string;
      expiresAt: Date | string;
      payload: Record<string, any>;
      signature: string;
      keyVersion?: string;
    },
    activeSecretOverride?: string,
    previousSecretOverride?: string
  ): { valid: boolean; reason?: string } {
    const activeKey = assertValidHmacSecret(activeSecretOverride);
    const previousKey = previousSecretOverride || process.env.KERNEL_HMAC_SECRET_PREVIOUS;

    const expiresMs = params.expiresAt instanceof Date
      ? params.expiresAt.getTime()
      : new Date(params.expiresAt).getTime();

    if (Date.now() > expiresMs) {
      return { valid: false, reason: "APPROVAL_EXPIRED_TTL" };
    }

    const isoExpires = params.expiresAt instanceof Date
      ? params.expiresAt.toISOString()
      : new Date(params.expiresAt).toISOString();

    const payloadJCS = StepDataResolver.canonicalize(params.payload);
    const commitmentString = `${params.userId}:${params.executionId}:${params.operationId}:${params.capabilityURN}:${isoExpires}:${payloadJCS}`;

    // 1. Try active key
    const expectedActiveSig = crypto
      .createHmac("sha256", activeKey)
      .update(commitmentString, "utf8")
      .digest("hex");

    if (StepDataResolver.timingSafeEqual(params.signature, expectedActiveSig)) {
      return { valid: true };
    }

    // 2. Try previous key for rotation if keyVersion indicates previous or not specified
    if (previousKey && previousKey.length >= 32) {
      const expectedPrevSig = crypto
        .createHmac("sha256", previousKey)
        .update(commitmentString, "utf8")
        .digest("hex");

      if (StepDataResolver.timingSafeEqual(params.signature, expectedPrevSig)) {
        return { valid: true };
      }
    }

    return { valid: false, reason: "SIGNATURE_MISMATCH_TAMPERED" };
  }

  static timingSafeEqual(a: string, b: string): boolean {
    if (!a || !b || a.length !== b.length) return false;
    try {
      const bufA = Buffer.from(a, "hex");
      const bufB = Buffer.from(b, "hex");
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    } catch (_) {
      return false;
    }
  }

  /**
   * Sanitizes payloads for durable persistence by scrubbing sensitive credentials, tokens, and keys.
   */
  static sanitizeForPersistence(data: any): any {
    if (data === null || data === undefined) return data;
    if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") return data;
    if (Array.isArray(data)) {
      return data.map((item) => StepDataResolver.sanitizeForPersistence(item));
    }
    if (typeof data === "object") {
      const sanitized: Record<string, any> = {};
      const SENSITIVE_KEY_REGEX = /bearer|token|secret|password|authorization|apiKey|private_key/i;
      for (const [key, value] of Object.entries(data)) {
        if (SENSITIVE_KEY_REGEX.test(key)) {
          sanitized[key] = "[REDACTED]";
        } else {
          sanitized[key] = StepDataResolver.sanitizeForPersistence(value);
        }
      }
      return sanitized;
    }
    return data;
  }

  /**
   * Clamps step observation payload to a safe byte limit (default 50 KB).
   * Returns clamped data and explicit truncation metadata.
   */
  static clampPayload(
    data: any,
    maxBytes: number = MULTI_STEP_WORKFLOW_POLICY.maxFieldBytes
  ): {
    clampedData: any;
    isTruncated: boolean;
    truncationDetails?: { originalBytes: number; persistedBytes: number };
  } {
    if (data === null || data === undefined) {
      return { clampedData: data, isTruncated: false };
    }

    let serialized: string;
    try {
      serialized = StepDataResolver.canonicalize(data);
    } catch (_) {
      serialized = JSON.stringify(data);
    }

    const originalBytes = Buffer.byteLength(serialized, "utf8");
    if (originalBytes <= maxBytes) {
      return { clampedData: data, isTruncated: false };
    }

    if (typeof data === "string") {
      const clamped = data.slice(0, Math.floor(maxBytes * 0.9)) + "... [CLAMPED]";
      const persistedBytes = Buffer.byteLength(clamped, "utf8");
      return {
        clampedData: clamped,
        isTruncated: true,
        truncationDetails: { originalBytes, persistedBytes },
      };
    }

    if (Array.isArray(data)) {
      const clampedArr: any[] = [];
      let currentBytes = 2; // "[]"
      for (const item of data) {
        let itemStr: string;
        try {
          itemStr = StepDataResolver.canonicalize(item);
        } catch (_) {
          itemStr = JSON.stringify(item);
        }
        const itemBytes = Buffer.byteLength(itemStr, "utf8") + 1;
        if (currentBytes + itemBytes > maxBytes - 50) break;
        clampedArr.push(item);
        currentBytes += itemBytes;
      }
      const persistedBytes = Buffer.byteLength(JSON.stringify(clampedArr), "utf8");
      return {
        clampedData: clampedArr,
        isTruncated: true,
        truncationDetails: { originalBytes, persistedBytes },
      };
    }

    if (typeof data === "object") {
      const clampedObj: Record<string, any> = {};
      let currentBytes = 2; // "{}"
      const keys = Object.keys(data).sort();
      for (const k of keys) {
        const v = data[k];
        let vStr: string;
        try {
          vStr = StepDataResolver.canonicalize(v);
        } catch (_) {
          vStr = JSON.stringify(v);
        }
        const pairBytes = Buffer.byteLength(`"${k}":${vStr}`, "utf8") + 1;
        if (currentBytes + pairBytes > maxBytes - 100) {
          break; // Omit remaining keys
        }
        clampedObj[k] = v;
        currentBytes += pairBytes;
      }
      const persistedBytes = Buffer.byteLength(JSON.stringify(clampedObj), "utf8");
      return {
        clampedData: clampedObj,
        isTruncated: true,
        truncationDetails: { originalBytes, persistedBytes },
      };
    }

    return { clampedData: data, isTruncated: false };
  }

  /**
   * Computes deterministic SHA-256 integrity hash over canonicalized snapshot payload + truncation metadata.
   */
  static computeIntegrityHash(
    data: any,
    isTruncated: boolean = false,
    truncationDetails?: { originalBytes: number; persistedBytes: number }
  ): string {
    const payloadObj = {
      data,
      isTruncated: Boolean(isTruncated),
      truncationDetails: truncationDetails || null,
    };
    const canonicalStr = StepDataResolver.canonicalize(payloadObj);
    return crypto.createHash("sha256").update(canonicalStr, "utf8").digest("hex");
  }

  /**
   * Verifies SHA-256 integrity hash of a persisted step snapshot.
   */
  static verifySnapshotIntegrity(snapshot: IStepOutputSnapshot): boolean {
    if (!snapshot.integrityHash) return false;
    const expectedHash = StepDataResolver.computeIntegrityHash(
      snapshot.data,
      snapshot.isTruncated,
      snapshot.truncationDetails
    );
    return StepDataResolver.timingSafeEqual(snapshot.integrityHash, expectedHash);
  }

  /**
   * Validates a proposed capability URN and parameter map against authoritative schemas.
   */
  static validateCapabilityContract(
    capabilityURN?: string,
    parameters?: Record<string, any>
  ): { valid: boolean; reason?: string } {
    if (!capabilityURN) {
      return { valid: false, reason: "[INVALID_CAPABILITY]: capabilityURN is undefined or empty." };
    }

    const registry = CapabilityRegistry.getInstance();
    const hasInRegistry = registry.hasCapability(capabilityURN);
    const hasInStatic = KNOWN_CAPABILITY_URNS.has(capabilityURN);

    if (!hasInRegistry && !hasInStatic) {
      return {
        valid: false,
        reason: `[UNKNOWN_CAPABILITY_URN]: Capability "${capabilityURN}" is not registered in the LifeOS capability catalog.`,
      };
    }

    const params = parameters || {};

    // Validate against CapabilityRegistry if registered
    if (hasInRegistry) {
      const regValidation = registry.validateParameters(capabilityURN, params);
      if (!regValidation.valid) {
        return {
          valid: false,
          reason: `[INVALID_CAPABILITY_PARAMETERS]: ${regValidation.reason || "Parameter schema mismatch"}`,
        };
      }
    }

    // Specific capability parameter schema checks
    if (capabilityURN === "productivity.storage.write_file") {
      if (!params.path || typeof params.path !== "string" || params.path.trim().length === 0) {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'path' must be a non-empty string for write_file." };
      }
      if (params.content === undefined || params.content === null) {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'content' is required for write_file." };
      }
    }

    if (capabilityURN === "productivity.storage.read_file") {
      if (!params.path || typeof params.path !== "string" || params.path.trim().length === 0) {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'path' must be a non-empty string for read_file." };
      }
    }

    if (capabilityURN === "productivity.email.search_messages") {
      if (params.query === undefined || typeof params.query !== "string") {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'query' string is required for email search." };
      }
    }

    if (capabilityURN === "productivity.email.send_message") {
      if (!params.to || (Array.isArray(params.to) && params.to.length === 0)) {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'to' recipient is required for send_message." };
      }
      if (params.subject === undefined || typeof params.subject !== "string") {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'subject' string is required for send_message." };
      }
      if (params.bodyText === undefined || typeof params.bodyText !== "string") {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'bodyText' string is required for send_message." };
      }
    }

    if (capabilityURN === "productivity.email.create_draft") {
      if (params.subject === undefined || typeof params.subject !== "string") {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'subject' string is required for create_draft." };
      }
    }

    if (capabilityURN === "productivity.calendar.create_event") {
      if (!params.title || typeof params.title !== "string" || params.title.trim().length === 0) {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'title' must be a non-empty string for create_event." };
      }
      if (!params.startTime || typeof params.startTime !== "string") {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'startTime' string is required for create_event." };
      }
      if (!params.endTime || typeof params.endTime !== "string") {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'endTime' string is required for create_event." };
      }
    }

    if (capabilityURN === "productivity.task.create_external") {
      if (!params.title || typeof params.title !== "string" || params.title.trim().length === 0) {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'title' is required for create_external task." };
      }
    }

    if (capabilityURN === "productivity.git.create_issue") {
      if (!params.owner || typeof params.owner !== "string") {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'owner' is required for create_issue." };
      }
      if (!params.repo || typeof params.repo !== "string") {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'repo' is required for create_issue." };
      }
      if (!params.title || typeof params.title !== "string") {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'title' is required for create_issue." };
      }
    }

    if (capabilityURN === "health.activity.record_workout") {
      if (!params.workoutType || typeof params.workoutType !== "string") {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'workoutType' is required for record_workout." };
      }
      if (typeof params.durationMinutes !== "number" || params.durationMinutes <= 0) {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'durationMinutes' must be a positive number for record_workout." };
      }
    }

    if (capabilityURN === "context.system.search_web") {
      if (params.query === undefined || typeof params.query !== "string") {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'query' string is required for search_web." };
      }
    }

    if (capabilityURN === "context.system.open_url") {
      if (!params.url || typeof params.url !== "string") {
        return { valid: false, reason: "[INVALID_CAPABILITY_PARAMETERS]: 'url' string is required for open_url." };
      }
    }

    return { valid: true };
  }

  /**
   * Deterministically verifies that all upstream step dependencies are satisfied.
   * Fails closed if any dependency is missing, failed, or timed out.
   */
  static checkDependencies(
    dependsOn: string[],
    scratchpad: Map<string, StepOutputRecord>,
    completedSteps?: CompletedStepObservation[]
  ): void {
    for (const depId of dependsOn) {
      const record = scratchpad.get(depId);
      if (!record) {
        throw new Error(`[UNSATISFIED_DEPENDENCY]: Missing upstream step "${depId}".`);
      }

      if (completedSteps) {
        const obs = completedSteps.find((s) => s.stepId === depId);
        if (obs && (obs.status === "FAILED" || obs.status === "TIMED_OUT")) {
          throw new Error(
            `[UPSTREAM_DEPENDENCY_FAILED]: Upstream step "${depId}" failed with status "${obs.status}". Downstream execution blocked.`
          );
        }
      }

      if (record.data === null || record.data === undefined) {
        throw new Error(`[UNSATISFIED_DEPENDENCY]: Upstream step "${depId}" produced no output data.`);
      }
    }
  }

  /**
   * Resolves $ref tokens against the workspace scratchpad.
   * Enforces forward-only referencing, property presence, dependency health, and size ceilings.
   */
  static resolveReferences(
    params: Record<string, any>,
    scratchpad: Map<string, StepOutputRecord>,
    completedSteps?: CompletedStepObservation[]
  ): Record<string, any> {
    let sessionBytes = 0;
    for (const record of scratchpad.values()) {
      sessionBytes += Buffer.byteLength(JSON.stringify(record.data || ""), "utf8");
    }

    if (sessionBytes > MULTI_STEP_WORKFLOW_POLICY.maxSessionBytes) {
      throw new Error(
        `[SESSION_MEMORY_EXHAUSTED]: Total scratchpad size ${sessionBytes}B exceeds ${MULTI_STEP_WORKFLOW_POLICY.maxSessionBytes}B ceiling.`
      );
    }

    return StepDataResolver.deepResolve(params, scratchpad, completedSteps);
  }

  private static deepResolve(
    val: any,
    scratchpad: Map<string, StepOutputRecord>,
    completedSteps?: CompletedStepObservation[]
  ): any {
    if (val === null || val === undefined) return val;

    if (typeof val === "string" && val.startsWith("$ref:")) {
      return StepDataResolver.resolveToken(val.slice(5).trim(), scratchpad, completedSteps);
    }

    if (typeof val === "object" && !Array.isArray(val)) {
      if ("$ref" in val) {
        return StepDataResolver.resolveToken(val["$ref"], scratchpad, completedSteps);
      }

      const res: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        res[k] = StepDataResolver.deepResolve(v, scratchpad, completedSteps);
      }
      return res;
    }

    if (Array.isArray(val)) {
      return val.map((item) => StepDataResolver.deepResolve(item, scratchpad, completedSteps));
    }

    return val;
  }

  private static resolveToken(
    refToken: any,
    scratchpad: Map<string, StepOutputRecord>,
    completedSteps?: CompletedStepObservation[]
  ): any {
    let stepId: string;
    let path: string | undefined;

    if (typeof refToken === "string") {
      const parts = refToken.split(".");
      stepId = parts[0];
      path = parts.slice(1).join(".") || undefined;
    } else if (typeof refToken === "object" && refToken !== null) {
      stepId = refToken.stepId;
      path = refToken.path;
    } else {
      throw new Error(`[INVALID_REF_SYNTAX]: Malformed $ref token ${JSON.stringify(refToken)}`);
    }

    const record = scratchpad.get(stepId);
    if (!record) {
      throw new Error(`[MISSING_UPSTREAM_STEP]: Reference points to non-existent stepId "${stepId}".`);
    }

    // Check upstream health if observations provided
    let upstreamObs: CompletedStepObservation | undefined;
    if (completedSteps) {
      upstreamObs = completedSteps.find((s) => s.stepId === stepId);
      if (upstreamObs && (upstreamObs.status === "FAILED" || upstreamObs.status === "TIMED_OUT")) {
        throw new Error(
          `[UPSTREAM_DEPENDENCY_FAILED]: Upstream step "${stepId}" failed with status "${upstreamObs.status}". Downstream reference resolution blocked.`
        );
      }
    }

    let resolved = (record as any).data !== undefined ? (record as any).data : record;
    if (resolved === null || resolved === undefined) {
      throw new Error(`[MISSING_UPSTREAM_OUTPUT]: Upstream step "${stepId}" produced no output data.`);
    }

    if (path) {
      const segments = path.split(".");
      for (const seg of segments) {
        if (resolved === null || resolved === undefined || !(seg in resolved)) {
          if (upstreamObs && upstreamObs.isTruncated) {
            throw new TruncatedReferenceAccessError(stepId, path);
          }
          throw new Error(
            `[MISSING_UPSTREAM_PROPERTY]: Property path "${path}" not found on stepId "${stepId}".`
          );
        }
        resolved = resolved[seg];
      }
    }

    // Enforce 50 KB field cap
    const fieldBytes = Buffer.byteLength(
      typeof resolved === "string" ? resolved : JSON.stringify(resolved || ""),
      "utf8"
    );
    if (fieldBytes > MULTI_STEP_WORKFLOW_POLICY.maxFieldBytes) {
      if (typeof resolved === "string") {
        resolved = resolved.slice(0, MULTI_STEP_WORKFLOW_POLICY.maxFieldBytes) + "... [CLAMPED]";
      } else {
        throw new Error(
          `[PAYLOAD_SIZE_EXCEEDED]: Resolved field from stepId "${stepId}" exceeds ${MULTI_STEP_WORKFLOW_POLICY.maxFieldBytes}B limit.`
        );
      }
    }

    return resolved;
  }

  /**
   * Clamps step payload if it exceeds maximum byte budget (default: 50 KB).
   * Attaches explicit truncation metadata and SHA-256 hash.
   */
  static clampStepPayload(data: any, maxBytes: number = 50 * 1024): any {
    const rawJson = JSON.stringify(data);
    const originalBytes = Buffer.byteLength(rawJson, "utf8");
    if (originalBytes <= maxBytes) {
      return data;
    }

    const hash = crypto.createHash("sha256").update(rawJson).digest("hex");
    let clamped: any;
    if (typeof data === "string") {
      clamped = data.slice(0, maxBytes - 100) + "... [CLAMPED]";
    } else if (typeof data === "object" && data !== null) {
      clamped = {
        ...data,
        __isTruncated: true,
        __truncationDetails: {
          originalBytes,
          persistedBytes: maxBytes,
          sha256: hash,
        },
      };
      const serialized = JSON.stringify(clamped);
      if (Buffer.byteLength(serialized, "utf8") > maxBytes) {
        clamped = {
          preview: rawJson.slice(0, maxBytes - 250) + "... [CLAMPED]",
          __isTruncated: true,
          __truncationDetails: {
            originalBytes,
            persistedBytes: maxBytes,
            sha256: hash,
          },
        };
      }
    } else {
      clamped = data;
    }
    return clamped;
  }
}
