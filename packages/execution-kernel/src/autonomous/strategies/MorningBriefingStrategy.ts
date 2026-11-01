/**
 * MorningBriefingStrategy.ts
 * 
 * Milestone B — Phase B4: Work Package 3 / Loop 5
 * Evaluates morning schedule readiness, high-priority tasks, and prepares daily briefing.
 */

import { AutonomousStrategy, StrategyEvaluationInput } from "./AutonomousStrategy";
import { IProactiveCandidate } from "../../proactive/contracts/ProactiveContracts";

export class MorningBriefingStrategy implements AutonomousStrategy {
  public readonly id = "strategy_morning_briefing";
  public readonly name = "Morning Briefing Strategy";
  public readonly priority = 10;

  public async evaluate(input: StrategyEvaluationInput): Promise<IProactiveCandidate[]> {
    const now = input.now ?? new Date();
    const userTimezone = (input as any).userProfile?.timezone || (input as any).timezone || "UTC";
    const hourFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: userTimezone,
      hour: "numeric",
      hourCycle: "h23",
    });
    const hours = (input as any).hour !== undefined
      ? (input as any).hour
      : parseInt(hourFormatter.format(now), 10);

    // Only active during morning window (06:00 - 10:59)
    if (hours < 6 || hours >= 11) {
      return [];
    }

    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: userTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dateStr = dateFormatter.format(now);
    const dedupKey = `morning_briefing:${input.userId}:${dateStr}`;

    const tasks = input.pendingTasks || [];
    const highPriorityTasks = tasks.filter((t) => t.priority === "high");
    const occurrences = input.scheduleOccurrences || [];

    const candidate: IProactiveCandidate = {
      candidateId: `cand_briefing_${input.userId}_${dateStr}`,
      userId: input.userId,
      autonomyLevel: "L1",
      urgency: "MEDIUM",
      domain: "SCHEDULE",
      proposal: {
        actionType: "DISPATCH_BRIEFING",
        title: `Morning Briefing for ${dateStr}`,
        description: `You have ${tasks.length} tasks scheduled today (${highPriorityTasks.length} high priority) and ${occurrences.length} calendar events.`,
        parameters: {
          taskCount: tasks.length,
          highPriorityCount: highPriorityTasks.length,
          occurrenceCount: occurrences.length,
        },
      } as any,
      rationale: "Daily morning briefing orienting the user to key priorities and calendar commitments.",
      requiredConfidence: 0.80,
      dedupKey,
      actionValueScore: 0.85,
      estimatedInterruptionCost: 0.20,
      confidenceScore: 0.95,
      createdAt: now.getTime(),
    };

    return [candidate];
  }
}
