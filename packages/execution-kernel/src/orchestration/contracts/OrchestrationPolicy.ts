/**
 * Central Orchestration Policy & Configurable Governance
 * 
 * Invariant 13: Every orchestration has bounded execution (iterations, time, tokens).
 * Invariant 15: Configurable policy objects replace arbitrary hard-coded constants.
 */

export interface OrchestrationPolicy {
  // Iteration bounds
  defaultMaxIterations: number;       // Baseline iterations for standard loop (Default: 3)
  absoluteMaxIterations: number;      // Hard safety ceiling (Default: 5)
  maxSpecialistsPerIteration: number; // Max concurrent specialists (Default: 3)
  maxTotalSpecialistInvocations: number; // Max specialist invocations across all iterations (Default: 9)

  // Execution Timeouts (in milliseconds)
  totalExecutionTimeoutMs: number;    // Absolute request timeout (Default: 15,000 ms)
  specialistTimeoutMs: number;        // Individual specialist execution timeout (Default: 4,000 ms)
  kernelBatchTimeoutMs: number;       // Kernel action batch timeout (Default: 5,000 ms)

  // Token Budgets
  maxTotalPromptTokens: number;       // Max tokens across all agent prompts in an execution (Default: 8,000)
  maxSpecialistOutputTokens: number;  // Max generated tokens per specialist (Default: 500)
  maxSupervisorOutputTokens: number;  // Max generated tokens for final synthesis (Default: 800)

  // Confidence & Policy Thresholds
  fastPathConfidenceThreshold: number;// Minimum confidence to take Fast-Path (Default: 0.85)
  conflictSeverityThreshold: number;  // Threshold for escalating trade-offs (Default: 0.70)
  deduplicationWindowSize: number;    // Number of recent actions checked for deduplication (Default: 10)
}

export const DEFAULT_ORCHESTRATION_POLICY: Readonly<OrchestrationPolicy> = Object.freeze({
  defaultMaxIterations: 3,
  absoluteMaxIterations: 5,
  maxSpecialistsPerIteration: 3,
  maxTotalSpecialistInvocations: 9,
  totalExecutionTimeoutMs: 15000,
  specialistTimeoutMs: 4000,
  kernelBatchTimeoutMs: 5000,
  maxTotalPromptTokens: 8000,
  maxSpecialistOutputTokens: 500,
  maxSupervisorOutputTokens: 800,
  fastPathConfidenceThreshold: 0.85,
  conflictSeverityThreshold: 0.70,
  deduplicationWindowSize: 10,
});
