/**
 * ProactiveActionJournal.ts
 * 
 * Milestone B — Phase B4: Work Package 2 / Loop 4
 * Durable Journal for Proactive Autonomous Actions & Lifecycle Tracking
 */

import { ProactiveActionLogModel, IProactiveActionLogDoc } from "../../../../apps/web/server/db/models/ProactiveActionLogModel";
import { AutonomyLevel, ProactiveDomain } from "./contracts/ProactiveContracts";

export interface ProactiveActionDraft {
  actionId: string;
  userId: string;
  candidateId: string;
  autonomyLevel: AutonomyLevel;
  domain: ProactiveDomain;
  triggerRule: string;
  confidenceScore: number;
  actionValueScore: number;
  interruptionCostScore: number;
  dedupKey: string;
  notificationDispatched?: boolean;
  executedAt?: number;
}

export interface ProactiveActionJournalDependencies {
  model?: any;
}

export class ProactiveActionJournal {
  private model: any;

  constructor(deps?: ProactiveActionJournalDependencies) {
    this.model = deps?.model || ProactiveActionLogModel;
  }

  /**
   * Record a new proactive candidate action in the journal.
   */
  public async recordCandidate(draft: ProactiveActionDraft): Promise<any> {
    const doc = {
      actionId: draft.actionId,
      userId: draft.userId,
      candidateId: draft.candidateId,
      autonomyLevel: draft.autonomyLevel,
      domain: draft.domain,
      triggerRule: draft.triggerRule,
      confidenceScore: Math.min(1.0, Math.max(0.0, draft.confidenceScore)),
      actionValueScore: Math.min(1.0, Math.max(0.0, draft.actionValueScore)),
      interruptionCostScore: Math.min(1.0, Math.max(0.0, draft.interruptionCostScore)),
      dedupKey: draft.dedupKey,
      notificationDispatched: !!draft.notificationDispatched,
      executionCommitted: false,
      executedAt: draft.executedAt || Date.now(),
    };

    const created = await this.model.create(doc);
    return Array.isArray(created) ? created[0] : created;
  }

  /**
   * Check if an action with this dedupKey was already recorded within the cooldown window.
   */
  public async isDuplicate(dedupKey: string, cooldownWindowMs: number): Promise<boolean> {
    const thresholdTime = Date.now() - cooldownWindowMs;
    const existing = await this.model.findOne({
      dedupKey,
      executedAt: { $gte: thresholdTime },
    });
    return !!existing;
  }

  /**
   * Mark the action as dispatched to user surfaces.
   */
  public async markDispatched(actionId: string): Promise<boolean> {
    const res = await this.model.updateOne(
      { actionId },
      { $set: { notificationDispatched: true } }
    );
    return (res.modifiedCount || res.matchedCount || 0) > 0;
  }

  /**
   * Record the execution outcome of an autonomous action.
   */
  public async recordExecutionOutcome(
    actionId: string,
    outcome: { committed: boolean; error?: string }
  ): Promise<boolean> {
    const update: Record<string, any> = {
      executionCommitted: outcome.committed,
    };
    if (outcome.error) {
      update.executionError = outcome.error;
    }
    const res = await this.model.updateOne({ actionId }, { $set: update });
    return (res.modifiedCount || res.matchedCount || 0) > 0;
  }

  /**
   * Record user feedback / response to a proactive intervention.
   */
  public async recordUserFeedback(
    actionId: string,
    response: "APPROVED" | "REJECTED" | "DISMISSED" | "IGNORED"
  ): Promise<boolean> {
    const res = await this.model.updateOne(
      { actionId },
      { $set: { userResponse: response } }
    );
    return (res.modifiedCount || res.matchedCount || 0) > 0;
  }

  /**
   * Retrieve recent actions for audit and verification.
   */
  public async getRecentActions(userId: string, limit: number = 20): Promise<any[]> {
    return this.model
      .find({ userId })
      .limit(limit);
  }
}

