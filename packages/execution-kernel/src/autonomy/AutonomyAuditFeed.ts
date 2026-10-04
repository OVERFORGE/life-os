/**
 * Autonomy Audit Feed (Phase 15)
 * 
 * Provides real-time visibility into all autonomous decisions made by LifeOS,
 * their rationale, capability URNs, and compensation status.
 */

import { AutonomousActionReverser } from "./AutonomousActionReverser";
import { IAutonomousExecutionRecord } from "./contracts/AutonomyContracts";

export interface IAuditFeedItem {
  executionId: string;
  capabilityURN: string;
  actionTitle: string;
  rationale: string;
  executedAt: number;
  isCompensated: boolean;
  canCompensate: boolean;
}

export class AutonomyAuditFeed {
  private static instance: AutonomyAuditFeed;
  private reverser: AutonomousActionReverser;

  constructor(reverser: AutonomousActionReverser = AutonomousActionReverser.getInstance()) {
    this.reverser = reverser;
  }

  static getInstance(): AutonomyAuditFeed {
    if (!AutonomyAuditFeed.instance) {
      AutonomyAuditFeed.instance = new AutonomyAuditFeed();
    }
    return AutonomyAuditFeed.instance;
  }

  async getFeed(userId: string, limit: number = 20, now: number = Date.now()): Promise<IAuditFeedItem[]> {
    const items: IAuditFeedItem[] = [];
    const retentionWindowMs = 24 * 3600 * 1000;

    // Check in-memory records
    try {
      const mongoose = await import("mongoose");
      if (mongoose.default?.connection?.readyState === 1) {
        const { AutonomousExecutionLedgerModel } = await import(
          "../../../../apps/web/server/db/models/AutonomousExecutionLedgerModel"
        );
        const docs = await AutonomousExecutionLedgerModel.find({ userId })
          .sort({ executedAt: -1 })
          .limit(limit);

        for (const d of docs) {
          const canCompensate = !d.undoneAt && now - d.executedAt <= retentionWindowMs;
          items.push({
            executionId: d.executionId,
            capabilityURN: d.capabilityURN,
            actionTitle: this.formatActionTitle(d.capabilityURN, d.parameters),
            rationale: d.rationale,
            executedAt: d.executedAt,
            isCompensated: Boolean(d.undoneAt),
            canCompensate,
          });
        }
      }

      if (items.length === 0) {
        const memRecords = this.reverser.getRecordsForUser(userId).slice(0, limit);
        for (const r of memRecords) {
          const canCompensate = !r.undoneAt && now - r.executedAt <= retentionWindowMs;
          items.push({
            executionId: r.executionId,
            capabilityURN: r.capabilityURN,
            actionTitle: this.formatActionTitle(r.capabilityURN, r.parameters),
            rationale: r.rationale,
            executedAt: r.executedAt,
            isCompensated: Boolean(r.undoneAt),
            canCompensate,
          });
        }
      }
    } catch {
      // Fallback if DB unavailable
      const memRecords = this.reverser.getRecordsForUser(userId).slice(0, limit);
      for (const r of memRecords) {
        const canCompensate = !r.undoneAt && now - r.executedAt <= retentionWindowMs;
        items.push({
          executionId: r.executionId,
          capabilityURN: r.capabilityURN,
          actionTitle: this.formatActionTitle(r.capabilityURN, r.parameters),
          rationale: r.rationale,
          executedAt: r.executedAt,
          isCompensated: Boolean(r.undoneAt),
          canCompensate,
        });
      }
    }

    return items;
  }

  private formatActionTitle(urn: string, params: Record<string, any>): string {
    if (urn.includes("create_internal_focus_block")) {
      return `Protected Focus Block (${params?.durationMinutes || 60}m)`;
    }
    if (urn.includes("stage_task_draft")) {
      return `Staged Priority Task Draft: ${params?.title || "Task"}`;
    }
    return `Autonomous Action: ${urn}`;
  }
}
