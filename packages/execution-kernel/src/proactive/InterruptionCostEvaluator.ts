/**
 * Interruption Cost Evaluator (Phase 8)
 * 
 * Computes whether the value of taking an action / alerting the user
 * exceeds the cost of interrupting them in their current state.
 */

import {
  IProactiveCandidate,
  IInterruptionCostEvaluation,
} from "./contracts/ProactiveContracts";

export interface IUserRealtimeContext {
  cognitiveLoad: number;             // 0.0 - 1.0
  isQuietHours: boolean;
  inMeeting: boolean;
  inDeepWork: boolean;
  recentNotificationCountToday: number;
  minutesUntilNextCommitment?: number;
}

export class InterruptionCostEvaluator {
  private static instance: InterruptionCostEvaluator;

  static getInstance(): InterruptionCostEvaluator {
    if (!InterruptionCostEvaluator.instance) {
      InterruptionCostEvaluator.instance = new InterruptionCostEvaluator();
    }
    return InterruptionCostEvaluator.instance;
  }

  evaluate(
    candidate: IProactiveCandidate,
    context: IUserRealtimeContext
  ): IInterruptionCostEvaluation {
    // 1. Calculate Interruption Cost
    let cost = 0.20; // Base baseline cost for any unsolicited context switch

    if (context.isQuietHours) {
      cost += 0.80; // Prohibitive barrier during designated sleep / quiet hours
    }
    if (context.inMeeting) {
      cost += 0.40;
    }
    if (context.inDeepWork) {
      cost += 0.35;
    }
    if (context.cognitiveLoad > 0.6) {
      cost += 0.25 * context.cognitiveLoad;
    }
    // Fatigue escalation: each previous interruption increases resistance
    cost += 0.15 * Math.min(context.recentNotificationCountToday, 5);

    // Clamp cost to [0.0, 1.5]
    cost = Math.min(1.5, Math.max(0.0, cost));

    // 2. Calculate Action Value
    const urgencyMultipliers: Record<string, number> = {
      LOW: 0.6,
      MEDIUM: 0.8,
      HIGH: 1.0,
      CRITICAL: 1.5,
    };
    const mult = urgencyMultipliers[candidate.urgency] ?? 0.8;
    const actionValue = Math.min(1.0, candidate.actionValueScore * mult);

    // 3. Compute Net Value
    const netValue = actionValue - cost;

    // 4. Determine Interruption Decision
    let shouldInterrupt = false;
    let rationale = "";

    if (context.isQuietHours) {
      if (candidate.urgency === "CRITICAL" && actionValue >= 0.90) {
        shouldInterrupt = true;
        rationale = "Critical emergency alert overrides quiet hours.";
      } else {
        shouldInterrupt = false;
        rationale = "Suppressed due to active quiet hours (22:00 - 08:00).";
      }
    } else if (candidate.urgency === "CRITICAL") {
      shouldInterrupt = true;
      rationale = "Critical urgency warrants immediate interruption.";
    } else if (netValue > 0.15) {
      shouldInterrupt = true;
      rationale = `Action value (${actionValue.toFixed(2)}) significantly exceeds interruption cost (${cost.toFixed(2)}).`;
    } else {
      shouldInterrupt = false;
      rationale = `Interruption cost (${cost.toFixed(2)}) outweighs action value (${actionValue.toFixed(2)}).`;
    }

    return {
      cost,
      actionValue,
      netValue,
      shouldInterrupt,
      quietHoursActive: context.isQuietHours,
      rationale,
    };
  }
}
