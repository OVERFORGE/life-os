/**
 * ContextProjectionSerializer.ts
 * Deterministic serializer transforming ILifeContextProjection into a bounded prompt representation.
 * Enforces the <= 250 token context budget with auditable priority pruning.
 * Part of Phase 1 Canonical Unified World Model & Context Bridge.
 */

import { ILifeContextProjection } from "./contracts/LifeContextProjectionContracts";

export interface SerializationOptions {
  maxCharacterBudget?: number; // 250 tokens ~ 1000 characters
  includeProvenance?: boolean;
}

export interface SerializationResult {
  serializedContext: string;
  estimatedTokens: number;
  prunedSections: string[];
}

export class ContextProjectionSerializer {
  private static readonly DEFAULT_CHAR_BUDGET = 1000; // ~250 tokens

  public static serialize(
    projection: ILifeContextProjection,
    options?: SerializationOptions
  ): SerializationResult {
    const budget = options?.maxCharacterBudget ?? this.DEFAULT_CHAR_BUDGET;
    const prunedSections: string[] = [];

    // Priority 1: Essential Status & Degradation (Never pruned)
    const lines: string[] = [];
    if (projection.degradation.isDegraded) {
      lines.push(
        `[DEGRADED_CONTEXT: ${projection.degradation.degradationReason || "Hydration incomplete"}]`
      );
    }
    if (projection.quietHoursActive) {
      lines.push(`[QUIET_HOURS: ACTIVE]`);
    }
    if (projection.activeContextMode) {
      lines.push(`[CONTEXT_MODE: ${projection.activeContextMode}]`);
    }

    // Priority 2: Cognitive & Physical State
    const cog = projection.cognitiveState;
    const phys = projection.physicalReadiness;
    lines.push(
      `Cognitive: ${cog.state} (Fatigue: ${(cog.estimatedFatigue * 100).toFixed(0)}%, Readiness: ${(cog.estimatedReadiness * 100).toFixed(0)}%)`
    );
    lines.push(
      `Physical: ${phys.recoveryStatus} (Readiness: ${(phys.readinessScore * 100).toFixed(0)}%, Sleep: ${Math.floor(phys.sleepDurationMinutes / 60)}h ${phys.sleepDurationMinutes % 60}m)`
    );

    // Priority 3: Schedule
    const sched = projection.operationalSchedule;
    lines.push(
      `Schedule: ${sched.todayMeetingCount} mtgs (${sched.todayMeetingDurationMinutes}m), ${sched.freeFocusBlocksRemaining} focus blocks left${sched.isScheduleTight ? " [TIGHT]" : ""}`
    );

    // Priority 4: Critical Goal Pressures
    const criticalGoals = projection.goalPressures
      .filter((g) => g.isCritical || g.pressureScore >= 0.7)
      .slice(0, 2);

    if (criticalGoals.length > 0) {
      const goalStr = criticalGoals
        .map((g) => `${g.title}: ${(g.pressureScore * 100).toFixed(0)}%`)
        .join(", ");
      lines.push(`Tensions: ${goalStr}`);
    }

    // Priority 5: Active Interventions
    if (projection.activeInterventions.length > 0) {
      const activeStr = projection.activeInterventions
        .map((i) => i.strategy)
        .join(", ");
      lines.push(`Active Interventions: ${activeStr}`);
    }

    let output = lines.join("\n");

    // Check budget constraint and prune if necessary
    if (output.length > budget) {
      // Prune Priority 5 (Active Interventions)
      prunedSections.push("activeInterventions");
      const filtered = lines.filter((l) => !l.startsWith("Active Interventions:"));
      output = filtered.join("\n");
    }

    if (output.length > budget) {
      // Prune Priority 4 (Tensions)
      prunedSections.push("goalPressures");
      const filtered = lines.filter((l) => !l.startsWith("Tensions:"));
      output = filtered.join("\n");
    }

    const estimatedTokens = Math.ceil(output.length / 4);

    return {
      serializedContext: output,
      estimatedTokens,
      prunedSections,
    };
  }
}
