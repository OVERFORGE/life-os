import { HealthSummary, HealthStatus } from "./DiagnosticSnapshot";

export interface HealthEvaluationInput {
  stabilityScore?: number | null;
  deadNodeCount?: number;
  blockedNodeCount?: number;
  budgetViolations?: string[];
}

/**
 * KernelHealthEngine Subsystem
 * 
 * SOLE OWNER of evaluating kernel health using deterministic rules and evidence.
 */
export class KernelHealthEngine {
  private static instance: KernelHealthEngine;

  static getInstance(): KernelHealthEngine {
    if (!KernelHealthEngine.instance) {
      KernelHealthEngine.instance = new KernelHealthEngine();
    }
    return KernelHealthEngine.instance;
  }

  evaluateHealth(input: HealthEvaluationInput): HealthSummary {
    const {
      stabilityScore = 100,
      deadNodeCount = 0,
      blockedNodeCount = 0,
      budgetViolations = [],
    } = input;

    const evidence: string[] = [];
    const warnings: string[] = [...budgetViolations];
    let score = stabilityScore ?? 100;

    if (deadNodeCount > 0) {
      score -= deadNodeCount * 15;
      evidence.push(`Found ${deadNodeCount} dead execution node(s)`);
    }

    if (blockedNodeCount > 5) {
      score -= 15;
      evidence.push(`High blocked node count (${blockedNodeCount})`);
    }

    if (budgetViolations.length > 0) {
      score -= budgetViolations.length * 5;
      evidence.push(`${budgetViolations.length} performance budget violation(s) recorded`);
    }

    const finalScore = Math.max(0, Math.min(100, score));

    let status: HealthStatus = "Healthy";
    if (finalScore < 50 || deadNodeCount > 3) {
      status = "Critical";
    } else if (finalScore < 80 || budgetViolations.length > 0 || blockedNodeCount > 3) {
      status = "Warning";
    }

    evidence.push(`Overall Kernel Stability & Health Score: ${finalScore}/100`);

    return {
      status,
      score: finalScore,
      evidence,
      warnings,
    };
  }
}
