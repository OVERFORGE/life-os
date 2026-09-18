/**
 * TerminationPolicy — Strategy Interface & Default Policy Implementation
 *
 * Defines ISimulationTerminationPolicy strategy interface and DefaultTerminationPolicy
 * for data-driven runtime termination evaluation (targetDays, maximumTicks, stopOnFailure).
 */

export interface TerminationEvaluationContext {
  currentTick: number;
  currentDay: number;
  startDay: number;
  hasFailedStep?: boolean;
}

export interface TerminationEvaluationResult {
  terminate: boolean;
  reason?: string;
}

export interface ISimulationTerminationPolicy {
  evaluate(context: TerminationEvaluationContext): TerminationEvaluationResult;
}

export interface DefaultTerminationPolicyOptions {
  targetDays?: number;
  maximumTicks?: number;
  stopOnFailure?: boolean;
}

export class DefaultTerminationPolicy implements ISimulationTerminationPolicy {
  private options: DefaultTerminationPolicyOptions;

  constructor(options: DefaultTerminationPolicyOptions = {}) {
    this.options = options;
  }

  public evaluate(context: TerminationEvaluationContext): TerminationEvaluationResult {
    // Check 1: Failure stop condition
    if (this.options.stopOnFailure && context.hasFailedStep) {
      return {
        terminate: true,
        reason: `Termination policy triggered: Step execution failure (stopOnFailure = true).`,
      };
    }

    // Check 2: Maximum ticks limit
    if (this.options.maximumTicks !== undefined && context.currentTick >= this.options.maximumTicks) {
      return {
        terminate: true,
        reason: `Termination policy triggered: Maximum ticks limit reached (${context.currentTick} >= ${this.options.maximumTicks}).`,
      };
    }

    // Check 3: Target days completed
    if (this.options.targetDays !== undefined) {
      const elapsedDays = context.currentDay - context.startDay + 1;
      if (elapsedDays > this.options.targetDays) {
        return {
          terminate: true,
          reason: `Termination policy triggered: Target days completed (${elapsedDays - 1} full days completed, now on Day ${context.currentDay}).`,
        };
      }
    }

    return { terminate: false };
  }
}
