/**
 * AutonomousStrategyRegistry.ts
 * 
 * Milestone B — Phase B4: Work Package 3 / Loop 5
 * Registry and Orchestrator for Closed-Loop Autonomous Strategies
 */

import { AutonomousStrategy, StrategyEvaluationInput } from "./AutonomousStrategy";
import { MorningBriefingStrategy } from "./MorningBriefingStrategy";
import { ScheduleRebalancerStrategy } from "./ScheduleRebalancerStrategy";
import { CircadianEnergyAlignmentStrategy } from "./CircadianEnergyAlignmentStrategy";
import { IProactiveCandidate, IInterruptionCostEvaluation } from "../../proactive/contracts/ProactiveContracts";
import { InterruptionCostEvaluator, IUserRealtimeContext } from "../../proactive/InterruptionCostEvaluator";
import { ProactiveActionJournal } from "../../proactive/ProactiveActionJournal";

export interface EvaluatedStrategyCandidate {
  candidate: IProactiveCandidate;
  costEvaluation: IInterruptionCostEvaluation;
  strategyId: string;
}

export class AutonomousStrategyRegistry {
  private static instance: AutonomousStrategyRegistry;
  private strategies: Map<string, AutonomousStrategy> = new Map();
  private evaluator: InterruptionCostEvaluator;
  private journal?: ProactiveActionJournal;

  constructor(deps?: {
    evaluator?: InterruptionCostEvaluator;
    journal?: ProactiveActionJournal;
  }) {
    this.evaluator = deps?.evaluator || InterruptionCostEvaluator.getInstance();
    this.journal = deps?.journal;

    // Register built-in default strategies
    this.registerStrategy(new MorningBriefingStrategy());
    this.registerStrategy(new ScheduleRebalancerStrategy());
    this.registerStrategy(new CircadianEnergyAlignmentStrategy());
  }

  public static getInstance(deps?: {
    evaluator?: InterruptionCostEvaluator;
    journal?: ProactiveActionJournal;
  }): AutonomousStrategyRegistry {
    if (!AutonomousStrategyRegistry.instance || deps) {
      AutonomousStrategyRegistry.instance = new AutonomousStrategyRegistry(deps);
    }
    return AutonomousStrategyRegistry.instance;
  }

  public registerStrategy(strategy: AutonomousStrategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  public unregisterStrategy(strategyId: string): void {
    this.strategies.delete(strategyId);
  }

  public getStrategies(): AutonomousStrategy[] {
    return Array.from(this.strategies.values()).sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute all registered strategies, deduplicate, and evaluate interruption cost.
   */
  public async evaluateAll(
    input: StrategyEvaluationInput,
    userContext?: IUserRealtimeContext | null,
    cooldownWindowMs: number = 1000 * 60 * 60 * 4 // 4-hour cooldown
  ): Promise<EvaluatedStrategyCandidate[]> {
    const sortedStrategies = this.getStrategies();
    const results: EvaluatedStrategyCandidate[] = [];

    for (const strategy of sortedStrategies) {
      try {
        const candidates = await strategy.evaluate(input);
        for (const cand of candidates) {
          // 1. Check deduplication in journal if available
          if (this.journal && cand.dedupKey) {
            const isDup = await this.journal.isDuplicate(cand.dedupKey, cooldownWindowMs);
            if (isDup) {
              continue; // Suppress duplicate
            }
          }

          // 2. Evaluate interruption cost
          const costEvaluation = this.evaluator.evaluate(cand, userContext);

          // Only keep candidate if evaluation allows interruption
          if (costEvaluation.shouldInterrupt) {
            results.push({
              candidate: cand,
              costEvaluation,
              strategyId: strategy.id,
            });
          }
        }
      } catch (err) {
        console.warn(`[AutonomousStrategyRegistry] Error evaluating strategy ${strategy.id}:`, err);
      }
    }

    return results;
  }
}

