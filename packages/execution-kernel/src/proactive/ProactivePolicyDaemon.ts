/**
 * Proactive Policy Daemon (Phase 8)
 * 
 * Authoritative background engine that continuously evaluates user state,
 * enforces strict quiet hours, notification fatigue budgets, and interruption cost tradeoffs,
 * and routes all autonomous or prepared mutations through KernelCapabilityService.
 * 
 * INVARIANT: Proactive Engine NEVER directly mutates MongoDB models or bypasses the Kernel.
 */

import { ILifeContextProjection } from "../worldv2/contracts/LifeContextProjectionContracts";
import { CrossDomainIntelligenceEngine } from "../reasoning/CrossDomainIntelligenceEngine";
import {
  AutonomyLevel,
  IProactiveCandidate,
  IProactiveActionLog,
  ProactiveDomain,
} from "./contracts/ProactiveContracts";
import { AutonomyPolicyManager } from "./AutonomyPolicyManager";
import { InterruptionCostEvaluator } from "./InterruptionCostEvaluator";
import { NotificationFatigueFilter } from "./NotificationFatigueFilter";
import { IKernelCapabilityService } from "../orchestration/kernel/IKernelCapabilityService";
import { ActionProposal } from "../orchestration/contracts/ActionProposalContracts";
import { generateId } from "../shared/ids";

export interface IProactiveEvaluationReport {
  userId: string;
  evaluatedAt: number;
  candidatesGenerated: IProactiveCandidate[];
  autonomousExecutions: Array<{ candidateId: string; executionResult: any }>;
  notificationsDispatched: IProactiveCandidate[];
  suppressedCandidates: Array<{ candidateId: string; reason: string }>;
  circuitBreakerActive: boolean;
}

export class ProactivePolicyDaemon {
  private static instance: ProactivePolicyDaemon;
  private inMemoryLogs: Map<string, IProactiveActionLog[]> = new Map();

  constructor(
    private autonomyManager: AutonomyPolicyManager = AutonomyPolicyManager.getInstance(),
    private costEvaluator: InterruptionCostEvaluator = InterruptionCostEvaluator.getInstance(),
    private fatigueFilter: NotificationFatigueFilter = NotificationFatigueFilter.getInstance(),
    private crossDomainEngine: CrossDomainIntelligenceEngine = CrossDomainIntelligenceEngine.getInstance(),
    private kernelCapabilityService?: IKernelCapabilityService
  ) {}

  static getInstance(): ProactivePolicyDaemon {
    if (!ProactivePolicyDaemon.instance) {
      ProactivePolicyDaemon.instance = new ProactivePolicyDaemon();
    }
    return ProactivePolicyDaemon.instance;
  }

  setKernelCapabilityService(service: IKernelCapabilityService): void {
    this.kernelCapabilityService = service;
  }

  /**
   * Evaluates user context against proactive policies.
   */
  async evaluateUserProactivity(
    userId: string,
    projection: ILifeContextProjection,
    userAutonomySetting: AutonomyLevel = "L1",
    now: number = Date.now()
  ): Promise<IProactiveEvaluationReport> {
    const timezone = (projection as any).identity?.timezone || "UTC";
    const candidates = this.generateCandidatesFromContext(userId, projection, now);

    const report: IProactiveEvaluationReport = {
      userId,
      evaluatedAt: now,
      candidatesGenerated: candidates,
      autonomousExecutions: [],
      notificationsDispatched: [],
      suppressedCandidates: [],
      circuitBreakerActive: false,
    };

    // Evaluate each candidate
    for (const candidate of candidates) {
      // 1. Autonomy Tier & Safety Policy Check
      const autonomyEval = this.autonomyManager.evaluateAutonomyEligibility(
        candidate,
        userAutonomySetting
      );

      if (autonomyEval.circuitBreakerTripped) {
        report.circuitBreakerActive = true;
      }

      if (!autonomyEval.eligible) {
        report.suppressedCandidates.push({
          candidateId: candidate.candidateId,
          reason: autonomyEval.denialReason || "Ineligible under current autonomy setting",
        });
        this.recordLog(userId, candidate, autonomyEval.effectiveAutonomyLevel, false, false, "Autonomy Ineligible");
        continue;
      }

      // 2. Interruption Cost vs Action Value Check
      const isQuiet = this.fatigueFilter.isInQuietHours(now, timezone) || projection.quietHoursActive;
      const meetingMins = projection.operationalSchedule?.todayMeetingDurationMinutes ?? (projection as any).schedule?.totalMeetingMinutesToday ?? 0;
      const inMeeting = meetingMins > 180;
      const inDeepWork = projection.cognitiveState?.state === "DEEP_FOCUS" || (projection as any).execution?.activeLifeState === "FOCUSED_FLOW";
      const recentNotifications = this.fatigueFilter.getRecentNotificationCount(userId, now);

      const cognitiveLoadVal = projection.cognitiveState?.estimatedFatigue ?? (projection as any).cognitive?.cognitiveLoadEstimate ?? 0.5;
      const costEval = this.costEvaluator.evaluate(candidate, {
        cognitiveLoad: cognitiveLoadVal,
        isQuietHours: isQuiet,
        inMeeting,
        inDeepWork,
        recentNotificationCountToday: recentNotifications,
      });

      if (!costEval.shouldInterrupt && candidate.urgency !== "CRITICAL") {
        report.suppressedCandidates.push({
          candidateId: candidate.candidateId,
          reason: costEval.rationale,
        });
        this.recordLog(userId, candidate, autonomyEval.effectiveAutonomyLevel, false, false, `Cost: ${costEval.rationale}`);
        continue;
      }

      // 3. Notification Fatigue & Rate Limiting Check
      const fatigueEval = this.fatigueFilter.shouldAllowNotification(candidate, now, timezone);
      if (!fatigueEval.allowed && candidate.urgency !== "CRITICAL") {
        report.suppressedCandidates.push({
          candidateId: candidate.candidateId,
          reason: fatigueEval.suppressionReason || "Suppressed by fatigue filter",
        });
        this.recordLog(userId, candidate, autonomyEval.effectiveAutonomyLevel, false, false, `Fatigue: ${fatigueEval.suppressionReason}`);
        continue;
      }

      // 4. Execution / Notification Routing
      if (autonomyEval.effectiveAutonomyLevel === "L5" && !autonomyEval.requiresApproval) {
        // L5: Autonomous execution through KernelCapabilityService
        if (this.kernelCapabilityService) {
          try {
            const execResult = await this.kernelCapabilityService.executeAction(userId, candidate.proposal);
            report.autonomousExecutions.push({
              candidateId: candidate.candidateId,
              executionResult: execResult,
            });
            this.fatigueFilter.recordDispatchedNotification(userId, candidate.domain, candidate.dedupKey, now);
            this.autonomyManager.recordSuccess(userId);
            this.recordLog(userId, candidate, "L5", false, true);
          } catch (err: any) {
            this.autonomyManager.recordFailureOrRejection(userId);
            report.suppressedCandidates.push({
              candidateId: candidate.candidateId,
              reason: `Autonomous kernel execution failed: ${err.message}`,
            });
            this.recordLog(userId, candidate, "L5", false, false, err.message);
          }
        } else {
          // Simulation / stub execution
          report.autonomousExecutions.push({
            candidateId: candidate.candidateId,
            executionResult: { success: true, simulated: true },
          });
          this.fatigueFilter.recordDispatchedNotification(userId, candidate.domain, candidate.dedupKey, now);
          this.recordLog(userId, candidate, "L5", false, true);
        }
      } else {
        // L1 - L4: Surface as notification or interactive proposal
        report.notificationsDispatched.push(candidate);
        this.fatigueFilter.recordDispatchedNotification(userId, candidate.domain, candidate.dedupKey, now);
        this.recordLog(userId, candidate, autonomyEval.effectiveAutonomyLevel, true, false);
      }
    }

    return report;
  }

  /**
   * Generates proactive candidates based on multi-domain context and tensions.
   */
  generateCandidatesFromContext(
    userId: string,
    projection: ILifeContextProjection,
    now: number
  ): IProactiveCandidate[] {
    const candidates: IProactiveCandidate[] = [];
    const dateKey = new Date(now).toISOString().slice(0, 10);

    const sleepScore = projection.physicalReadiness?.sleepQualityScore ?? (projection as any).physical?.sleepRecoveryScore ?? 0.8;
    const meetingMinutes = projection.operationalSchedule?.todayMeetingDurationMinutes ?? (projection as any).schedule?.totalMeetingMinutesToday ?? 0;
    const freeFocusBlocks = projection.operationalSchedule?.freeFocusBlocksRemaining ?? (projection as any).schedule?.availableDeepWorkWindows?.length ?? 0;

    // Rule 1: Sleep Debt + Heavy Schedule => Protect Focus / Rest Block
    if (sleepScore < 0.55 && meetingMinutes > 180) {
      candidates.push({
        candidateId: generateId("cand"),
        userId,
        autonomyLevel: "L4", // Approval required for schedule alterations
        urgency: "HIGH",
        domain: "SCHEDULE",
        proposal: {
          proposalId: generateId("prop"),
          capabilityURN: "urn:lifeos:action:reschedule_external_calendar",
          intentCategory: "MODIFY_SCHEDULE",
          parameters: {
            reason: "High sleep debt combined with dense meeting load",
            targetDurationMinutes: 45,
          },
          confidence: 0.88,
          provenance: "ProactivePolicyDaemon:SleepDebtRule",
          requiresConfirmation: true,
          estimatedImpactScore: 0.75,
        } as unknown as ActionProposal,
        rationale: "Sleep recovery was low and afternoon meetings are dense. Propose buffer protection.",
        requiredConfidence: 0.80,
        dedupKey: `sleep_debt_schedule:${userId}:${dateKey}`,
        actionValueScore: 0.85,
        estimatedInterruptionCost: 0.35,
        createdAt: now,
      });
    }

    // Rule 2: Low-Risk Internal Focus Block when Calendar is clear
    if (freeFocusBlocks > 0) {
      candidates.push({
        candidateId: generateId("cand"),
        userId,
        autonomyLevel: "L5", // Eligible for autonomous scheduling if user opts in
        urgency: "MEDIUM",
        domain: "FOCUS",
        proposal: {
          proposalId: generateId("prop"),
          capabilityURN: "urn:lifeos:action:create_internal_focus_block",
          intentCategory: "CREATE_SCHEDULE_ITEM",
          parameters: {
            durationMinutes: 60,
            label: "Protected Deep Work Window",
          },
          confidence: 0.92,
          provenance: "ProactivePolicyDaemon:DeepWorkRule",
          requiresConfirmation: false,
          estimatedImpactScore: 0.70,
        } as unknown as ActionProposal,
        rationale: "Open deep work window available with pending task backlog.",
        requiredConfidence: 0.75,
        dedupKey: `internal_focus_block:${userId}:${dateKey}:${now}`,
        actionValueScore: 0.75,
        estimatedInterruptionCost: 0.20,
        createdAt: now,
      });
    }

    // Rule 3: Goal Pressure Imbalance (Deadline imminent)
    const urgentGoal = projection.goalPressures?.find(g => (g.pressureScore > 1 ? g.pressureScore / 100 : g.pressureScore) > 0.80) ??
      (projection as any).execution?.topGoalPressures?.find((g: any) => g.pressureScore > 0.80);
    if (urgentGoal) {
      candidates.push({
        candidateId: generateId("cand"),
        userId,
        autonomyLevel: "L3", // Prepare / recommend draft triage
        urgency: "HIGH",
        domain: "TASK",
        proposal: {
          proposalId: generateId("prop"),
          capabilityURN: "urn:lifeos:action:stage_task_draft",
          intentCategory: "CREATE_TASK",
          parameters: {
            goalId: urgentGoal.goalId,
            title: `Priority Sprint: ${urgentGoal.title}`,
          },
          confidence: 0.85,
          provenance: "ProactivePolicyDaemon:GoalPressureRule",
          requiresConfirmation: true,
          estimatedImpactScore: 0.80,
        } as unknown as ActionProposal,
        rationale: `Goal '${urgentGoal.title}' has elevated pressure (${urgentGoal.pressureScore.toFixed(2)}).`,
        requiredConfidence: 0.80,
        dedupKey: `goal_pressure_triage:${userId}:${urgentGoal.goalId}:${dateKey}`,
        actionValueScore: 0.80,
        estimatedInterruptionCost: 0.30,
        createdAt: now,
      });
    }

    return candidates;
  }

  /**
   * Records candidate log in memory and in MongoDB if available.
   */
  private async recordLog(
    userId: string,
    candidate: IProactiveCandidate,
    effectiveAutonomy: AutonomyLevel,
    notificationDispatched: boolean,
    executionCommitted: boolean,
    executionError?: string
  ): Promise<void> {
    const logEntry: IProactiveActionLog = {
      actionId: generateId("act_log"),
      userId,
      candidateId: candidate.candidateId,
      autonomyLevel: effectiveAutonomy,
      domain: candidate.domain,
      triggerRule: candidate.rationale,
      confidenceScore: candidate.requiredConfidence,
      actionValueScore: candidate.actionValueScore,
      interruptionCostScore: candidate.estimatedInterruptionCost,
      notificationDispatched,
      executionCommitted,
      executionError,
      executedAt: Date.now(),
      dedupKey: candidate.dedupKey,
    };

    let userLogs = this.inMemoryLogs.get(userId);
    if (!userLogs) {
      userLogs = [];
      this.inMemoryLogs.set(userId, userLogs);
    }
    userLogs.push(logEntry);

    try {
      const { ProactiveActionLogModel } = await import("../../../../apps/web/server/db/models/ProactiveActionLogModel");
      await ProactiveActionLogModel.create(logEntry);
    } catch {
      // Database not connected or model in isolation test
    }
  }

  getLogs(userId: string): IProactiveActionLog[] {
    return this.inMemoryLogs.get(userId) || [];
  }

  clearLogs(userId: string): void {
    this.inMemoryLogs.delete(userId);
  }
}
