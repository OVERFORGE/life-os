/**
 * InterruptionCostEvaluator.ts
 * 
 * Milestone B — Phase B4: Work Package 2 / Loop 4
 * Evaluates interruption cost score strictly in range [0.0, 1.0].
 * Features:
 * - Bounded [0.0, 1.0] mathematical guarantees
 * - Conservative Unknown State Handling (defaults to 0.85 cost when state is unknown)
 * - Strict Emergency Bypass (ONLY CRITICAL_EMERGENCY overrides Quiet Hours)
 * - Epistemic Confidence factored Action Value
 */

import {
  IProactiveCandidate,
  IInterruptionCostEvaluation,
} from "./contracts/ProactiveContracts";

export interface IUserRealtimeContext {
  cognitiveLoad?: number;             // 0.0 - 1.0
  isQuietHours?: boolean;
  inMeeting?: boolean;
  inDeepWork?: boolean;
  recentNotificationCountToday?: number;
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
    context?: IUserRealtimeContext | null
  ): IInterruptionCostEvaluation {
    // 1. Conservative Unknown State Handling
    // If context is omitted, null, or completely undefined, default conservatively to high resistance (0.85)
    if (!context || (context.cognitiveLoad === undefined && context.isQuietHours === undefined)) {
      const isCriticalEmergency = candidate.urgency === "CRITICAL_EMERGENCY";
      const cost = isCriticalEmergency ? 0.0 : 0.85;
      const confidence = candidate.confidenceScore ?? 1.0;
      const actionValue = Math.min(1.0, candidate.actionValueScore * confidence);
      const netValue = Number((actionValue - cost).toFixed(4));

      return {
        cost,
        actionValue,
        netValue,
        shouldInterrupt: isCriticalEmergency || (netValue > 0.20 && actionValue >= 0.90),
        quietHoursActive: false,
        rationale: isCriticalEmergency
          ? "CRITICAL_EMERGENCY alert executed despite unknown user context."
          : `Conservative high-cost suppression (${cost}) applied due to unknown user context.`,
      };
    }

    const isQuietHours = !!context.isQuietHours;
    const isCriticalEmergency = candidate.urgency === "CRITICAL_EMERGENCY";

    // 2. Strict Emergency Bypass for Quiet Hours
    if (isQuietHours && !isCriticalEmergency) {
      const confidence = candidate.confidenceScore ?? 1.0;
      const actionValue = Math.min(1.0, candidate.actionValueScore * confidence);
      return {
        cost: 1.0,
        actionValue,
        netValue: Number((actionValue - 1.0).toFixed(4)),
        shouldInterrupt: false,
        quietHoursActive: true,
        rationale: `Suppressed due to active quiet hours. Urgency "${candidate.urgency}" does not qualify for critical emergency bypass.`,
      };
    }

    // 3. Compute Base Cost and Contextual Adjustments
    let cost = 0.20; // Baseline cost for unsolicited disruption

    if (isCriticalEmergency) {
      cost = 0.0;
    } else {
      if (context.inMeeting) {
        cost += 0.35;
      }
      if (context.inDeepWork) {
        cost += 0.30;
      }
      if (typeof context.cognitiveLoad === "number") {
        cost += 0.20 * Math.max(0.0, Math.min(1.0, context.cognitiveLoad));
      } else {
        cost += 0.15; // Conservative penalty for missing cognitive load
      }

      // Interruption fatigue: +0.05 per prior notification today, capped at +0.25
      const notifCount = context.recentNotificationCountToday ?? 0;
      cost += 0.05 * Math.min(Math.max(0, notifCount), 5);
    }

    // STRICT BOUND: Ensure cost is clamped strictly within [0.0, 1.0]
    cost = Math.min(1.0, Math.max(0.0, Number(cost.toFixed(4))));

    // 4. Calculate Action Value (with confidence multiplier and urgency weight)
    const urgencyMultipliers: Record<string, number> = {
      LOW: 0.6,
      MEDIUM: 0.8,
      HIGH: 1.0,
      CRITICAL: 1.2,
      CRITICAL_EMERGENCY: 2.0,
    };
    const mult = urgencyMultipliers[candidate.urgency] ?? 0.8;
    const confidence = Math.min(1.0, Math.max(0.0, candidate.confidenceScore ?? 1.0));
    const actionValue = Math.min(1.0, Math.max(0.0, Number((candidate.actionValueScore * confidence * mult).toFixed(4))));

    // 5. Compute Net Value
    const netValue = Number((actionValue - cost).toFixed(4));

    // 6. Final Decision & Rationale
    let shouldInterrupt = false;
    let rationale = "";

    if (isCriticalEmergency) {
      shouldInterrupt = true;
      rationale = isQuietHours
        ? "CRITICAL_EMERGENCY alert strictly overrides Quiet Hours / DND."
        : "CRITICAL_EMERGENCY alert warrants immediate unconstrained interruption.";
    } else if (candidate.urgency === "CRITICAL" && netValue > 0.0) {
      shouldInterrupt = true;
      rationale = `Critical alert approved with positive net value (${netValue.toFixed(2)}).`;
    } else if (netValue > 0.15 && actionValue >= 0.50) {
      shouldInterrupt = true;
      rationale = `Action value (${actionValue.toFixed(2)}) significantly exceeds interruption cost (${cost.toFixed(2)}).`;
    } else {
      shouldInterrupt = false;
      rationale = `Interruption cost (${cost.toFixed(2)}) outweighs action value (${actionValue.toFixed(2)}) [net: ${netValue.toFixed(2)}].`;
    }

    return {
      cost,
      actionValue,
      netValue,
      shouldInterrupt,
      quietHoursActive: isQuietHours,
      rationale,
    };
  }
}
