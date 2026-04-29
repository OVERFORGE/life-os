// features/tasks/engine/dailyPlanner.ts
// Generates an intelligent, phase-aware daily plan from tasks + goals + energy.

import { Task } from "@/server/db/models/Task";
import { Goal } from "@/features/goals/models/Goal";
import { PhaseHistory } from "@/features/insights/models/PhaseHistory";
import { DailyLog } from "@/server/db/models/DailyLog";
import { getActiveDate } from "@/server/automation/timeUtils";

const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

/* ─────────────────────────────────────────────────────────── */
/* Phase-based workload modifier                               */
/* ─────────────────────────────────────────────────────────── */

function phaseModifier(phase: string): number {
  switch (phase) {
    case "grind":    return 1.2;  // Push harder
    case "balanced": return 1.0;
    case "recovery": return 0.7;  // Ease back
    case "slump":    return 0.6;  // Do less
    case "burnout":  return 0.4;  // Minimal effort
    default:         return 1.0;
  }
}

/* ─────────────────────────────────────────────────────────── */
/* generateDailyPlan                                           */
/* ─────────────────────────────────────────────────────────── */

export async function generateDailyPlan(userId: string, timezone?: string) {
  const today = getActiveDate(timezone);

  // 1. Load today's tasks (pending + overdue)
  const todayTasks = await Task.find({
    userId,
    status: "pending",
    dueDate: { $lte: today },
  }).lean();

  // 2. Load active goals (for context labels)
  const goals = await Goal.find({ userId }).select("_id title signals").lean();
  const goalMap = new Map(goals.map((g) => [String(g._id), g]));

  // 3. Current life phase
  const currentPhase = await PhaseHistory.findOne({ userId, endDate: null })
    .sort({ startDate: -1 })
    .lean();
  const phase = currentPhase?.phase ?? "balanced";
  const modifier = phaseModifier(phase);

  // 4. Latest daily log energy level (0–10 → 0–1)
  const latestLog = await DailyLog.findOne({ userId }).sort({ date: -1 }).lean();
  const rawEnergy = latestLog?.mental?.energy ?? 5;
  const energyFactor = rawEnergy / 10; // 0.0–1.0

  // 5. Effective capacity: base 8 tasks adjusted by phase + energy
  const capacity = Math.round(8 * modifier * (0.5 + energyFactor * 0.5));

  // 6. Score each task
  const scored = todayTasks.map((task) => {
    const pw = PRIORITY_WEIGHT[task.priority as keyof typeof PRIORITY_WEIGHT] ?? 2;
    const isOverdue = task.dueDate < today ? 2 : 1; // Overdue gets bump
    const energyCost = task.metadata?.energyCost ?? 5;
    const costPenalty = energyCost > 7 && energyFactor < 0.4 ? -1 : 0; // Defer heavy tasks when low energy

    const score = pw * isOverdue + costPenalty;
    const goal = task.goalId ? goalMap.get(String(task.goalId)) : null;

    return {
      task,
      score,
      isOverdue: task.dueDate < today,
      linkedGoal: goal ? goal.title : null,
      estimatedDuration: task.metadata?.estimatedDuration ?? null,
    };
  });

  // 7. Sort by score descending, cap at capacity
  scored.sort((a, b) => b.score - a.score);
  const prioritized = scored.slice(0, capacity);
  const deferred = scored.slice(capacity);

  // 8. Build a rough schedule (start at 8am, pack tasks)
  let currentHour = 8;
  const schedule = prioritized.map((item) => {
    const duration = item.estimatedDuration ?? 30; // default 30 min
    const startTime = `${String(Math.floor(currentHour)).padStart(2, "0")}:${String(Math.round((currentHour % 1) * 60)).padStart(2, "0")}`;
    currentHour += duration / 60;

    return {
      ...item,
      suggestedStartTime: item.task.dueTime || startTime,
    };
  });

  return {
    date: today,
    phase,
    energyLevel: rawEnergy,
    capacity,
    totalPending: todayTasks.length,
    plan: schedule,
    deferred: deferred.map((d) => ({
      taskId: String(d.task._id),
      title: d.task.title,
      reason: energyFactor < 0.4 ? "Low energy — deferred" : "Over daily capacity",
    })),
    insight: buildPlanInsight(phase, rawEnergy, prioritized.length, deferred.length),
  };
}

function buildPlanInsight(phase: string, energy: number, planned: number, deferred: number): string {
  if (phase === "burnout") return `⚠️ You're in burnout. Only ${planned} tasks scheduled — protect your recovery.`;
  if (phase === "slump") return `You're in a slump. Keep it light: ${planned} tasks. ${deferred > 0 ? `${deferred} deferred.` : ""}`;
  if (phase === "grind" && energy >= 7) return `🔥 High energy grind mode — ${planned} tasks locked in. Execute.`;
  if (phase === "recovery") return `You're recovering. ${planned} manageable tasks lined up. Don't push too hard.`;
  return `Solid day ahead — ${planned} tasks planned${deferred > 0 ? `, ${deferred} deferred` : ""}.`;
}
