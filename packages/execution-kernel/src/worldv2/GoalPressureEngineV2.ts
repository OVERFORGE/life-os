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
 *
 * Phase D Calibration (D-3 & D-4):
 *
 * D-3: Logarithmic growth formula replaces linear additive scoring.
 *   - taskPressure     = ln(1 + taskCount)    / ln(1 + TASK_REF_POINT)
 *   - blockagePressure = ln(1 + blockedCount) / ln(1 + BLOCKAGE_REF_POINT)
 *   - Components are NOT hard-capped individually. Only the final composite
 *     pressureScore is bounded at min(100, ...).
 *   - This preserves gradient for any taskCount (10 ≠ 40 ≠ 80 tasks).
 *   - Removed hardcoded baseline score of 20.
 *
 * D-4: Trend hysteresis bands widen to avoid oscillation.
 *   - "rising"  when pressureScore >= 65  (was > 60)
 *   - "falling" when pressureScore <= 25  (was < 30)
 *   - "stable"  when pressureScore in (25, 65)
 */
export class GoalPressureEngineV2 {
  private static instance: GoalPressureEngineV2;

  // D-3: Logarithmic growth reference points (soft saturation, not hard caps)
  private static readonly TASK_REF_POINT     = 20; // ln(1+20) = full task contribution reference
  private static readonly BLOCKAGE_REF_POINT = 8;  // ln(1+8)  = full blockage contribution reference

  static getInstance(): GoalPressureEngineV2 {
    if (!GoalPressureEngineV2.instance) {
      GoalPressureEngineV2.instance = new GoalPressureEngineV2();
    }
    return GoalPressureEngineV2.instance;
  }

  calculatePressure(graphSnapshot?: ExecutionGraphSnapshot | null): GoalPressureResult[] {
    if (!graphSnapshot) return [];

    const goalMap = new Map<string, { title: string; tasks: unknown[] }>();

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

    // 2. Compute pressure for each goal (D-3: logarithmic normalized scoring)
    for (const [goalId, data] of goalMap.entries()) {
      const factors: string[] = [];

      const taskCount    = data.tasks.length;
      const blockedCount = graphSnapshot.blockedNodes.filter(
        (b) => b.node.metadata?.goalId === goalId
      ).length;
      const isCritical = graphSnapshot.criticalPath.some(
        (c) => c.metadata?.goalId === goalId || c.id === goalId
      );

      // D-3: Logarithmic growth components — no per-component hard min()
      // Components may exceed 1.0 for extreme counts; only final composite is bounded.
      const taskPressure     = Math.log(1 + taskCount)    / Math.log(1 + GoalPressureEngineV2.TASK_REF_POINT);
      const blockagePressure = Math.log(1 + blockedCount) / Math.log(1 + GoalPressureEngineV2.BLOCKAGE_REF_POINT);
      const criticalBonus    = isCritical ? 1.0 : 0.0;

      if (taskCount > 0) {
        factors.push(`${taskCount} active ready task(s) [task pressure: ${taskPressure.toFixed(3)}]`);
      }
      if (blockedCount > 0) {
        factors.push(`${blockedCount} blocked task(s) [blockage pressure: ${blockagePressure.toFixed(3)}]`);
      }
      if (isCritical) {
        factors.push("Goal contains nodes on Critical Path [critical bonus: 1.000]");
      }

      // Check for finite deliverable target completion date pressure
      const goalNode =
        graphSnapshot.readyNodes.find((n) => n.id === goalId) ||
        graphSnapshot.completedNodes.find((n) => n.id === goalId) ||
        graphSnapshot.blockedNodes.find((b) => b.node.id === goalId)?.node;

      const isFinite = goalNode?.metadata?.nature === "finite_deliverable";
      let deadlinePressure = 0;

      if (isFinite && goalNode?.metadata?.targetCompletionDate) {
        const targetMs = new Date(goalNode.metadata.targetCompletionDate).getTime();
        const nowMs = Date.now();
        const daysRemaining = (targetMs - nowMs) / (1000 * 3600 * 24);
        if (daysRemaining <= 0) {
          deadlinePressure = 1.0;
          factors.push("Deliverable target date has passed [deadline pressure: 1.000]");
        } else if (daysRemaining <= 7) {
          deadlinePressure = Math.max(0, (7 - daysRemaining) / 7);
          factors.push(
            `Target deadline in ${Math.ceil(daysRemaining)} day(s) [deadline pressure: ${deadlinePressure.toFixed(3)}]`
          );
        }
      }

      const rawScore =
        isFinite && deadlinePressure > 0
          ? 0.35 * taskPressure + 0.35 * blockagePressure + 0.15 * criticalBonus + 0.15 * deadlinePressure
          : 0.40 * taskPressure + 0.40 * blockagePressure + 0.20 * criticalBonus;
      const pressureScore = Math.min(100, Math.round(rawScore * 100));


      // D-4: Widened trend hysteresis bands to avoid oscillation near boundaries
      const trend: "rising" | "stable" | "falling" =
        pressureScore >= 65 ? "rising"
        : pressureScore <= 25 ? "falling"
        : "stable";

      results.push({
        goalId,
        goalTitle: data.title,
        pressureScore,
        trend,
        factors,
        explanation: `Goal "${data.title}" has pressure score ${pressureScore}/100 (${trend}) derived from ${factors.length} logarithmic pressure signal(s).`,
      });
    }

    return results.sort((a, b) => b.pressureScore - a.pressureScore);
  }
}
