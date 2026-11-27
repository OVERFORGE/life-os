/**
 * CapabilityRegistry.ts
 *
 * Authoritative registry managing capability discovery, deterministic RFC 8785
 * contract hashing, JSON Schema parameter validation, and 4-tier provider error classification.
 * Consolidates internal adapters, external modular providers, and MCP tools.
 */

import crypto from "node:crypto";
import {
  CapabilityDescriptor,
  CapabilityDiscoverySummary,
  CapabilityQueryFilter,
  CapabilitySource,
  CapabilityValidationResult,
  ProviderErrorCategory,
  ProviderErrorClassification,
} from "./CapabilityContracts";

export class CapabilityRegistry {
  private static instance: CapabilityRegistry;
  private capabilities: Map<string, CapabilityDescriptor> = new Map();

  constructor() {
    this.seedStandardCapabilities();
  }

  static getInstance(): CapabilityRegistry {
    if (!CapabilityRegistry.instance) {
      CapabilityRegistry.instance = new CapabilityRegistry();
    }
    return CapabilityRegistry.instance;
  }

  static getCapability(capabilityURN: string): CapabilityDescriptor | undefined {
    return CapabilityRegistry.getInstance().getCapability(capabilityURN);
  }

  static hasCapability(capabilityURN: string): boolean {
    return CapabilityRegistry.getInstance().hasCapability(capabilityURN);
  }

  static resetForTesting(): void {
    CapabilityRegistry.instance = new CapabilityRegistry();
  }

  /**
   * RFC 8785 JSON Canonicalization Scheme (JCS)
   */
  static canonicalize(value: any): string {
    if (value === null) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new Error(`[JCS_ERROR]: Non-finite number (${value}) not allowed in canonical payload`);
      }
      return Object.is(value, -0) ? "0" : value.toString();
    }
    if (typeof value === "string") {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      const items = value.map((item) => CapabilityRegistry.canonicalize(item));
      return `[${items.join(",")}]`;
    }
    if (typeof value === "object") {
      const sortedKeys = Object.keys(value).sort();
      const entries = sortedKeys
        .filter((k) => value[k] !== undefined)
        .map((k) => `${JSON.stringify(k)}:${CapabilityRegistry.canonicalize(value[k])}`);
      return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value);
  }

  /**
   * Deterministically computes the SHA-256 contractHash for a capability descriptor using RFC 8785 JCS.
   */
  static computeContractHash(descriptor: Partial<CapabilityDescriptor>): string {
    const canonicalPayload = {
      capabilityURN: descriptor.capabilityURN || "",
      source: descriptor.source || "INTERNAL_ADAPTER",
      category: descriptor.category || "general",
      operationKind: descriptor.operationKind || "",
      parametersSchema: descriptor.parametersSchema || {},
      outputSchema: descriptor.outputSchema || {},
      requiredResources: descriptor.requiredResources || [],
      isIdempotent: Boolean(descriptor.isIdempotent),
      isReversible: Boolean(descriptor.isReversible),
      requiresApproval: Boolean(descriptor.requiresApproval),
      verificationMethod: descriptor.verificationMethod || "NONE",
      timeoutMs: descriptor.timeoutMs || 30000,
    };

    const canonicalJson = CapabilityRegistry.canonicalize(canonicalPayload);
    return crypto.createHash("sha256").update(canonicalJson).digest("hex");
  }

  /**
   * Registers a capability descriptor. If contractHash is missing, computes it deterministically.
   */
  registerCapability(descriptor: Omit<CapabilityDescriptor, "contractHash"> & { contractHash?: string }): CapabilityDescriptor {
    const contractHash = descriptor.contractHash || CapabilityRegistry.computeContractHash(descriptor);
    const fullDescriptor: CapabilityDescriptor = {
      ...descriptor,
      contractHash,
      status: descriptor.status || "ACTIVE",
    };

    this.capabilities.set(fullDescriptor.capabilityURN, fullDescriptor);
    return fullDescriptor;
  }

  unregisterCapability(capabilityURN: string): boolean {
    return this.capabilities.delete(capabilityURN);
  }

  getCapability(capabilityURN: string): CapabilityDescriptor | undefined {
    return this.capabilities.get(capabilityURN);
  }

  hasCapability(capabilityURN: string): boolean {
    return this.capabilities.has(capabilityURN);
  }

  /**
   * Queries registered capabilities with tag, category, source, keyword matching.
   */
  listCapabilities(filter?: CapabilityQueryFilter): CapabilityDescriptor[] {
    const all = Array.from(this.capabilities.values());
    return all.filter((desc) => {
      // Exclude revoked capabilities by default
      if (desc.status === "REVOKED") return false;

      if (filter?.category && desc.category.toLowerCase() !== filter.category.toLowerCase()) {
        return false;
      }
      if (filter?.source && desc.source !== filter.source) {
        return false;
      }
      if (filter?.operationKind && desc.operationKind !== filter.operationKind) {
        return false;
      }
      if (filter?.supportsIdempotency !== undefined && desc.isIdempotent !== filter.supportsIdempotency) {
        return false;
      }
      if (filter?.tags && filter.tags.length > 0) {
        const descTags = (desc.tags || []).map((t) => t.toLowerCase());
        const hasTag = filter.tags.some((t) => descTags.includes(t.toLowerCase()));
        if (!hasTag) return false;
      }
      if (filter?.query && filter.query.trim().length > 0) {
        const q = filter.query.toLowerCase().trim();
        const matchesUrn = desc.capabilityURN.toLowerCase().includes(q);
        const matchesName = desc.displayName.toLowerCase().includes(q);
        const matchesDesc = desc.description.toLowerCase().includes(q);
        const matchesTag = (desc.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!matchesUrn && !matchesName && !matchesDesc && !matchesTag) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Dynamically ingests MCP tools into the capability catalog.
   */
  ingestMcpTools(
    serverId: string,
    tools: Array<{ name: string; description: string; inputSchema?: Record<string, any> }>
  ): CapabilityDescriptor[] {
    const registered: CapabilityDescriptor[] = [];
    for (const tool of tools) {
      const capabilityURN = `mcp.${serverId}.${tool.name}`;
      const descriptor = this.registerCapability({
        capabilityURN,
        source: "MCP_GATEWAY",
        displayName: tool.name,
        description: tool.description || `MCP Tool from server ${serverId}`,
        category: "mcp",
        parametersSchema: tool.inputSchema || { type: "object", properties: {} },
        isIdempotent: false,
        isReversible: false,
        requiresApproval: false,
        timeoutMs: 30000,
        tags: ["mcp", serverId, tool.name],
        status: "ACTIVE",
      });
      registered.push(descriptor);
    }
    return registered;
  }

  listReadCapabilities(
    filter?: Omit<CapabilityQueryFilter, "operationKind">
  ): CapabilityDescriptor[] {
    return this.listCapabilities({ ...filter, operationKind: "READ" });
  }

  getDiscoveryCatalog(filter?: CapabilityQueryFilter): CapabilityDiscoverySummary[] {
    return this.listCapabilities(filter).map((d) => ({
      capabilityURN: d.capabilityURN,
      displayName: d.displayName,
      description: d.description,
      category: d.category,
      source: d.source,
      operationKind: d.operationKind,
      contextDomain: d.contextDomain,
      parameterHints: d.parametersSchema?.properties ? Object.keys(d.parametersSchema.properties) : undefined,
      outputFields: d.outputSchema?.properties ? Object.keys(d.outputSchema.properties) : undefined,
      parametersSchema: d.parametersSchema,
      outputSchema: d.outputSchema,
      requiresApproval: d.requiresApproval,
      isIdempotent: d.isIdempotent,
      tags: d.tags,
    }));
  }

  /**
   * Formats a compact, token-efficient summary of registered READ capabilities
   * for turn-1 semantic interpretation (full schemas stay in DynamicWorkflowPlanner).
   */
  formatCompactReadCatalogForInterpreter(
    filter?: Omit<CapabilityQueryFilter, "operationKind">
  ): string {
    const reads = this.listReadCapabilities(filter);
    return reads
      .map((d) => {
        const filters = d.parametersSchema?.properties ? Object.keys(d.parametersSchema.properties).join(", ") : "none";
        const returns = d.outputSchema?.properties ? Object.keys(d.outputSchema.properties).join(", ") : "structured";
        const domain = d.contextDomain ? ` domain=${d.contextDomain}` : "";
        return `- ${d.capabilityURN} [${d.source}${domain}]: ${d.description} (filters: ${filters}; returns: ${returns})`;
      })
      .join("\n");
  }

  /**
   * Validates any value/object against a JSON Schema subset deterministically.
   */
  static validateObjectAgainstSchema(
    schema: Record<string, any> | undefined,
    value: any,
    options?: { allowDynamicRefs?: boolean }
  ): CapabilityValidationResult {
    if (!schema || schema.type !== "object") {
      return { valid: true };
    }

    if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) {
      return {
        valid: false,
        reason: `Invalid payload type: expected object`,
        errors: [`Expected object payload`],
      };
    }

    const params = (value || {}) as Record<string, any>;
    const errors: string[] = [];
    const required: string[] = Array.isArray(schema.required) ? schema.required : [];
    const properties: Record<string, any> = schema.properties || {};

    // 1. Required fields check
    for (const reqField of required) {
      if (params[reqField] === undefined || params[reqField] === null) {
        errors.push(`Missing required parameter: "${reqField}"`);
      }
    }

    // 2. Reject undeclared properties when additionalProperties === false
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(params)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          errors.push(`Unknown parameter "${key}" is not allowed`);
        }
      }
    }

    // 3. Property type, enum, bounds, length, pattern, and array item checks
    for (const [key, propDef] of Object.entries(properties)) {
      const val = params[key];
      if (val === undefined || val === null) continue;
      if (options?.allowDynamicRefs && typeof val === "string" && val.startsWith("$ref:")) {
        continue;
      }

      CapabilityRegistry.validatePropertyValue(key, val, propDef, errors, options);
    }

    if (errors.length > 0) {
      return {
        valid: false,
        reason: errors.join("; "),
        errors,
      };
    }

    return { valid: true };
  }

  private static validatePropertyValue(
    key: string,
    val: any,
    propDef: Record<string, any> | undefined,
    errors: string[],
    options?: { allowDynamicRefs?: boolean }
  ): void {
    if (!propDef) return;
    const expectedType = propDef.type;

    if (expectedType === "string") {
      if (typeof val !== "string") {
        errors.push(`Invalid type for "${key}": expected string, got ${typeof val}`);
        return;
      }
      if (typeof propDef.minLength === "number" && val.length < propDef.minLength) {
        errors.push(`Parameter "${key}" length ${val.length} is less than minLength ${propDef.minLength}`);
      }
      if (typeof propDef.maxLength === "number" && val.length > propDef.maxLength) {
        errors.push(`Parameter "${key}" length ${val.length} exceeds maxLength ${propDef.maxLength}`);
      }
      if (typeof propDef.pattern === "string" && !new RegExp(propDef.pattern).test(val)) {
        errors.push(`Parameter "${key}" does not match required pattern ${propDef.pattern}`);
      }
    } else if (expectedType === "number" || expectedType === "integer") {
      if (typeof val !== "number" || !Number.isFinite(val)) {
        errors.push(`Invalid type for "${key}": expected ${expectedType}, got ${typeof val}`);
        return;
      }
      if (expectedType === "integer" && !Number.isInteger(val)) {
        errors.push(`Invalid type for "${key}": expected integer, got non-integer ${val}`);
      }
      if (typeof propDef.minimum === "number" && val < propDef.minimum) {
        errors.push(`Parameter "${key}" (${val}) is below minimum ${propDef.minimum}`);
      }
      if (typeof propDef.maximum === "number" && val > propDef.maximum) {
        errors.push(`Parameter "${key}" (${val}) exceeds maximum ${propDef.maximum}`);
      }
    } else if (expectedType === "boolean") {
      if (typeof val !== "boolean") {
        errors.push(`Invalid type for "${key}": expected boolean, got ${typeof val}`);
        return;
      }
    } else if (expectedType === "array") {
      if (!Array.isArray(val)) {
        errors.push(`Invalid type for "${key}": expected array, got ${typeof val}`);
        return;
      }
      if (typeof propDef.minItems === "number" && val.length < propDef.minItems) {
        errors.push(`Parameter "${key}" has ${val.length} items, below minItems ${propDef.minItems}`);
      }
      if (typeof propDef.maxItems === "number" && val.length > propDef.maxItems) {
        errors.push(`Parameter "${key}" has ${val.length} items, exceeding maxItems ${propDef.maxItems}`);
      }
      if (propDef.items) {
        val.forEach((item, idx) => {
          CapabilityRegistry.validatePropertyValue(`${key}[${idx}]`, item, propDef.items, errors, options);
        });
      }
    } else if (expectedType === "object") {
      if (typeof val !== "object" || Array.isArray(val)) {
        errors.push(`Invalid type for "${key}": expected object, got ${Array.isArray(val) ? "array" : typeof val}`);
        return;
      }
      if (propDef.properties) {
        const nested = CapabilityRegistry.validateObjectAgainstSchema(propDef, val, options);
        if (!nested.valid && nested.errors) {
          for (const err of nested.errors) {
            errors.push(`${key}: ${err}`);
          }
        }
      }
    }

    if (Array.isArray(propDef.enum) && !propDef.enum.includes(val)) {
      errors.push(`Invalid value for "${key}": "${val}" is not in allowed enum [${propDef.enum.join(", ")}]`);
    }
  }

  /**
   * Validates parameters against a capability's JSON Schema parametersSchema.
   */
  validateParameters(capabilityURN: string, params: Record<string, any>): CapabilityValidationResult {
    const descriptor = this.capabilities.get(capabilityURN);
    if (!descriptor) {
      return {
        valid: false,
        reason: `UNKNOWN_CAPABILITY_URN: Capability "${capabilityURN}" is not registered in catalog.`,
        errors: [`Unregistered capability: ${capabilityURN}`],
      };
    }

    if (descriptor.status === "REVOKED") {
      return {
        valid: false,
        reason: `CAPABILITY_REVOKED: Capability "${capabilityURN}" has been revoked and cannot be executed.`,
        errors: [`Revoked capability: ${capabilityURN}`],
      };
    }

    return CapabilityRegistry.validateObjectAgainstSchema(descriptor.parametersSchema, params);
  }

  /**
   * Validates a capability output envelope against its declared outputSchema.
   */
  validateOutput(capabilityURN: string, output: Record<string, any>): CapabilityValidationResult {
    const descriptor = this.capabilities.get(capabilityURN);
    if (!descriptor) {
      return {
        valid: false,
        reason: `UNKNOWN_CAPABILITY_URN: Capability "${capabilityURN}" is not registered in catalog.`,
        errors: [`Unregistered capability: ${capabilityURN}`],
      };
    }
    if (!descriptor.outputSchema) {
      return { valid: true };
    }
    return CapabilityRegistry.validateObjectAgainstSchema(descriptor.outputSchema, output);
  }

  /**
   * Authoritative Four-Tier Provider Error Classification (Correction A)
   */
  classifyProviderError(capabilityURN: string | undefined, error: any): ProviderErrorClassification {
    // 1. Check for explicit error classification if provider supplied one
    if (error && typeof error === "object" && error.category && error.auditStatus) {
      return {
        category: error.category,
        isUncertainMutation: error.isUncertainMutation ?? (error.category === "AMBIGUOUS_PROVIDER_FAILURE"),
        auditStatus: error.auditStatus,
        nodeStatus: error.nodeStatus ?? (error.auditStatus === "SUCCEEDED" ? "VERIFICATION_PENDING" : error.auditStatus === "FAILED_CONFIRMED" ? "FAILED" : "OUTCOME_UNKNOWN"),
        safeToRetryWithoutProbe: error.safeToRetryWithoutProbe ?? (error.category === "DEFINITIVE_REJECTION"),
        code: error.code || "PROVIDER_CLASSIFIED_ERROR",
        message: error.message || String(error),
        rawError: error,
      };
    }

    const statusCode = error?.statusCode || error?.status || error?.response?.status;
    const msg = (error?.message || String(error || "")).toLowerCase();
    const code = String(error?.code || "").toUpperCase();

    // 2. Confirmed Success
    if (statusCode && statusCode >= 200 && statusCode < 300) {
      return {
        category: "CONFIRMED_SUCCESS",
        isUncertainMutation: false,
        auditStatus: "SUCCEEDED",
        nodeStatus: "VERIFICATION_PENDING",
        safeToRetryWithoutProbe: false,
        code: `HTTP_${statusCode}`,
        message: error?.message || `HTTP ${statusCode} Success`,
        rawError: error,
      };
    }

    // 3. Definitive Rejection (400, 401, 403, 404, 422, or explicit schema rejection)
    const isDefinitiveStatus = statusCode === 400 || statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 422;
    const isDefinitiveMsg =
      msg.includes("invalid parameter") ||
      msg.includes("schema validation failed") ||
      msg.includes("precondition failed") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden") ||
      msg.includes("not found") ||
      msg.includes("permission denied") ||
      msg.includes("eacces") ||
      msg.includes("access denied") ||
      code === "INVALID_PARAMETER" ||
      code === "VALIDATION_ERROR" ||
      code === "RESOURCE_NOT_FOUND" ||
      code === "EACCES";

    if (isDefinitiveStatus || isDefinitiveMsg) {
      return {
        category: "DEFINITIVE_REJECTION",
        isUncertainMutation: false,
        auditStatus: "FAILED_CONFIRMED",
        nodeStatus: "FAILED",
        safeToRetryWithoutProbe: true,
        code: code || (statusCode ? `HTTP_${statusCode}` : "DEFINITIVE_REJECTION"),
        message: error?.message || `Definitive provider rejection (${statusCode || "precondition"})`,
        rawError: error,
      };
    }

    // 4. Ambiguous Provider Failure (500, 502, 503, 504, network timeouts, connection drops)
    const isAmbiguousStatus = statusCode >= 500 && statusCode < 600;
    const isNetworkError =
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      code === "EPIPE" ||
      code === "ENOTFOUND" ||
      code === "ECONNREFUSED" ||
      msg.includes("timeout") ||
      msg.includes("timed out") ||
      msg.includes("socket hang up") ||
      msg.includes("connection reset") ||
      msg.includes("interrupted response") ||
      msg.includes("econnreset");

    if (isAmbiguousStatus || isNetworkError) {
      return {
        category: "AMBIGUOUS_PROVIDER_FAILURE",
        isUncertainMutation: true,
        auditStatus: "OUTCOME_UNKNOWN",
        nodeStatus: "OUTCOME_UNKNOWN",
        safeToRetryWithoutProbe: false,
        code: code || (statusCode ? `HTTP_${statusCode}` : "AMBIGUOUS_TIMEOUT"),
        message: error?.message || `Ambiguous provider failure (${statusCode || code})`,
        rawError: error,
      };
    }

    // 5. Unknown Provider Semantics (Fails closed into OUTCOME_UNKNOWN)
    return {
      category: "UNKNOWN_PROVIDER_SEMANTICS",
      isUncertainMutation: true,
      auditStatus: "OUTCOME_UNKNOWN",
      nodeStatus: "OUTCOME_UNKNOWN",
      safeToRetryWithoutProbe: false,
      code: code || "UNKNOWN_PROVIDER_ERROR",
      message: error?.message || "Unrecognized provider error semantics; failing closed to OUTCOME_UNKNOWN.",
      rawError: error,
    };
  }

  /**
   * Seeds standard LifeOS capabilities.
   */
  private seedStandardCapabilities(): void {
    const seed = (
      urn: string,
      source: CapabilitySource,
      category: string,
      displayName: string,
      description: string,
      paramsSchema: Record<string, any>,
      options: {
        operationKind?: CapabilityDescriptor["operationKind"];
        contextDomain?: CapabilityDescriptor["contextDomain"];
        reversibility?: CapabilityDescriptor["reversibility"];
        isIdempotent?: boolean;
        isReversible?: boolean;
        compensationCapabilityURN?: string;
        requiresApproval?: boolean;
        verificationMethod?: CapabilityDescriptor["verificationMethod"];
        observationProbeCapabilityURN?: string;
        requiredResources?: CapabilityDescriptor["requiredResources"];
        outputSchema?: Record<string, any>;
        timeoutMs?: number;
        tags?: string[];
      } = {}
    ) => {
      this.registerCapability({
        capabilityURN: urn,
        source,
        category,
        displayName,
        description,
        operationKind: options.operationKind,
        contextDomain: options.contextDomain,
        reversibility: options.reversibility || (options.isReversible ? "reversible_with_compensation" : "atomic_single_doc"),
        parametersSchema: paramsSchema,
        outputSchema: options.outputSchema,
        isIdempotent: options.isIdempotent ?? true,
        isReversible: options.isReversible ?? false,
        compensationCapabilityURN: options.compensationCapabilityURN,
        requiresApproval: options.requiresApproval ?? false,
        verificationMethod: options.verificationMethod ?? "NONE",
        observationProbeCapabilityURN: options.observationProbeCapabilityURN,
        requiredResources: options.requiredResources ?? [],
        timeoutMs: options.timeoutMs ?? 30000,
        tags: options.tags || [category, urn.split(".").pop() || ""],
        status: "ACTIVE",
      });
    };

    // --- Core Action Types ---
    seed("create_task", "INTERNAL_ADAPTER", "productivity", "Create Task", "Creates a new task in LifeOS", {
      type: "object",
      properties: { title: { type: "string" }, description: { type: "string" }, dueDate: { type: "string" } },
      required: ["title"],
    }, { operationKind: "CREATE", isIdempotent: false, isReversible: true, reversibility: "reversible_with_compensation", compensationCapabilityURN: "delete_task", verificationMethod: "READ_BACK" });

    seed("productivity.tasks.create_task", "INTERNAL_ADAPTER", "productivity", "Create Task", "Creates a new task in LifeOS", {
      type: "object",
      properties: { title: { type: "string" }, description: { type: "string" }, dueDate: { type: "string" } },
      required: ["title"],
    }, { operationKind: "CREATE", isIdempotent: false, isReversible: true, reversibility: "reversible_with_compensation", compensationCapabilityURN: "delete_task", verificationMethod: "READ_BACK" });

    seed("complete_task", "INTERNAL_ADAPTER", "productivity", "Complete Task", "Marks a task as completed", {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    }, { operationKind: "COMPLETE", isIdempotent: true, isReversible: true, reversibility: "reversible_with_compensation", compensationCapabilityURN: "update_task", verificationMethod: "READ_BACK" });

    seed("productivity.tasks.complete_task", "INTERNAL_ADAPTER", "productivity", "Complete Task", "Marks a task as completed", {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    }, { operationKind: "COMPLETE", isIdempotent: true, isReversible: true, reversibility: "reversible_with_compensation", compensationCapabilityURN: "update_task", verificationMethod: "READ_BACK" });

    seed("update_task", "INTERNAL_ADAPTER", "productivity", "Update Task", "Updates an existing task", {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    }, { operationKind: "UPDATE", isIdempotent: true, isReversible: true, reversibility: "reversible_with_compensation", verificationMethod: "READ_BACK" });

    seed("delete_task", "INTERNAL_ADAPTER", "productivity", "Delete Task", "Deletes a task by ID", {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    }, { operationKind: "DELETE", isIdempotent: true, isReversible: false, reversibility: "reversible_with_compensation", requiresApproval: true, verificationMethod: "READ_BACK" });

    seed("log_workout", "INTERNAL_ADAPTER", "health", "Log Workout", "Logs a workout session", {
      type: "object",
      properties: { workoutType: { type: "string" }, durationMinutes: { type: "number" } },
      required: ["workoutType", "durationMinutes"],
    }, { isIdempotent: false, isReversible: true, verificationMethod: "READ_BACK" });

    seed("synthesis", "INTERNAL_ADAPTER", "synthesis", "Synthesize Information", "Synthesizes data across steps", {
      type: "object",
      properties: { targetPrompt: { type: "string" }, sourceStepId: { type: "string" } },
      required: ["targetPrompt"],
    }, { isIdempotent: true, isReversible: false, verificationMethod: "NONE" });

    seed("external_capability_action", "INTERNAL_ADAPTER", "general", "External Action", "Generic external action wrapper", {
      type: "object",
      properties: { capabilityURN: { type: "string" }, parameters: { type: "object" } },
      required: ["capabilityURN"],
    }, { isIdempotent: false, isReversible: false });

    // --- Productivity Domain ---
    seed("productivity.email.search_messages", "MODULAR_PROVIDER", "productivity", "Search Emails", "Searches user emails", {
      type: "object",
      properties: { query: { type: "string" }, maxResults: { type: "number" } },
      required: ["query"],
    }, { operationKind: "READ", isIdempotent: true, verificationMethod: "NONE", tags: ["email", "search", "gmail"] });

    seed("productivity.email.read_message", "MODULAR_PROVIDER", "productivity", "Read Email", "Reads an email message", {
      type: "object",
      properties: { messageId: { type: "string" } },
      required: ["messageId"],
    }, { operationKind: "READ", isIdempotent: true, tags: ["email", "read", "gmail"] });

    seed("productivity.email.read_thread", "MODULAR_PROVIDER", "productivity", "Read Email Thread", "Reads an email thread", {
      type: "object",
      properties: { threadId: { type: "string" } },
      required: ["threadId"],
    }, { operationKind: "READ", isIdempotent: true, tags: ["email", "thread", "gmail"] });

    seed("productivity.email.create_draft", "MODULAR_PROVIDER", "productivity", "Create Draft Email", "Creates an email draft", {
      type: "object",
      properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
      required: ["to", "subject", "body"],
    }, { isIdempotent: false, isReversible: true, verificationMethod: "OBSERVATION_PROBE", observationProbeCapabilityURN: "productivity.email.search_messages", tags: ["email", "draft", "gmail"] });

    seed("productivity.email.update_draft", "MODULAR_PROVIDER", "productivity", "Update Draft Email", "Updates an email draft", {
      type: "object",
      properties: { draftId: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
      required: ["draftId"],
    }, { isIdempotent: true, isReversible: true, verificationMethod: "OBSERVATION_PROBE", tags: ["email", "draft", "gmail"] });

    seed("productivity.email.send_message", "MODULAR_PROVIDER", "productivity", "Send Email", "Sends an email message", {
      type: "object",
      properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } },
      required: ["to", "subject", "body"],
    }, { isIdempotent: false, isReversible: false, requiresApproval: true, verificationMethod: "POLL", tags: ["email", "send", "gmail"] });

    seed("productivity.storage.read_file", "MODULAR_PROVIDER", "productivity", "Read File", "Reads file content from local or remote storage", {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    }, {
      operationKind: "READ",
      contextDomain: "TASKS",
      isIdempotent: true,
      requiredResources: [{ type: "FILESYSTEM", uriTemplate: "{path}", accessMode: "SHARED_READ" }],
      verificationMethod: "READ_BACK",
      tags: ["storage", "filesystem", "read"],
    });

    seed("productivity.storage.write_file", "MODULAR_PROVIDER", "productivity", "Write File", "Writes content to file", {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    }, {
      isIdempotent: true,
      isReversible: true,
      requiredResources: [{ type: "FILESYSTEM", uriTemplate: "{path}", accessMode: "EXCLUSIVE_LOCK" }],
      verificationMethod: "READ_BACK",
      tags: ["storage", "filesystem", "write"],
    });

    seed("productivity.storage.list_files", "MODULAR_PROVIDER", "productivity", "List Files", "Lists files in directory", {
      type: "object",
      properties: { path: { type: "string" } },
    }, { operationKind: "READ", isIdempotent: true, tags: ["storage", "filesystem", "list"] });

    seed("productivity.calendar.create_event", "MODULAR_PROVIDER", "productivity", "Create Calendar Event", "Creates a new calendar event", {
      type: "object",
      properties: { title: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" } },
      required: ["title", "startTime"],
    }, {
      isIdempotent: false,
      isReversible: true,
      compensationCapabilityURN: "productivity.calendar.delete_event",
      verificationMethod: "OBSERVATION_PROBE",
      observationProbeCapabilityURN: "productivity.calendar.read_events",
      tags: ["calendar", "event"],
    });

    seed("productivity.calendar.read_events", "MODULAR_PROVIDER", "productivity", "Read Calendar Events", "Reads calendar events", {
      type: "object",
      properties: { timeMin: { type: "string" }, timeMax: { type: "string" } },
    }, { operationKind: "READ", isIdempotent: true, tags: ["calendar", "events"] });

    seed("productivity.calendar.update_event", "MODULAR_PROVIDER", "productivity", "Update Calendar Event", "Updates an event", {
      type: "object",
      properties: { eventId: { type: "string" } },
      required: ["eventId"],
    }, { isIdempotent: true, isReversible: true, verificationMethod: "OBSERVATION_PROBE", tags: ["calendar", "event"] });

    seed("productivity.calendar.delete_event", "MODULAR_PROVIDER", "productivity", "Delete Calendar Event", "Deletes a calendar event", {
      type: "object",
      properties: { eventId: { type: "string" } },
      required: ["eventId"],
    }, { isIdempotent: true, isReversible: false, requiresApproval: true, verificationMethod: "READ_BACK", tags: ["calendar", "event"] });

    seed("productivity.task.create_external", "MODULAR_PROVIDER", "productivity", "Create External Task", "Creates task in external provider", {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    }, { isIdempotent: false, isReversible: true, tags: ["tasks", "external"] });

    seed("productivity.task.sync_tasks", "MODULAR_PROVIDER", "productivity", "Sync External Tasks", "Syncs tasks", {
      type: "object",
      properties: {},
    }, { operationKind: "READ", isIdempotent: true, tags: ["tasks", "sync"] });

    seed("productivity.git.create_issue", "MODULAR_PROVIDER", "productivity", "Create Git Issue", "Creates a GitHub issue", {
      type: "object",
      properties: { repo: { type: "string" }, title: { type: "string" }, body: { type: "string" } },
      required: ["repo", "title"],
    }, { isIdempotent: false, isReversible: false, tags: ["git", "github", "issue"] });

    seed("productivity.git.list_prs", "MODULAR_PROVIDER", "productivity", "List Git Pull Requests", "Lists pull requests", {
      type: "object",
      properties: { repo: { type: "string" } },
      required: ["repo"],
    }, { operationKind: "READ", isIdempotent: true, tags: ["git", "github", "pr"] });

    seed("productivity.git.list_repos", "MODULAR_PROVIDER", "productivity", "List Git Repositories", "Lists repositories", {
      type: "object",
      properties: {},
    }, { operationKind: "READ", isIdempotent: true, tags: ["git", "github", "repos"] });

    seed("productivity.git.search_code", "MODULAR_PROVIDER", "productivity", "Search Git Code", "Searches code in repo", {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    }, { operationKind: "READ", isIdempotent: true, tags: ["git", "github", "code"] });

    seed("productivity.contacts.search_contacts", "MODULAR_PROVIDER", "productivity", "Search Contacts", "Searches user contacts", {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    }, { operationKind: "READ", isIdempotent: true, tags: ["contacts", "search"] });

    seed("productivity.contacts.get_contact", "MODULAR_PROVIDER", "productivity", "Get Contact", "Gets contact details", {
      type: "object",
      properties: { contactId: { type: "string" } },
      required: ["contactId"],
    }, { operationKind: "READ", isIdempotent: true, tags: ["contacts"] });

    // --- Health & Wellness Domain ---
    seed("health.activity.record_workout", "MODULAR_PROVIDER", "health", "Record Workout Telemetry", "Records workout telemetry", {
      type: "object",
      properties: { workoutType: { type: "string" }, durationMinutes: { type: "number" } },
      required: ["workoutType"],
    }, { isIdempotent: false, isReversible: true, tags: ["health", "workout"] });

    seed("health.activity.sync_telemetry", "MODULAR_PROVIDER", "health", "Sync Health Telemetry", "Syncs health metrics", {
      type: "object",
      properties: {},
    }, { isIdempotent: true, tags: ["health", "sync"] });

    seed("health.biometrics.read_sleep", "MODULAR_PROVIDER", "health", "Read Sleep Biometrics", "Reads sleep data", {
      type: "object",
      properties: {},
    }, { operationKind: "READ", isIdempotent: true, tags: ["health", "sleep"] });

    seed("health.biometrics.read_daily_summary", "MODULAR_PROVIDER", "health", "Read Daily Health Summary", "Reads daily health summary", {
      type: "object",
      properties: {},
    }, { operationKind: "READ", isIdempotent: true, tags: ["health", "summary"] });

    seed("health.nutrition.log_food", "MODULAR_PROVIDER", "health", "Log Nutrition Food", "Logs nutrition food entry", {
      type: "object",
      properties: { foodName: { type: "string" }, calories: { type: "number" } },
      required: ["foodName"],
    }, { isIdempotent: false, isReversible: true, tags: ["health", "nutrition"] });

    seed("wellness.media.playback_control", "MODULAR_PROVIDER", "wellness", "Media Playback Control", "Controls media playback", {
      type: "object",
      properties: { action: { type: "string" } },
      required: ["action"],
    }, { isIdempotent: true, tags: ["media", "music"] });

    seed("wellness.media.read_current_track", "MODULAR_PROVIDER", "wellness", "Read Current Track", "Reads active playing track", {
      type: "object",
      properties: {},
    }, { operationKind: "READ", isIdempotent: true, tags: ["media", "music"] });

    seed("wellness.smarthome.set_light_state", "MODULAR_PROVIDER", "wellness", "Set Smart Light State", "Sets smart light status", {
      type: "object",
      properties: { lightId: { type: "string" }, on: { type: "boolean" } },
      required: ["lightId", "on"],
    }, { isIdempotent: true, tags: ["smarthome", "lights"] });

    seed("wellness.smarthome.set_thermostat", "MODULAR_PROVIDER", "wellness", "Set Smart Thermostat", "Sets thermostat temperature", {
      type: "object",
      properties: { temperature: { type: "number" } },
      required: ["temperature"],
    }, { isIdempotent: true, tags: ["smarthome", "thermostat"] });

    // --- Context & Mobility Domain ---
    seed("context.system.read_clipboard", "INTERNAL_ADAPTER", "context", "Read Clipboard", "Reads clipboard text", {
      type: "object",
      properties: {},
    }, { operationKind: "READ", isIdempotent: true, tags: ["system", "clipboard"] });

    seed("context.system.search_web", "MODULAR_PROVIDER", "context", "Search Web", "Searches web via Brave / Google", {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    }, { operationKind: "READ", isIdempotent: true, tags: ["search", "web"] });

    seed("context.system.open_url", "INTERNAL_ADAPTER", "context", "Open URL", "Opens a URL in default browser", {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    }, { isIdempotent: true, tags: ["system", "browser"] });

    seed("context.environment.read_weather", "MODULAR_PROVIDER", "context", "Read Weather", "Reads current weather", {
      type: "object",
      properties: { location: { type: "string" } },
    }, { operationKind: "READ", isIdempotent: true, tags: ["weather"] });

    seed("context.environment.get_forecast", "MODULAR_PROVIDER", "context", "Get Weather Forecast", "Gets weather forecast", {
      type: "object",
      properties: { location: { type: "string" }, days: { type: "number" } },
    }, { operationKind: "READ", isIdempotent: true, tags: ["weather", "forecast"] });

    seed("travel.itinerary.generate", "MODULAR_PROVIDER", "travel", "Generate Travel Itinerary", "Generates travel itinerary", {
      type: "object",
      properties: { destination: { type: "string" } },
      required: ["destination"],
    }, { isIdempotent: true, tags: ["travel"] });

    seed("travel.places.search", "MODULAR_PROVIDER", "travel", "Search Places", "Searches places or landmarks", {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    }, { isIdempotent: true, tags: ["travel", "places"] });

    seed("travel.flights.search", "MODULAR_PROVIDER", "travel", "Search Flights", "Searches flight options", {
      type: "object",
      properties: { origin: { type: "string" }, destination: { type: "string" } },
      required: ["origin", "destination"],
    }, { isIdempotent: true, tags: ["travel", "flights"] });

    seed("travel.hotels.search", "MODULAR_PROVIDER", "travel", "Search Hotels", "Searches hotels", {
      type: "object",
      properties: { location: { type: "string" } },
      required: ["location"],
    }, { isIdempotent: true, tags: ["travel", "hotels"] });

    seed("shopping.products.search", "MODULAR_PROVIDER", "shopping", "Search Products", "Searches products", {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    }, { isIdempotent: true, tags: ["shopping"] });

    seed("shopping.cart.add", "MODULAR_PROVIDER", "shopping", "Add to Cart", "Adds product to cart", {
      type: "object",
      properties: { productId: { type: "string" }, quantity: { type: "number" } },
      required: ["productId"],
    }, { isIdempotent: false, isReversible: true, tags: ["shopping", "cart"] });

    seed("mobility.rides.estimate", "MODULAR_PROVIDER", "mobility", "Estimate Ride", "Estimates ride price and ETA", {
      type: "object",
      properties: { origin: { type: "string" }, destination: { type: "string" } },
      required: ["origin", "destination"],
    }, { isIdempotent: true, tags: ["mobility", "rides"] });

    seed("mobility.rides.request", "MODULAR_PROVIDER", "mobility", "Request Ride", "Dispatches a ride request", {
      type: "object",
      properties: { origin: { type: "string" }, destination: { type: "string" } },
      required: ["origin", "destination"],
    }, { isIdempotent: false, isReversible: true, compensationCapabilityURN: "mobility.rides.cancel", requiresApproval: true, tags: ["mobility", "rides"] });

    seed("mobility.rides.status", "MODULAR_PROVIDER", "mobility", "Get Ride Status", "Checks ride status", {
      type: "object",
      properties: { rideId: { type: "string" } },
      required: ["rideId"],
    }, { isIdempotent: true, tags: ["mobility", "rides"] });

    seed("mobility.rides.cancel", "MODULAR_PROVIDER", "mobility", "Cancel Ride", "Cancels requested ride", {
      type: "object",
      properties: { rideId: { type: "string" } },
      required: ["rideId"],
    }, { isIdempotent: true, tags: ["mobility", "rides"] });

    seed("commerce.food.search_restaurants", "MODULAR_PROVIDER", "commerce", "Search Restaurants", "Searches restaurants", {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    }, { isIdempotent: true, tags: ["food", "restaurants"] });

    seed("commerce.quick.search_catalog", "MODULAR_PROVIDER", "commerce", "Search Quick Commerce", "Searches catalog", {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    }, { isIdempotent: true, tags: ["commerce"] });

    // --- Stage 1: Generic LifeOS Read Capabilities (Internal Kernel) ---
    seed("lifeos.tasks.query", "INTERNAL_ADAPTER", "productivity", "Query LifeOS Tasks", "Queries user tasks with bounded filtering, sorting, and pagination", {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["pending", "completed", "skipped", "in_progress", "waiting", "blocked", "all"] },
        overdue: { type: "boolean" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        dueDateFrom: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        dueDateTo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        goalId: { type: "string", minLength: 1, maxLength: 64 },
        search: { type: "string", minLength: 1, maxLength: 120 },
        includeSubtasks: { type: "boolean" },
        sortBy: { type: "string", enum: ["dueDate", "priority", "createdAt", "updatedAt"] },
        sortOrder: { type: "string", enum: ["asc", "desc"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0, maximum: 5000 },
      },
    }, {
      operationKind: "READ",
      contextDomain: "TASKS",
      isIdempotent: true,
      isReversible: false,
      requiresApproval: false,
      verificationMethod: "NONE",
      timeoutMs: 10000,
      requiredResources: [{ type: "LIFEOS_TASKS", accessMode: "SHARED_READ" }],
      outputSchema: {
        type: "object",
        required: ["items", "totalCount", "returnedCount", "hasMore", "emptyReason"],
        properties: {
          items: { type: "array" },
          totalCount: { type: "integer" },
          returnedCount: { type: "integer" },
          hasMore: { type: "boolean" },
          emptyReason: { type: "string" },
        },
      },
      tags: ["lifeos", "tasks", "read", "query", "stage1"],
    });

    seed("lifeos.goals.query", "INTERNAL_ADAPTER", "productivity", "Query LifeOS Goals", "Queries user goals with optional GoalStats and milestones", {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["active", "proposed", "archived", "completed", "all"] },
        nature: { type: "string", enum: ["finite_deliverable", "habitual_cadence"] },
        cadence: { type: "string", enum: ["daily", "weekly", "flexible"] },
        includeStats: { type: "boolean" },
        includeMilestones: { type: "boolean" },
        search: { type: "string", minLength: 1, maxLength: 120 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0, maximum: 1000 },
      },
    }, {
      operationKind: "READ",
      contextDomain: "TASKS",
      isIdempotent: true,
      isReversible: false,
      requiresApproval: false,
      verificationMethod: "NONE",
      timeoutMs: 10000,
      requiredResources: [{ type: "LIFEOS_GOALS", accessMode: "SHARED_READ" }],
      outputSchema: {
        type: "object",
        required: ["items", "totalCount", "returnedCount", "hasMore", "emptyReason"],
        properties: {
          items: { type: "array" },
          totalCount: { type: "integer" },
          returnedCount: { type: "integer" },
          hasMore: { type: "boolean" },
          emptyReason: { type: "string" },
        },
      },
      tags: ["lifeos", "goals", "read", "query", "stage1"],
    });

    seed("lifeos.schedule.query_occurrences", "INTERNAL_ADAPTER", "productivity", "Query LifeOS Schedule Occurrences", "Queries bounded date-range schedule occurrences and optional execution chronicle", {
      type: "object",
      additionalProperties: false,
      required: ["startDate", "endDate"],
      properties: {
        startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        endDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        timezone: { type: "string", minLength: 1, maxLength: 64 },
        status: { type: "string", enum: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "SKIPPED", "CANCELLED", "RESCHEDULED", "all"] },
        kind: { type: "string", enum: ["HARD_EVENT", "ROUTINE_BLOCK", "WORK_SESSION", "TRANSITION_BUFFER", "EPHEMERAL_PING"] },
        includeExecutionChronicle: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
        offset: { type: "integer", minimum: 0, maximum: 2000 },
      },
    }, {
      operationKind: "READ",
      contextDomain: "SCHEDULE",
      isIdempotent: true,
      isReversible: false,
      requiresApproval: false,
      verificationMethod: "NONE",
      timeoutMs: 10000,
      requiredResources: [{ type: "LIFEOS_SCHEDULE", accessMode: "SHARED_READ" }],
      outputSchema: {
        type: "object",
        required: ["items", "totalCount", "returnedCount", "hasMore", "resolvedTimezone", "emptyReason"],
        properties: {
          items: { type: "array" },
          chronicleItems: { type: "array" },
          totalCount: { type: "integer" },
          returnedCount: { type: "integer" },
          hasMore: { type: "boolean" },
          resolvedTimezone: { type: "string" },
          emptyReason: { type: "string" },
        },
      },
      tags: ["lifeos", "schedule", "occurrences", "calendar", "read", "query", "stage1"],
    });

    seed("lifeos.daily_logs.query_range", "INTERNAL_ADAPTER", "wellness", "Query LifeOS Daily Logs", "Queries bounded date-range daily logs with coverage metadata and privacy allowlisting", {
      type: "object",
      additionalProperties: false,
      required: ["startDate", "endDate"],
      properties: {
        startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        endDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        sections: {
          type: "array",
          maxItems: 8,
          items: { type: "string", enum: ["mental", "sleep", "physical", "work", "habits", "planning", "signals", "reflection"] },
        },
        includeReflection: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 90 },
        offset: { type: "integer", minimum: 0, maximum: 1000 },
      },
    }, {
      operationKind: "READ",
      contextDomain: "HEALTH",
      isIdempotent: true,
      isReversible: false,
      requiresApproval: false,
      verificationMethod: "NONE",
      timeoutMs: 10000,
      requiredResources: [{ type: "LIFEOS_DAILY_LOGS", accessMode: "SHARED_READ" }],
      outputSchema: {
        type: "object",
        required: ["items", "totalCount", "returnedCount", "hasMore", "coverage", "emptyReason"],
        properties: {
          items: { type: "array" },
          totalCount: { type: "integer" },
          returnedCount: { type: "integer" },
          hasMore: { type: "boolean" },
          coverage: { type: "object" },
          emptyReason: { type: "string" },
        },
      },
      tags: ["lifeos", "daily_logs", "wellness", "read", "query", "stage1"],
    });

    seed("lifeos.telemetry.query_state_history", "INTERNAL_ADAPTER", "wellness", "Query LifeOS Telemetry State History", "Queries cognitive state history and bounded telemetry observations with explicit availability status", {
      type: "object",
      additionalProperties: false,
      properties: {
        startDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        endDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        includeObservations: { type: "boolean" },
        observationTypes: {
          type: "array",
          maxItems: 15,
          items: { type: "string", minLength: 1, maxLength: 64 },
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0, maximum: 1000 },
      },
    }, {
      operationKind: "READ",
      contextDomain: "HEALTH",
      isIdempotent: true,
      isReversible: false,
      requiresApproval: false,
      verificationMethod: "NONE",
      timeoutMs: 10000,
      requiredResources: [{ type: "LIFEOS_TELEMETRY", accessMode: "SHARED_READ" }],
      outputSchema: {
        type: "object",
        required: ["items", "totalCount", "returnedCount", "hasMore", "availabilityStatus", "emptyReason"],
        properties: {
          items: { type: "array" },
          observations: { type: "array" },
          totalCount: { type: "integer" },
          returnedCount: { type: "integer" },
          hasMore: { type: "boolean" },
          availabilityStatus: { type: "string" },
          emptyReason: { type: "string" },
        },
      },
      tags: ["lifeos", "telemetry", "cognitive_state", "read", "query", "stage1"],
    });

    seed("lifeos.memory.search", "INTERNAL_ADAPTER", "context", "Search LifeOS Personal Memory", "Queries durable personal memories, preferences, constraints, and past statements using hybrid lexical and semantic retrieval", {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", maxLength: 300 },
        domain: { type: "string", enum: ["productivity", "health", "wellness", "identity", "general"] },
        memoryType: {
          type: "string",
          enum: [
            "semantic_fact",
            "episodic_event",
            "behavioral_pattern",
            "goal_intelligence",
            "incident",
            "intervention",
          ],
        },
        includeStale: { type: "boolean" },
        includeSuperseded: { type: "boolean" },
        minConfidence: { type: "number", minimum: 0, maximum: 1 },
        referenceTime: { type: "string", maxLength: 64 },
        limit: { type: "integer", minimum: 1, maximum: 25 },
        offset: { type: "integer", minimum: 0, maximum: 500 },
      },
    }, {
      operationKind: "READ",
      contextDomain: "GENERAL",
      isIdempotent: true,
      isReversible: false,
      requiresApproval: false,
      verificationMethod: "NONE",
      timeoutMs: 10000,
      requiredResources: [{ type: "LIFEOS_MEMORY", accessMode: "SHARED_READ" }],
      outputSchema: {
        type: "object",
        required: ["items", "totalCount", "returnedCount", "hasMore", "retrievalMode", "emptyReason"],
        properties: {
          items: { type: "array" },
          totalCount: { type: "integer" },
          returnedCount: { type: "integer" },
          hasMore: { type: "boolean" },
          retrievalMode: { type: "string" },
          emptyReason: { type: "string" },
        },
      },
      tags: ["lifeos", "memory", "preferences", "constraints", "recall", "read", "query", "stage4"],
    });
  }
}
