import { ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";
import { LifeStateResult } from "./LifeStateEngine";
import { IncidentRecord } from "../incidents/IncidentContracts";
import { PersonalMemoryRecord } from "../memory/PersonalMemoryContracts";
import { ContextModeRecord } from "../context/ContextModeContracts";

export interface GoalTensionAxes {
  urgency: number;            // 0.0 - 1.0: Deadline proximity & overdue pressure
  friction: number;           // 0.0 - 1.0: Blockage ratio & task churn
  capacityMatch: number;      // 0.0 - 1.0: Alignment with user biological capacity
  momentum: number;           // 0.0 - 1.0: 14-day completion velocity
  strategicAlignment: number; // 0.0 - 1.0: Critical path & priority importance
}

export type GoalTensionStatus = "aligned" | "strained" | "conflicting" | "toxic";

export interface GoalIntelligenceResult {
  goalId: string;
  goalTitle: string;
  pressureScore: number;       // 0 - 100 (Backwards compatible with GoalPressureResult)
  trend: "rising" | "stable" | "falling";
  status: GoalTensionStatus;
  axes: GoalTensionAxes;
  factors: string[];
  adaptations: string[];
  explanation: string;
}

export interface GoalIntelligenceInput {
  graphSnapshot?: ExecutionGraphSnapshot | null;
  lifeState?: LifeStateResult | null;
  activeIncidents?: IncidentRecord[];
  historicalFrictionScores?: Map<string, number>; // goalId -> friction
  historicalMemories?: PersonalMemoryRecord[];
  contextMode?: ContextModeRecord | null;
}

export class GoalIntelligenceEngine {
  private static instance: GoalIntelligenceEngine;

  static getInstance(): GoalIntelligenceEngine {
    if (!GoalIntelligenceEngine.instance) {
      GoalIntelligenceEngine.instance = new GoalIntelligenceEngine();
    }
    return GoalIntelligenceEngine.instance;
  }

  evaluateGoals(input: GoalIntelligenceInput): GoalIntelligenceResult[] {
    const {
      graphSnapshot,
      lifeState,
      activeIncidents = [],
      historicalFrictionScores = new Map(),
      historicalMemories = [],
      contextMode,
    } = input;

    if (!graphSnapshot) return [];

    const goalMap = new Map<
      string,
      {
        title: string;
        readyTasks: any[];
        blockedTasks: any[];
        isCritical: boolean;
        earliestDueDate?: number;
      }
    >();

    // Group ready nodes
    for (const ready of graphSnapshot.readyNodes) {
      const gId = ready.entityType === "goal" ? ready.id : ready.metadata?.goalId;
      if (!gId) continue;

      if (!goalMap.has(gId)) {
        goalMap.set(gId, {
          title: ready.entityType === "goal" ? ready.title : `Goal ${gId}`,
          readyTasks: [],
          blockedTasks: [],
          isCritical: false,
        });
      }

      const entry = goalMap.get(gId)!;
      if (ready.entityType === "goal") {
        entry.title = ready.title;
      } else {
        entry.readyTasks.push(ready);
        if (ready.metadata?.dueDate) {
          const dueTime = new Date(ready.metadata.dueDate).getTime();
          if (!isNaN(dueTime)) {
            entry.earliestDueDate = Math.min(entry.earliestDueDate || Infinity, dueTime);
          }
        }
      }
    }

    // Group blocked nodes
    for (const b of graphSnapshot.blockedNodes) {
      const gId = b.node.metadata?.goalId;
      if (!gId) continue;

      if (!goalMap.has(gId)) {
        goalMap.set(gId, {
          title: `Goal ${gId}`,
          readyTasks: [],
          blockedTasks: [],
          isCritical: false,
        });
      }
      goalMap.get(gId)!.blockedTasks.push(b.node);
    }

    // Identify critical path presence
    for (const c of graphSnapshot.criticalPath) {
      const gId = c.metadata?.goalId || (c.entityType === "goal" ? c.id : undefined);
      if (gId && goalMap.has(gId)) {
        goalMap.get(gId)!.isCritical = true;
      }
    }

    const results: GoalIntelligenceResult[] = [];
    const now = Date.now();

    for (const [goalId, data] of goalMap.entries()) {
      const factors: string[] = [];
      const adaptations: string[] = [];

      const totalTasks = data.readyTasks.length + data.blockedTasks.length;
      const blockedRatio = totalTasks > 0 ? data.blockedTasks.length / totalTasks : 0;

      // 1. Urgency Axis
      let urgency = 0.2; // Baseline
      if (data.earliestDueDate) {
        const hoursUntilDue = (data.earliestDueDate - now) / (1000 * 3600);
        if (hoursUntilDue <= 24) {
          urgency = 0.95;
          factors.push("Imminent deadline within 24h [urgency: 0.95]");
        } else if (hoursUntilDue <= 72) {
          urgency = 0.75;
          factors.push("Approaching deadline within 3 days [urgency: 0.75]");
        } else if (hoursUntilDue <= 168) {
          urgency = 0.50;
          factors.push("Deadline within 7 days [urgency: 0.50]");
        }
      }
      if (data.isCritical) {
        urgency = Math.min(1.0, urgency + 0.20);
        factors.push("Goal contains Critical Path nodes [+0.20 urgency]");
      }

      // Context Mode Seasonal Urgency Modulation
      const isSprint = contextMode?.isActive && contextMode.mode === "sprint";
      const isTargetGoal = isSprint && Boolean(contextMode?.config?.targetGoalIds?.includes(goalId));
      const hasSpecificSprintTargets = isSprint && (contextMode?.config?.targetGoalIds?.length ?? 0) > 0;
      const isPausedInSeason = Boolean(contextMode?.isActive && contextMode?.config?.pausedGoalIds?.includes(goalId));
      const isSabbaticalOrSanctuary = contextMode?.isActive && (contextMode.mode === "sabbatical" || contextMode.mode === "sanctuary");

      if (isPausedInSeason) {
        urgency = 0.05;
        factors.push(`Goal explicitly paused in current ${contextMode?.mode} season`);
        adaptations.push("Goal execution frozen during active season");
      } else if (isSabbaticalOrSanctuary || (contextMode?.isActive && contextMode?.config?.allowUrgencyElevation === false)) {
        urgency = Math.min(urgency, 0.15);
        factors.push(`Urgency elevation suspended under active ${contextMode?.mode} season`);
      } else if (hasSpecificSprintTargets && !isTargetGoal) {
        urgency = Math.min(urgency, 0.20);
        factors.push("Secondary goal deferred to protect sprint focus [urgency: 0.20]");
        adaptations.push("Defer non-sprint goal tasks until active sprint completes");
      } else if (isTargetGoal) {
        factors.push("Designated target goal of active Sprint Season");
      }

      // 2. Friction Axis
      const historicalFriction = historicalFrictionScores.get(goalId) || 0;
      let friction = Number(
        (0.60 * blockedRatio + 0.40 * Math.min(1.0, historicalFriction)).toFixed(3)
      );
      if (data.blockedTasks.length > 0) {
        factors.push(
          `${data.blockedTasks.length} blocked task(s) (${(blockedRatio * 100).toFixed(0)}% blockage)`
        );
      }

      // Check historical memories for recurring friction / post-mortems (Invariant 14)
      const matchingMemories = historicalMemories.filter(
        (m) =>
          m.relatedEntityIds?.includes(goalId) ||
          m.content.toLowerCase().includes(data.title.toLowerCase())
      );
      if (matchingMemories.length > 0) {
        friction = Math.min(1.0, friction + 0.20);
        factors.push(
          `Historical memory indicates recurring friction [${matchingMemories[0].summary}] (+0.20 friction)`
        );
        adaptations.push("Adjust goal pacing based on previous post-mortem lessons");
      }

      // 3. Capacity Match Axis (Higher is better match)
      let capacityMatch = 0.85; // Baseline healthy match
      if (lifeState) {
        if (lifeState.state === "Burnout") {
          capacityMatch = 0.20;
          factors.push("LifeState is Burnout: execution capacity severely restricted");
        } else if (lifeState.state === "Recovery") {
          capacityMatch = 0.40;
          factors.push("LifeState is Recovery: reduced capacity for high-strain goals");
        } else if (lifeState.mentalState?.stressLevel && lifeState.mentalState.stressLevel > 0.7) {
          capacityMatch = 0.40;
          factors.push("Elevated mental stress reduces execution capacity");
        } else if (lifeState.mentalState?.energyLevel && lifeState.mentalState.energyLevel < 0.3) {
          capacityMatch = 0.35;
          factors.push("Low energy level conflicts with goal demands");
        }
      }

      // Check active incidents affecting this goal
      const activeIncidentsForGoal = activeIncidents.filter((inc) =>
        inc.operationalConstraints?.suspendedGoalIds?.includes(goalId)
      );
      if (activeIncidentsForGoal.length > 0) {
        capacityMatch = 0.10;
        factors.push(`Active incident [${activeIncidentsForGoal[0].title}] suspends/limits goal`);
        adaptations.push("Temporarily pause goal until incident resolves");
      }

      // 4. Momentum Axis
      const momentum = totalTasks > 0 ? Math.max(0.1, 1.0 - blockedRatio) : 0.5;

      // 5. Strategic Alignment Axis
      let strategicAlignment = data.isCritical ? 0.90 : 0.60;
      if (isTargetGoal) {
        strategicAlignment = 1.0;
      } else if (hasSpecificSprintTargets && !isTargetGoal) {
        strategicAlignment = 0.30;
      }

      // Composite Weighted Pressure Score (0 - 100)
      // High Urgency, High Friction, Low Capacity Match increase pressure.
      const rawPressure =
        0.35 * urgency +
        0.30 * friction +
        0.25 * (1.0 - capacityMatch) +
        0.10 * strategicAlignment;

      const pressureScore = Math.min(100, Math.max(0, Math.round(rawPressure * 100)));

      // Trend & Status
      const trend: "rising" | "stable" | "falling" =
        pressureScore >= 65 ? "rising" : pressureScore <= 25 ? "falling" : "stable";

      let status: GoalTensionStatus = "aligned";
      if (isPausedInSeason) {
        status = "aligned";
        adaptations.push("Goal intentionally resting; zero tension expected");
      } else if (isSabbaticalOrSanctuary && friction <= 0.30) {
        status = "aligned";
        adaptations.push(`Goal maintained in protected restful alignment under ${contextMode?.mode} season`);
      } else if (pressureScore >= 75) {
        status = "toxic";
        adaptations.push("Severe tension: Prune scope or defer lower-priority tasks");
      } else if (pressureScore >= 50) {
        status = (friction > 0.20 || capacityMatch < 0.60) ? "conflicting" : "aligned";
        if (blockedRatio > 0.4) {
          adaptations.push("Resolve blocked dependency tasks to unfreeze momentum");
        }
      } else if (pressureScore >= 30) {
        // High urgency with zero friction and healthy capacity represents an active, aligned sprint;
        // Strained status is reserved for situations with actual friction or capacity deficit
        status = (friction > 0.15 || capacityMatch < 0.60) ? "strained" : "aligned";
      }

      const explanation = `Goal "${data.title}" has tension score ${pressureScore}/100 (${status}, ${trend}) derived from 5-axis intelligence.`;

      results.push({
        goalId,
        goalTitle: data.title,
        pressureScore,
        trend,
        status,
        axes: {
          urgency: Number(urgency.toFixed(3)),
          friction: Number(friction.toFixed(3)),
          capacityMatch: Number(capacityMatch.toFixed(3)),
          momentum: Number(momentum.toFixed(3)),
          strategicAlignment: Number(strategicAlignment.toFixed(3)),
        },
        factors,
        adaptations,
        explanation,
      });
    }

    return results.sort((a, b) => b.pressureScore - a.pressureScore);
  }
}
