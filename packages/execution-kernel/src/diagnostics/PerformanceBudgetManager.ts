import { SubsystemName } from "./DiagnosticSnapshot";
import { KERNEL_CONFIG } from "../shared/KernelConfig";

export interface BudgetConfig {
  maxDurationMs: number;
}

export const DEFAULT_PERFORMANCE_BUDGETS: Record<SubsystemName, number> = {
  ...KERNEL_CONFIG.PERFORMANCE_TARGETS_MS,
};

/**
 * PerformanceBudgetManager Subsystem
 * 
 * SOLE OWNER of performance budget enforcement and threshold auditing.
 * Emits warnings when subsystems exceed targeted latencies without altering execution behavior.
 */
export class PerformanceBudgetManager {
  private static instance: PerformanceBudgetManager;
  private budgets: Record<SubsystemName, number> = { ...DEFAULT_PERFORMANCE_BUDGETS };

  static getInstance(): PerformanceBudgetManager {
    if (!PerformanceBudgetManager.instance) {
      PerformanceBudgetManager.instance = new PerformanceBudgetManager();
    }
    return PerformanceBudgetManager.instance;
  }

  getBudget(subsystem: SubsystemName): number {
    return this.budgets[subsystem] || 50;
  }

  evaluateDuration(subsystem: SubsystemName, durationMs: number): string | null {
    const target = this.getBudget(subsystem);
    if (target > 0 && durationMs > target) {
      return `⚠️ [PERFORMANCE_BUDGET] Subsystem "${subsystem}" exceeded budget target of ${target}ms (actual: ${durationMs}ms, +${durationMs - target}ms).`;
    }
    return null;
  }
}
