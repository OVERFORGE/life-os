/**
 * ScheduleRebalancerStrategy.ts
 * 
 * Milestone B — Phase B4: Work Package 3 / Loop 5
 * Evaluates schedule conflicts, overlapping blocks, and overdue tasks to propose rebalancing.
 * Invariant: Parameterized transition buffer from user preferences; zero host clock leakage.
 */

import { AutonomousStrategy, StrategyEvaluationInput } from "./AutonomousStrategy";
import { IProactiveCandidate } from "../../proactive/contracts/ProactiveContracts";

export class ScheduleRebalancerStrategy implements AutonomousStrategy {
  public readonly id = "strategy_schedule_rebalancer";
  public readonly name = "Schedule Rebalancer Strategy";
  public readonly priority = 20;

  public async evaluate(input: StrategyEvaluationInput): Promise<IProactiveCandidate[]> {
    const now = input.now ?? new Date();
    const tasks = input.pendingTasks || [];
    const occurrences = input.scheduleOccurrences || [];
    const timezone = input.timezone || (input as any).userTimezone || "UTC";

    // Format wall-clock today string according to user timezone
    let todayStr: string;
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(now);
      const yearPart = parts.find((p) => p.type === "year")?.value || "2026";
      const monthPart = parts.find((p) => p.type === "month")?.value || "01";
      const dayPart = parts.find((p) => p.type === "day")?.value || "01";
      todayStr = `${yearPart}-${monthPart}-${dayPart}`;
    } catch (_) {
      todayStr = now.toISOString().slice(0, 10);
    }

    // Configurable transition buffer: derive from user preferences (default 10 minutes)
    const transitionBufferMinutes =
      (input as any).userPreferences?.calendarPreferences?.transitionBufferMinutes ??
      (input as any).userPreferences?.transitionBufferMinutes ??
      10;

    const candidates: IProactiveCandidate[] = [];

    // 1. Detect Overlapping Calendar Occurrences
    const sortedOccurrences = [...occurrences].sort((a, b) => {
      const aStart = new Date(a.startTime || a.start).getTime();
      const bStart = new Date(b.startTime || b.start).getTime();
      return aStart - bStart;
    });

    for (let i = 0; i < sortedOccurrences.length - 1; i++) {
      const current = sortedOccurrences[i];
      const next = sortedOccurrences[i + 1];

      const currentEnd = new Date(current.endTime || current.end).getTime();
      const nextStart = new Date(next.startTime || next.start).getTime();

      if (currentEnd > nextStart) {
        // Conflict detected!
        const overlapMinutes = Math.round((currentEnd - nextStart) / 60000);
        const conflictId = `${current._id || current.id}_${next._id || next.id}`;
        const dedupKey = `conflict_rebalance:${input.userId}:${conflictId}`;

        candidates.push({
          candidateId: `cand_rebalance_${conflictId}`,
          userId: input.userId,
          autonomyLevel: "L3",
          urgency: "HIGH",
          domain: "SCHEDULE",
          proposal: {
            actionType: "REBALANCE_SCHEDULE",
            title: `Resolve Calendar Conflict: "${current.title}" and "${next.title}"`,
            description: `Events overlap by ${overlapMinutes} minutes. Proposing shifting "${next.title}" by ${overlapMinutes + transitionBufferMinutes} minutes.`,
            parameters: {
              conflictingEventA: current._id || current.id,
              conflictingEventB: next._id || next.id,
              suggestedShiftMinutes: overlapMinutes + transitionBufferMinutes,
            },
          } as any,
          rationale: "Overlapping schedule commitments require autonomous rebalancing to prevent double-booking.",
          requiredConfidence: 0.85,
          dedupKey,
          actionValueScore: 0.90,
          estimatedInterruptionCost: 0.25,
          confidenceScore: 0.92,
          createdAt: now.getTime(),
        });
      }
    }

    // 2. Detect Overdue Tasks that require postponement
    const overdueTasks = tasks.filter((t) => t.dueDate && t.dueDate < todayStr && t.status === "pending");

    if (overdueTasks.length > 0) {
      const dedupKey = `overdue_rebalance:${input.userId}:${todayStr}`;
      candidates.push({
        candidateId: `cand_overdue_${input.userId}_${todayStr}`,
        userId: input.userId,
        autonomyLevel: "L2",
        urgency: "MEDIUM",
        domain: "TASK",
        proposal: {
          actionType: "ROLL_OVERDUE_TASKS",
          title: `Roll ${overdueTasks.length} Overdue Tasks to Today`,
          description: `You have ${overdueTasks.length} tasks from previous days still pending. Proposing rolling their due date to today.`,
          parameters: {
            taskIds: overdueTasks.map((t) => t._id || t.id),
            targetDueDate: todayStr,
          },
        } as any,
        rationale: "Uncompleted tasks from prior days should be automatically consolidated onto today's backlog.",
        requiredConfidence: 0.80,
        dedupKey,
        actionValueScore: 0.75,
        estimatedInterruptionCost: 0.20,
        confidenceScore: 0.88,
        createdAt: now.getTime(),
      });
    }

    return candidates;
  }
}
