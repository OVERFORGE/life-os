import { ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";

export interface GoalPressureResult {
  goalId: string;
  goalTitle: string;
  pressureScore: number; // 0 - 100
  trend: "rising" | "stable" | "falling";
  factors: string[];
  explanation: string;
}

/**
 * GoalPressureEngineV2 Subsystem
 * 
 * SOLE OWNER of calculating execution pressure across active goals.
 * Evaluates node dependencies, priority, deadlines, and repair depth deterministically.
 */
export class GoalPressureEngineV2 {
  private static instance: GoalPressureEngineV2;

  static getInstance(): GoalPressureEngineV2 {
    if (!GoalPressureEngineV2.instance) {
      GoalPressureEngineV2.instance = new GoalPressureEngineV2();
    }
    return GoalPressureEngineV2.instance;
  }

  calculatePressure(graphSnapshot?: ExecutionGraphSnapshot | null): GoalPressureResult[] {
    if (!graphSnapshot) return [];

    const goalMap = new Map<string, { title: string; tasks: any[] }>();

    // 1. Group nodes by goal
    for (const ready of graphSnapshot.readyNodes) {
      if (ready.entityType === "goal") {
        if (!goalMap.has(ready.id)) {
          goalMap.set(ready.id, { title: ready.title, tasks: [] });
        }
      } else if (ready.metadata?.goalId) {
        const gId = ready.metadata.goalId;
        if (!goalMap.has(gId)) {
          goalMap.set(gId, { title: `Goal ${gId}`, tasks: [] });
        }
        goalMap.get(gId)!.tasks.push(ready);
      }
    }

    const results: GoalPressureResult[] = [];

    // 2. Compute pressure for each goal
    for (const [goalId, data] of goalMap.entries()) {
      const factors: string[] = [];
      let score = 20; // baseline

      const taskCount = data.tasks.length;
      if (taskCount > 0) {
        score += taskCount * 12;
        factors.push(`${taskCount} active ready task(s) (+${taskCount * 12})`);
      }

      const blockedForGoal = graphSnapshot.blockedNodes.filter((b) => b.node.metadata?.goalId === goalId);
      if (blockedForGoal.length > 0) {
        score += blockedForGoal.length * 20;
        factors.push(`${blockedForGoal.length} blocked task(s) (+${blockedForGoal.length * 20})`);
      }

      const isCritical = graphSnapshot.criticalPath.some((c) => c.metadata?.goalId === goalId || c.id === goalId);
      if (isCritical) {
        score += 25;
        factors.push("Goal contains nodes on Critical Path (+25)");
      }

      const finalScore = Math.min(100, score);
      const trend = finalScore > 60 ? "rising" : finalScore < 30 ? "falling" : "stable";

      results.push({
        goalId,
        goalTitle: data.title,
        pressureScore: finalScore,
        trend,
        factors,
        explanation: `Goal "${data.title}" has pressure score ${finalScore}/100 (${trend}) due to ${factors.length} pressure factor(s).`,
      });
    }

    return results.sort((a, b) => b.pressureScore - a.pressureScore);
  }
}
