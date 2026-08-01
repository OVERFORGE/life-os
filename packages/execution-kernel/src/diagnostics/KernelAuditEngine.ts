export interface AuditQuestionInput {
  topic: "Planner" | "AdaptiveRepair" | "LifeState" | "Prediction" | "BlockedTask" | "Stability";
  targetId?: string;
  contextData: Record<string, any>;
}

export interface AuditReport {
  topic: string;
  targetId?: string;
  explanation: string;
  evidence: string[];
  causalChain: string[];
  timestamp: number;
}

/**
 * KernelAuditEngine Subsystem
 * 
 * SOLE OWNER of deterministic decision auditing and explainability.
 * Answers "Why did X happen?" using observable historical and structural evidence.
 */
export class KernelAuditEngine {
  private static instance: KernelAuditEngine;

  static getInstance(): KernelAuditEngine {
    if (!KernelAuditEngine.instance) {
      KernelAuditEngine.instance = new KernelAuditEngine();
    }
    return KernelAuditEngine.instance;
  }

  generateAudit(input: AuditQuestionInput): AuditReport {
    const { topic, targetId, contextData } = input;
    const evidence: string[] = [];
    const causalChain: string[] = [];

    let explanation = "";

    switch (topic) {
      case "AdaptiveRepair":
        explanation = `Adaptive Repair executed due to ${contextData.trigger || "Execution Outcome"}.`;
        if (contextData.operationsCount) {
          evidence.push(`Executed ${contextData.operationsCount} repair operation(s)`);
          causalChain.push("Execution Failure / Outcome ➔ AdaptiveRepairEngine.planRepair() ➔ ExecutionGraphApplier");
        }
        break;

      case "LifeState":
        explanation = `Life State evaluated as [${contextData.state || "StableRoutine"}].`;
        if (contextData.evidence) {
          evidence.push(...contextData.evidence);
        }
        causalChain.push("Execution Graph + Profile + Signals ➔ LifeStateEngine ➔ WorldSnapshotV2");
        break;

      case "Planner":
        explanation = `Planner selected ${contextData.actionCount || 0} action(s) for situation "${contextData.situation || "general"}".`;
        causalChain.push("User Input ➔ Reasoner ➔ Planner ➔ Job Compilation");
        break;

      default:
        explanation = `Audit for ${topic} performed.`;
        causalChain.push("Kernel Request ➔ Subsystem Evaluation");
        break;
    }

    return {
      topic,
      targetId,
      explanation,
      evidence,
      causalChain,
      timestamp: Date.now(),
    };
  }
}
