/**
 * AutonomousStrategy.ts
 * 
 * Milestone B — Phase B4: Work Package 3 / Loop 5
 * Base Strategy Contracts for Autonomous Proactive Intelligence
 */

import { IProactiveCandidate } from "../../proactive/contracts/ProactiveContracts";

export interface StrategyEvaluationInput {
  userId: string;
  now?: Date;
  timezone?: string;
  contextProjection?: any;
  behavioralProfile?: any;
  pendingTasks?: any[];
  scheduleOccurrences?: any[];
}

export interface AutonomousStrategy {
  readonly id: string;
  readonly name: string;
  readonly priority: number; // Lower number evaluates first
  evaluate(input: StrategyEvaluationInput): Promise<IProactiveCandidate[]>;
}

