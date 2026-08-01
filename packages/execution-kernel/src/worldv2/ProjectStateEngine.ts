import { ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";

export type ProjectStatus = "Planning" | "Active" | "Blocked" | "Recovering" | "Completed" | "Abandoned";
export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface ProjectStateResult {
  projectId: string;
  projectTitle: string;
  status: ProjectStatus;
  completionPercentage: number;
  stability: number; // 0 - 100
  riskLevel: RiskLevel;
  criticalPathSize: number;
  repairCount: number;
  dependencyHealth: string;
}

/**
 * ProjectStateEngine Subsystem
 * 
 * SOLE OWNER of tracking active project health and status deterministically.
 */
export class ProjectStateEngine {
  private static instance: ProjectStateEngine;

  static getInstance(): ProjectStateEngine {
    if (!ProjectStateEngine.instance) {
      ProjectStateEngine.instance = new ProjectStateEngine();
    }
    return ProjectStateEngine.instance;
  }

  evaluateProjects(graphSnapshot?: ExecutionGraphSnapshot | null): ProjectStateResult[] {
    if (!graphSnapshot) return [];

    const totalNodes = graphSnapshot.nodeCount || 1;
    const readyCount = graphSnapshot.readyNodes.length;
    const blockedCount = graphSnapshot.blockedNodes.length;
    const completedCount = graphSnapshot.completedNodes.length;
    const criticalPathSize = graphSnapshot.criticalPath.length;

    const completionPercentage = Math.round((completedCount / (totalNodes || 1)) * 100);
    const stability = Math.max(0, 100 - Math.round((blockedCount / totalNodes) * 100));

    let status: ProjectStatus = "Active";
    if (blockedCount > readyCount) status = "Blocked";
    else if (completionPercentage >= 100) status = "Completed";
    else if (readyCount === 0) status = "Planning";

    let riskLevel: RiskLevel = "Low";
    if (blockedCount > 4) riskLevel = "Critical";
    else if (blockedCount > 2) riskLevel = "High";
    else if (blockedCount > 0) riskLevel = "Medium";

    return [
      {
        projectId: "main_execution_project",
        projectTitle: "LifeOS Execution Workspace",
        status,
        completionPercentage,
        stability,
        riskLevel,
        criticalPathSize,
        repairCount: 0,
        dependencyHealth: `${readyCount} ready, ${blockedCount} blocked node(s)`,
      },
    ];
  }
}
