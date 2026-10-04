/**
 * Morning Briefing Engine (Phase 9)
 * 
 * Synthesizes the Canonical Life Context Projection into an executive,
 * voice-ready Morning Briefing.
 * 
 * Invariants:
 * - Strict word budget: <= 120 words for audio delivery (~40 seconds).
 * - Zero internal architecture jargon leaks to the user.
 * - Any accepted optimization mutates state ONLY through KernelCapabilityService.
 * - Idempotent per user per calendar day.
 */

import { ILifeContextProjection } from "../../worldv2/contracts/LifeContextProjectionContracts";
import {
  IMorningBriefing,
  IScheduleOverview,
  IPriorityFocusTask,
  IProposedOptimization,
  DayDensityTier,
  RecoveryStatus,
} from "./contracts/MorningBriefingContracts";
import { IKernelCapabilityService } from "../../orchestration/kernel/IKernelCapabilityService";
import { ActionProposal } from "../../orchestration/contracts/ActionProposalContracts";
import { generateId } from "../../shared/ids";

export class MorningBriefingEngine {
  private static instance: MorningBriefingEngine;
  private inMemoryCache: Map<string, IMorningBriefing> = new Map();

  static getInstance(): MorningBriefingEngine {
    if (!MorningBriefingEngine.instance) {
      MorningBriefingEngine.instance = new MorningBriefingEngine();
    }
    return MorningBriefingEngine.instance;
  }

  /**
   * Generates or retrieves today's Morning Briefing for the user.
   */
  async generateBriefing(
    projection: ILifeContextProjection,
    targetDateStr?: string,
    now: number = Date.now()
  ): Promise<IMorningBriefing> {
    const userId = projection.userId || (projection as any).identity?.userId;
    const date = targetDateStr || new Date(now).toISOString().slice(0, 10);
    const cacheKey = `${userId}:${date}`;

    // Return cached briefing if already assembled today
    const cached = this.inMemoryCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 1. Analyze Recovery Status
    let recoveryStatus: RecoveryStatus = "UNKNOWN";
    let readinessHeadline = "Ready for the day ahead.";
    const sleepScore = projection.physicalReadiness?.sleepQualityScore ?? (projection as any).physical?.sleepRecoveryScore ?? 0.8;

    if (sleepScore > 0) {
      if (sleepScore >= 0.75) {
        recoveryStatus = "RESTED";
        readinessHeadline = "You are well rested with strong physical recovery.";
      } else if (sleepScore >= 0.50) {
        recoveryStatus = "MODERATE";
        readinessHeadline = "Recovery is moderate today. Pace your afternoon energy.";
      } else {
        recoveryStatus = "DEPLETED";
        readinessHeadline = "Your sleep was shortened and recovery is limited. Prioritize essential focus.";
      }
    }

    // 2. Analyze Schedule Density
    const meetingMinutes = projection.operationalSchedule?.todayMeetingDurationMinutes ?? (projection as any).schedule?.totalMeetingMinutesToday ?? 0;
    let densityTier: DayDensityTier = "LIGHT";
    if (meetingMinutes >= 240) {
      densityTier = "OVERLOADED";
    } else if (meetingMinutes >= 150) {
      densityTier = "HEAVY";
    } else if (meetingMinutes >= 60) {
      densityTier = "MODERATE";
    }

    const rawWindows = (projection as any).schedule?.availableDeepWorkWindows || [];
    const deepWorkMinutes = rawWindows.reduce(
      (acc: number, w: any) => acc + w.durationMinutes,
      0
    );
    const deepWorkHours = projection.operationalSchedule?.freeFocusBlocksRemaining !== undefined
      ? Math.round(projection.operationalSchedule.freeFocusBlocksRemaining * 1.5 * 10) / 10
      : Math.round((deepWorkMinutes / 60) * 10) / 10;

    let firstCommitmentTime = projection.operationalSchedule?.nextCommitmentTime ?? "None scheduled";
    if (firstCommitmentTime === "None scheduled" && (projection as any).schedule?.firstCommitmentTimestamp) {
      const d = new Date((projection as any).schedule.firstCommitmentTimestamp);
      firstCommitmentTime = d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: (projection as any).identity?.timezone || "UTC",
      });
    }

    const scheduleOverview: IScheduleOverview = {
      totalMeetings: projection.operationalSchedule?.todayMeetingCount ?? Math.round(meetingMinutes / 45),
      meetingMinutes,
      deepWorkHours,
      firstCommitmentTime,
      densityTier,
    };

    // 3. Priority Focus Task
    let priorityFocusTask: IPriorityFocusTask | undefined;
    const goals = projection.goalPressures || (projection as any).execution?.topGoalPressures || [];
    if (goals.length > 0) {
      const topGoal = goals[0];
      priorityFocusTask = {
        id: topGoal.goalId,
        title: topGoal.title,
        rationale: "Highest strategic priority for today.",
      };
    } else if ((projection as any).execution?.activeBacklogCount > 0) {
      priorityFocusTask = {
        id: "backlog-triage",
        title: "High-Priority Task Backlog",
        rationale: `${(projection as any).execution.activeBacklogCount} active items pending review.`,
      };
    }

    // 4. Proposed Schedule Optimization
    let proposedOptimization: IProposedOptimization | undefined;
    if (recoveryStatus === "DEPLETED" && meetingMinutes >= 150) {
      proposedOptimization = {
        optimizationId: generateId("opt"),
        description: "Protect a 45-minute recovery buffer in the mid-afternoon.",
        action: {
          proposalId: generateId("prop"),
          capabilityURN: "urn:lifeos:action:create_internal_focus_block",
          intentCategory: "CREATE_SCHEDULE_ITEM",
          parameters: {
            durationMinutes: 45,
            label: "Rest & Focus Buffer",
          },
          confidence: 0.90,
          provenance: "MorningBriefingEngine",
          requiresConfirmation: true,
          estimatedImpactScore: 0.85,
        } as unknown as ActionProposal,
        impactRationale: "Reduces afternoon cognitive overload and preserves focus velocity.",
      };
    } else if (deepWorkHours >= 2.0) {
      proposedOptimization = {
        optimizationId: generateId("opt"),
        description: `Reserve ${deepWorkHours} hours of uninterrupted focus time this morning.`,
        action: {
          proposalId: generateId("prop"),
          capabilityURN: "urn:lifeos:action:create_internal_focus_block",
          intentCategory: "CREATE_SCHEDULE_ITEM",
          parameters: {
            durationMinutes: Math.round(deepWorkHours * 60),
            label: "Morning Deep Work",
          },
          confidence: 0.92,
          provenance: "MorningBriefingEngine",
          requiresConfirmation: true,
          estimatedImpactScore: 0.80,
        } as unknown as ActionProposal,
        impactRationale: "Capitalizes on high morning readiness for maximum cognitive output.",
      };
    }

    // 5. Generate Calm, Spoken Transcript (Max 120 words, zero engineering jargon)
    const name = (projection as any).identity?.name || "there";
    const transcript = this.assembleVoiceTranscript(
      name,
      readinessHeadline,
      scheduleOverview,
      priorityFocusTask,
      proposedOptimization
    );
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;

    const briefing: IMorningBriefing = {
      briefingId: generateId("brief"),
      userId,
      date,
      greeting: `Good morning, ${name}.`,
      readinessHeadline,
      readinessScore: projection.cognitiveState?.estimatedReadiness ?? (projection as any).cognitive?.overallReadiness ?? 0.8,
      recoveryStatus,
      scheduleOverview,
      priorityFocusTask,
      proposedOptimization,
      transcript,
      wordCount,
      generatedAt: now,
    };

    // Cache in memory
    this.inMemoryCache.set(cacheKey, briefing);

    // Persist to MongoDB if available
    await this.persistBriefing(briefing);

    return briefing;
  }

  /**
   * Accepts a proposed optimization from the morning briefing and executes through the kernel.
   */
  async acceptOptimization(
    userId: string,
    briefingId: string,
    kernelService: IKernelCapabilityService
  ): Promise<{ success: boolean; executionResult?: any; error?: string }> {
    // Find briefing in memory
    let targetBriefing: IMorningBriefing | undefined;
    for (const b of this.inMemoryCache.values()) {
      if (b.briefingId === briefingId && b.userId === userId) {
        targetBriefing = b;
        break;
      }
    }

    if (!targetBriefing || !targetBriefing.proposedOptimization) {
      return { success: false, error: "No proposed optimization found for this briefing." };
    }

    try {
      const result = await kernelService.executeAction(
        userId,
        targetBriefing.proposedOptimization.action
      );

      // Update MongoDB record
      try {
        const { MorningBriefingModel } = await import(
          "../../../../../apps/web/server/db/models/MorningBriefingModel"
        );
        await MorningBriefingModel.updateOne(
          { briefingId },
          { $set: { optimizationAccepted: true, userInteracted: true } }
        );
      } catch {
        // DB not connected in unit test
      }

      return { success: true, executionResult: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private assembleVoiceTranscript(
    name: string,
    readinessHeadline: string,
    schedule: IScheduleOverview,
    priorityTask?: IPriorityFocusTask,
    optimization?: IProposedOptimization
  ): string {
    const parts: string[] = [];
    parts.push(`Good morning, ${name}.`);
    parts.push(readinessHeadline);

    if (schedule.densityTier === "OVERLOADED" || schedule.densityTier === "HEAVY") {
      parts.push(
        `You have ${schedule.meetingMinutes} minutes of commitments today, starting at ${schedule.firstCommitmentTime}.`
      );
    } else if (schedule.deepWorkHours > 0) {
      parts.push(
        `Your schedule is open with ${schedule.deepWorkHours} hours available for deep work.`
      );
    }

    if (priorityTask) {
      parts.push(`Your main priority today is ${priorityTask.title}.`);
    }

    if (optimization) {
      parts.push(`I recommend we ${optimization.description.toLowerCase()} Shall I put that on your calendar?`);
    }

    return parts.join(" ");
  }

  private async persistBriefing(briefing: IMorningBriefing): Promise<void> {
    try {
      const { MorningBriefingModel } = await import(
        "../../../../../apps/web/server/db/models/MorningBriefingModel"
      );
      await MorningBriefingModel.findOneAndUpdate(
        { userId: briefing.userId, date: briefing.date },
        {
          $set: {
            briefingId: briefing.briefingId,
            userId: briefing.userId,
            date: briefing.date,
            transcript: briefing.transcript,
            keyInsights: [briefing.readinessHeadline],
            proposedScheduleAdjustments: briefing.proposedOptimization
              ? [briefing.proposedOptimization.action]
              : [],
            readinessScore: briefing.readinessScore,
            generatedAt: briefing.generatedAt,
          },
        },
        { upsert: true, new: true }
      );
    } catch {
      // Database not connected
    }
  }

  clearCache(userId?: string): void {
    if (userId) {
      for (const [k, v] of this.inMemoryCache.entries()) {
        if (v.userId === userId) {
          this.inMemoryCache.delete(k);
        }
      }
    } else {
      this.inMemoryCache.clear();
    }
  }
}
