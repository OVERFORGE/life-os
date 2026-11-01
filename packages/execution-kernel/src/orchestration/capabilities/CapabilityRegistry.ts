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

    const schema = descriptor.parametersSchema;
    if (!schema || schema.type !== "object") {
      return { valid: true };
    }

    const errors: string[] = [];
    const required: string[] = Array.isArray(schema.required) ? schema.required : [];
    const properties: Record<string, any> = schema.properties || {};

    // 1. Required fields check
    for (const reqField of required) {
      if (params === undefined || params === null || params[reqField] === undefined || params[reqField] === null) {
        errors.push(`Missing required parameter: "${reqField}"`);
      }
    }

    // 2. Type checks
    if (params && typeof params === "object") {
      for (const [key, propDef] of Object.entries(properties)) {
        const val = params[key];
        if (val === undefined || val === null) continue;

        const expectedType = propDef?.type;
        if (!expectedType) continue;

        if (expectedType === "string" && typeof val !== "string") {
          errors.push(`Invalid type for "${key}": expected string, got ${typeof val}`);
        } else if (expectedType === "number" && (typeof val !== "number" || !Number.isFinite(val))) {
          errors.push(`Invalid type for "${key}": expected number, got ${typeof val}`);
        } else if (expectedType === "boolean" && typeof val !== "boolean") {
          errors.push(`Invalid type for "${key}": expected boolean, got ${typeof val}`);
        } else if (expectedType === "array" && !Array.isArray(val)) {
          errors.push(`Invalid type for "${key}": expected array, got ${typeof val}`);
        } else if (expectedType === "object" && (typeof val !== "object" || Array.isArray(val))) {
          errors.push(`Invalid type for "${key}": expected object, got ${Array.isArray(val) ? "array" : typeof val}`);
        }
      }
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
        reversibility?: CapabilityDescriptor["reversibility"];
        isIdempotent?: boolean;
        isReversible?: boolean;
        compensationCapabilityURN?: string;
        requiresApproval?: boolean;
        verificationMethod?: CapabilityDescriptor["verificationMethod"];
        observationProbeCapabilityURN?: string;
        requiredResources?: CapabilityDescriptor["requiredResources"];
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
        reversibility: options.reversibility || (options.isReversible ? "reversible_with_compensation" : "atomic_single_doc"),
        parametersSchema: paramsSchema,
        isIdempotent: options.isIdempotent ?? true,
        isReversible: options.isReversible ?? false,
        compensationCapabilityURN: options.compensationCapabilityURN,
        requiresApproval: options.requiresApproval ?? false,
        verificationMethod: options.verificationMethod ?? "NONE",
        observationProbeCapabilityURN: options.observationProbeCapabilityURN,
        requiredResources: options.requiredResources ?? [],
        timeoutMs: 30000,
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
    }, { isIdempotent: true, verificationMethod: "NONE", tags: ["email", "search", "gmail"] });

    seed("productivity.email.read_message", "MODULAR_PROVIDER", "productivity", "Read Email", "Reads an email message", {
      type: "object",
      properties: { messageId: { type: "string" } },
      required: ["messageId"],
    }, { isIdempotent: true, tags: ["email", "read", "gmail"] });

    seed("productivity.email.read_thread", "MODULAR_PROVIDER", "productivity", "Read Email Thread", "Reads an email thread", {
      type: "object",
      properties: { threadId: { type: "string" } },
      required: ["threadId"],
    }, { isIdempotent: true, tags: ["email", "thread", "gmail"] });

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
    }, { isIdempotent: true, tags: ["storage", "filesystem", "list"] });

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
    }, { isIdempotent: true, tags: ["calendar", "events"] });

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
    }, { isIdempotent: true, tags: ["tasks", "sync"] });

    seed("productivity.git.create_issue", "MODULAR_PROVIDER", "productivity", "Create Git Issue", "Creates a GitHub issue", {
      type: "object",
      properties: { repo: { type: "string" }, title: { type: "string" }, body: { type: "string" } },
      required: ["repo", "title"],
    }, { isIdempotent: false, isReversible: false, tags: ["git", "github", "issue"] });

    seed("productivity.git.list_prs", "MODULAR_PROVIDER", "productivity", "List Git Pull Requests", "Lists pull requests", {
      type: "object",
      properties: { repo: { type: "string" } },
      required: ["repo"],
    }, { isIdempotent: true, tags: ["git", "github", "pr"] });

    seed("productivity.git.list_repos", "MODULAR_PROVIDER", "productivity", "List Git Repositories", "Lists repositories", {
      type: "object",
      properties: {},
    }, { isIdempotent: true, tags: ["git", "github", "repos"] });

    seed("productivity.git.search_code", "MODULAR_PROVIDER", "productivity", "Search Git Code", "Searches code in repo", {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    }, { isIdempotent: true, tags: ["git", "github", "code"] });

    seed("productivity.contacts.search_contacts", "MODULAR_PROVIDER", "productivity", "Search Contacts", "Searches user contacts", {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    }, { isIdempotent: true, tags: ["contacts", "search"] });

    seed("productivity.contacts.get_contact", "MODULAR_PROVIDER", "productivity", "Get Contact", "Gets contact details", {
      type: "object",
      properties: { contactId: { type: "string" } },
      required: ["contactId"],
    }, { isIdempotent: true, tags: ["contacts"] });

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
    }, { isIdempotent: true, tags: ["health", "sleep"] });

    seed("health.biometrics.read_daily_summary", "MODULAR_PROVIDER", "health", "Read Daily Health Summary", "Reads daily health summary", {
      type: "object",
      properties: {},
    }, { isIdempotent: true, tags: ["health", "summary"] });

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
    }, { isIdempotent: true, tags: ["media", "music"] });

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
    }, { isIdempotent: true, tags: ["system", "clipboard"] });

    seed("context.system.search_web", "MODULAR_PROVIDER", "context", "Search Web", "Searches web via Brave / Google", {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    }, { isIdempotent: true, tags: ["search", "web"] });

    seed("context.system.open_url", "INTERNAL_ADAPTER", "context", "Open URL", "Opens a URL in default browser", {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    }, { isIdempotent: true, tags: ["system", "browser"] });

    seed("context.environment.read_weather", "MODULAR_PROVIDER", "context", "Read Weather", "Reads current weather", {
      type: "object",
      properties: { location: { type: "string" } },
    }, { isIdempotent: true, tags: ["weather"] });

    seed("context.environment.get_forecast", "MODULAR_PROVIDER", "context", "Get Weather Forecast", "Gets weather forecast", {
      type: "object",
      properties: { location: { type: "string" }, days: { type: "number" } },
    }, { isIdempotent: true, tags: ["weather", "forecast"] });

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
  }
}
