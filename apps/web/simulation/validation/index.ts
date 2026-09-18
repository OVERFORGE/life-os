/**
 * Validation Module Architecture (Phase 1.1 Foundation)
 */

export interface IValidationAssertion {
  id: string;
  ruleName: string;
  expression: string;
  expectedOutcome: boolean;
}

export interface IValidationResult {
  passed: boolean;
  score: number;
  failures: string[];
}
