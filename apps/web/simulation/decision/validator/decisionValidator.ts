import { LLMOutputDTO } from "../schema/decisionSchema";
import { DecisionError } from "../contracts/decisionContracts";
import { DECISION_VALIDATOR_VERSION } from "../constants";

export interface ValidationResult {
  valid: boolean;
  error: DecisionError | null;
  version: string;
}

export class DecisionValidator {
  public static readonly version: string = DECISION_VALIDATOR_VERSION;

  /**
   * Performs semantic validation on parsed LLM output.
   * Separate from JSON/schema type parsing.
   */
  public static validate(data: LLMOutputDTO): ValidationResult {
    const issues: string[] = [];

    // Semantic Check 1: Confidence bounds [0.0, 1.0]
    if (typeof data.confidence !== "number" || data.confidence < 0.0 || data.confidence > 1.0) {
      issues.push(`Confidence ${data.confidence} out of range [0.0, 1.0].`);
    }

    // Semantic Check 2: Non-empty reasoning
    if (!data.reasoning || data.reasoning.trim().length === 0) {
      issues.push("Reasoning text cannot be empty.");
    }

    // Semantic Check 3: Parameters must be non-null object
    if (!data.parameters || typeof data.parameters !== "object" || Array.isArray(data.parameters)) {
      issues.push("Parameters must be a non-null key-value record.");
    }

    if (issues.length > 0) {
      return {
        valid: false,
        error: {
          code: "SEMANTIC_VALIDATION_FAILED",
          message: "Semantic decision validation failed.",
          details: issues,
        },
        version: this.version,
      };
    }

    return {
      valid: true,
      error: null,
      version: this.version,
    };
  }
}
