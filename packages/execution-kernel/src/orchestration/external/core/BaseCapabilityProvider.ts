/**
 * Base Capability Provider (Phase 12)
 * 
 * Abstract base class for discrete external providers.
 * Enforces:
 * - Canonical external execution lifecycle states:
 *   PENDING_EXTERNAL_COMMIT, CONFIRMED_EXTERNAL_COMMIT, UNKNOWN_EXTERNAL_STATE,
 *   EXTERNAL_REJECTED, EXTERNAL_PARTIAL_SUCCESS, RECONCILIATION_REQUIRED
 * - Timeout handling: Never treats timeout as success
 * - Transient error retries with exponential backoff (5xx errors only)
 * - Strict client error (4xx) fail-closed behavior
 * - Invariant: Providers execute only; zero semantic routing, zero planning.
 */

import { generateId } from "../../../shared/ids";

export type ExternalExecutionLifecycleState =
  | "PENDING_EXTERNAL_COMMIT"
  | "CONFIRMED_EXTERNAL_COMMIT"
  | "UNKNOWN_EXTERNAL_STATE"
  | "EXTERNAL_REJECTED"
  | "EXTERNAL_PARTIAL_SUCCESS"
  | "RECONCILIATION_REQUIRED";

export interface IProviderContext {
  userId: string;
  idempotencyKey?: string;
  authToken?: string;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

export interface IProviderExecutionResult {
  executionId: string;
  providerId: string;
  urn: string;
  success: boolean;
  lifecycleState: ExternalExecutionLifecycleState;
  data?: unknown;
  error?: string;
  reconciliationRequired?: boolean;
  durationMs: number;
}

export interface ICapabilityProvider {
  readonly providerId: string;
  readonly supportedURNs: string[];
  execute(urn: string, params: Record<string, unknown>, context: IProviderContext): Promise<IProviderExecutionResult>;
  validatePayload(urn: string, params: Record<string, unknown>): boolean;
  checkHealth(userId: string): Promise<boolean>;
}

export abstract class BaseCapabilityProvider implements ICapabilityProvider {
  abstract readonly providerId: string;
  abstract readonly supportedURNs: string[];

  /**
   * Validates parameter schema before making network requests.
   */
  abstract validatePayload(urn: string, params: Record<string, unknown>): boolean;

  /**
   * Internal execution logic implemented by each specific provider.
   */
  protected abstract executeInternal(
    urn: string,
    params: Record<string, unknown>,
    context: IProviderContext
  ): Promise<{ data?: unknown; partialSuccess?: boolean }>;

  /**
   * Main execution wrapper with retries, timeout handling, and canonical lifecycle enforcement.
   */
  async execute(
    urn: string,
    params: Record<string, unknown>,
    context: IProviderContext
  ): Promise<IProviderExecutionResult> {
    const executionId = generateId("prov_exec");
    const startTime = performance.now();

    // 1. Verify URN support
    if (!this.supportedURNs.includes(urn)) {
      return {
        executionId,
        providerId: this.providerId,
        urn,
        success: false,
        lifecycleState: "EXTERNAL_REJECTED",
        error: `Provider '${this.providerId}' does not support capability URN: ${urn}`,
        durationMs: performance.now() - startTime,
      };
    }

    // 2. Validate payload before dispatching
    if (!this.validatePayload(urn, params)) {
      return {
        executionId,
        providerId: this.providerId,
        urn,
        success: false,
        lifecycleState: "EXTERNAL_REJECTED",
        error: `Validation failed: Malformed payload parameters for capability: ${urn}`,
        durationMs: performance.now() - startTime,
      };
    }

    // 3. Execute with retry policy and canonical state mapping
    const maxRetries = 2;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      try {
        const result = await this.executeInternal(urn, params, context);
        const durationMs = performance.now() - startTime;

        if (result.partialSuccess) {
          return {
            executionId,
            providerId: this.providerId,
            urn,
            success: true,
            lifecycleState: "EXTERNAL_PARTIAL_SUCCESS",
            data: result.data,
            durationMs,
          };
        }

        return {
          executionId,
          providerId: this.providerId,
          urn,
          success: true,
          lifecycleState: "CONFIRMED_EXTERNAL_COMMIT",
          data: result.data,
          durationMs,
        };
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);

        // Check for timeout or dropped network connection
        const isTimeout =
          errMsg.includes("timed out") ||
          errMsg.includes("timeout") ||
          errMsg.includes("ETIMEDOUT") ||
          errMsg.includes("ECONNRESET") ||
          errMsg.includes("UNKNOWN_EXTERNAL_STATE");

        if (isTimeout) {
          // Invariant 9: Never treat timeout as success.
          // Invariant 10: Explicit UNKNOWN_EXTERNAL_STATE with reconciliation required.
          return {
            executionId,
            providerId: this.providerId,
            urn,
            success: false,
            lifecycleState: "UNKNOWN_EXTERNAL_STATE",
            reconciliationRequired: true,
            error: `Network timeout: ${errMsg}`,
            durationMs: performance.now() - startTime,
          };
        }

        // Check for 4xx client errors (do NOT retry)
        const isClientError =
          errMsg.includes("400") ||
          errMsg.includes("401") ||
          errMsg.includes("403") ||
          errMsg.includes("404") ||
          errMsg.includes("AUTH_REQUIRED") ||
          errMsg.includes("INVALID_ARGUMENT");

        if (isClientError) {
          return {
            executionId,
            providerId: this.providerId,
            urn,
            success: false,
            lifecycleState: "EXTERNAL_REJECTED",
            error: errMsg,
            durationMs: performance.now() - startTime,
          };
        }

        // 5xx transient server error: retry with backoff
        attempt++;
        if (attempt <= maxRetries) {
          await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempt)));
        }
      }
    }

    return {
      executionId,
      providerId: this.providerId,
      urn,
      success: false,
      lifecycleState: "EXTERNAL_REJECTED",
      error: lastError?.message || "Execution failed after retries",
      durationMs: performance.now() - startTime,
    };
  }

  async checkHealth(_userId: string): Promise<boolean> {
    return true;
  }
}
