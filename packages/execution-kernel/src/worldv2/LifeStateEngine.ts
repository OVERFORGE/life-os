import { ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";
import { RepairDiagnostics } from "../kernel/AdaptiveRepairEngine";
import { UserBehavioralProfile } from "../learning/BehaviorProfile";
import { LearningSignal } from "../learning/LearningSignal";

export type LifeState =
  | "FocusedExecution"
  | "Recovery"
  | "Overloaded"
  | "BurnoutRisk"
  | "Exploration"
  | "StableRoutine"
  | "Transition"
  | "HighMomentum"
  | "LowMomentum";

export interface LifeStateResult {
  state: LifeState;
  confidence: number; // 0.0 to 1.0
  evidence: string[];
  explanation: string;
}

export interface LifeStateInput {
  graphSnapshot?: ExecutionGraphSnapshot | null;
  repairDiagnostics?: RepairDiagnostics | null;
  profile?: UserBehavioralProfile | null;
  learningSignals?: LearningSignal[];
  stabilityScore?: number | null;
}

/**
 * LifeStateEngine Subsystem
 * 
 * SOLE OWNER of determining the user's current macro life state.
 * Evaluates execution topology, repair stability, completion consistency, and learning signals deterministically.
 * 
 * NO AI, NO Neural Networks, NO Randomness. Pure deterministic rules.
 */
export class LifeStateEngine {
  private static instance: LifeStateEngine;

  static getInstance(): LifeStateEngine {
    if (!LifeStateEngine.instance) {
      LifeStateEngine.instance = new LifeStateEngine();
    }
    return LifeStateEngine.instance;
  }

  evaluate(input: LifeStateInput): LifeStateResult {
    const {
      graphSnapshot,
      repairDiagnostics,
      profile,
      learningSignals = [],
      stabilityScore = 100,
    } = input;

    const evidence: string[] = [];

    const nodeCount = graphSnapshot?.nodeCount || 0;
    const blockedCount = graphSnapshot?.blockedNodes.length || 0;
    const readyCount = graphSnapshot?.readyNodes.length || 0;
    const blockedRatio = nodeCount > 0 ? blockedCount / nodeCount : 0;
    const completionRate = profile?.taskCompletionRate || 0.75;
    const score = stabilityScore ?? 100;
    const deadCount = repairDiagnostics?.deadNodeIds.length || 0;

    // Rule 1: Burnout Risk
    if (score < 40 || deadCount > 3 || (blockedRatio > 0.5 && nodeCount > 5)) {
      evidence.push(`Graph stability score is critical (${score}/100)`);
      evidence.push(`${blockedCount}/${nodeCount} nodes currently blocked (${Math.round(blockedRatio * 100)}%)`);
      if (deadCount > 0) evidence.push(`${deadCount} dead node(s) detected`);

      return {
        state: "BurnoutRisk",
        confidence: 0.92,
        evidence,
        explanation: "High blockage ratio, dead dependencies, and low stability score indicate significant burnout risk.",
      };
    }

    // Rule 2: Overloaded
    if (readyCount > 12 || blockedCount > 5) {
      evidence.push(`${readyCount} ready execution nodes pending`);
      evidence.push(`${blockedCount} blocked execution nodes`);

      return {
        state: "Overloaded",
        confidence: 0.85,
        evidence,
        explanation: "Excessive active execution items causing mental and operational overload.",
      };
    }

    // Rule 3: High Momentum
    if (completionRate >= 0.85 && score >= 85 && readyCount > 0) {
      evidence.push(`High task completion rate (${Math.round(completionRate * 100)}%)`);
      evidence.push(`High graph stability score (${score}/100)`);

      return {
        state: "HighMomentum",
        confidence: 0.90,
        evidence,
        explanation: "Strong execution consistency and clean graph topology driving high momentum.",
      };
    }

    // Rule 4: Focused Execution
    if (readyCount > 0 && readyCount <= 6 && blockedCount <= 2 && score >= 75) {
      evidence.push(`Balanced workload: ${readyCount} ready task(s), ${blockedCount} blocked task(s)`);
      evidence.push(`Stable execution graph (${score}/100)`);

      return {
        state: "FocusedExecution",
        confidence: 0.88,
        evidence,
        explanation: "Clean, focused execution pipeline with manageable work-in-progress items.",
      };
    }

    // Rule 5: Recovery
    const hasRecoverySignal = learningSignals.some(
      (s) => s.type === "IncreaseBreakFrequency" || s.type === "ReduceConsecutiveDeepWork"
    );
    if (hasRecoverySignal || profile?.recoveryTendency! > 0.6) {
      evidence.push("Active learning signals suggest increased break frequency and recovery time");

      return {
        state: "Recovery",
        confidence: 0.80,
        evidence,
        explanation: "System detects need for operational rest and schedule recovery.",
      };
    }

    // Rule 6: Low Momentum
    if (completionRate < 0.5) {
      evidence.push(`Low completion rate (${Math.round(completionRate * 100)}%)`);

      return {
        state: "LowMomentum",
        confidence: 0.82,
        evidence,
        explanation: "Low execution throughput indicates lagging momentum.",
      };
    }

    // Default: Stable Routine
    evidence.push("Balanced metrics across execution graph, profile, and diagnostics");
    return {
      state: "StableRoutine",
      confidence: 0.80,
      evidence,
      explanation: "Execution parameters are operating within steady-state routine thresholds.",
    };
  }
}
