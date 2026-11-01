/**
 * CircadianEnergyAlignmentStrategy.ts
 * 
 * Milestone B — Phase B4: Work Package 3 / Loop 5
 * Evaluates circadian energy patterns (from B3 Behavioral Profile) and schedules focus blocks during peak energy.
 * Invariant: Always evaluates current hour and date in user's explicit timezone; zero host clock leakage.
 */

import { AutonomousStrategy, StrategyEvaluationInput } from "./AutonomousStrategy";
import { IProactiveCandidate } from "../../proactive/contracts/ProactiveContracts";

export class CircadianEnergyAlignmentStrategy implements AutonomousStrategy {
  public readonly id = "strategy_circadian_alignment";
  public readonly name = "Circadian Energy Alignment Strategy";
  public readonly priority = 30;

  public async evaluate(input: StrategyEvaluationInput): Promise<IProactiveCandidate[]> {
    const now = input.now ?? new Date();
    const timezone = input.timezone || (input as any).userTimezone || "UTC";

    // Format wall-clock parts according to user timezone
    let currentHour: number;
    let dateStr: string;

    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(now);
      const hourPart = parts.find((p) => p.type === "hour");
      currentHour = (input as any).hour !== undefined
        ? (input as any).hour
        : hourPart ? parseInt(hourPart.value, 10) : now.getUTCHours();

      const yearPart = parts.find((p) => p.type === "year")?.value || "2026";
      const monthPart = parts.find((p) => p.type === "month")?.value || "01";
      const dayPart = parts.find((p) => p.type === "day")?.value || "01";
      dateStr = `${yearPart}-${monthPart}-${dayPart}`;
    } catch (_) {
      currentHour = (input as any).hour !== undefined ? (input as any).hour : now.getUTCHours();
      dateStr = now.toISOString().slice(0, 10);
    }

    // Check behavioral profile for peak energy window (default to 09:00 - 12:00 if not specified)
    const profile = input.behavioralProfile;
    const peakStartHour = profile?.cadenceMetrics?.peakStartHour ?? 9;
    const peakEndHour = profile?.cadenceMetrics?.peakEndHour ?? 12;

    // Check if within 30 minutes of peak start or currently in peak
    const isInOrApproachingPeak = currentHour >= peakStartHour - 1 && currentHour < peakEndHour;
    if (!isInOrApproachingPeak) {
      return [];
    }

    const dedupKey = `circadian_focus:${input.userId}:${dateStr}`;

    const tasks = input.pendingTasks || [];
    const demandingTasks = tasks.filter((t) => t.priority === "high" || (t.metadata && t.metadata.energyCost >= 4));

    if (demandingTasks.length === 0) {
      return [];
    }

    const targetTask = demandingTasks[0];

    const candidate: IProactiveCandidate = {
      candidateId: `cand_circadian_${input.userId}_${dateStr}`,
      userId: input.userId,
      autonomyLevel: "L2",
      urgency: "MEDIUM",
      domain: "FOCUS",
      proposal: {
        actionType: "PROTECT_FOCUS_BLOCK",
        title: `Protect Peak Focus Block for "${targetTask.title}"`,
        description: `Your peak circadian energy window is active (${peakStartHour}:00 - ${peakEndHour}:00). Align high-demand task "${targetTask.title}" into this window.`,
        parameters: {
          taskId: targetTask._id || targetTask.id,
          taskTitle: targetTask.title,
          peakStartHour,
          peakEndHour,
        },
      } as any,
      rationale: "Aligning cognitively demanding work with empirical circadian energy peaks maximizes deep work output.",
      requiredConfidence: 0.85,
      dedupKey,
      actionValueScore: 0.88,
      estimatedInterruptionCost: 0.20,
      confidenceScore: 0.90,
      createdAt: now.getTime(),
    };

    return [candidate];
  }
}
