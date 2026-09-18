import { SimulationExecutionRequest } from "../contracts/kernelAdapterContracts";

export interface ContractValidationResult {
  valid: boolean;
  error: string | null;
  issues?: string[];
}

export class KernelContractValidator {
  /**
   * Validates that a SimulationExecutionRequest satisfies production kernel contracts.
   * Performs contract validation only — NEVER invokes the kernel.
   */
  public static validate(request: SimulationExecutionRequest): ContractValidationResult {
    const issues: string[] = [];

    if (!request.userId || !request.userId.trim()) {
      issues.push("userId is required for Kernel contract compliance.");
    }

    if (!request.requestText || !request.requestText.trim()) {
      issues.push("requestText (message) cannot be empty.");
    }

    if (!request.metadata) {
      issues.push("SimulationExecutionMetadata object is missing.");
    } else {
      if (!request.metadata.runUid) issues.push("metadata.runUid is required.");
      if (typeof request.metadata.tick !== "number" || request.metadata.tick < 0) {
        issues.push("metadata.tick must be a non-negative integer.");
      }
      if (!request.metadata.personaCode) issues.push("metadata.personaCode is required.");
    }

    if (issues.length > 0) {
      return {
        valid: false,
        error: `Kernel contract validation failed: ${issues.join("; ")}`,
        issues,
      };
    }

    return {
      valid: true,
      error: null,
    };
  }
}
