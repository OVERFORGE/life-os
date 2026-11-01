/**
 * ContextProjectionSerializer.ts
 *
 * Deterministic serializer transforming ILifeContextProjection into bounded prompt representations.
 * Implements:
 * 1. Dual Context Selection Architecture:
 *    - Baseline neutral summary (~150 tokens) for Semantic Intent Interpretation.
 *    - Intent-tailored selected context (~350 tokens) for Workflow Planning and Grounded Generation.
 * 2. Unbreakable Invariant: [DEGRADED_CONTEXT: ...] markers are NEVER pruned under any budget constraint.
 * 3. Honest UNKNOWN / null handling for unobserved metrics.
 *
 * Part of Phase B1 Canonical Personal World Model (WP3).
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

export type IntentRelevanceDomain = "SCHEDULE" | "HEALTH" | "TASKS" | "GENERAL";

export class ContextProjectionSerializer {
  public static readonly BASELINE_CHAR_BUDGET = 600; // ~150 tokens
  public static readonly TAILORED_CHAR_BUDGET = 1400; // ~350 tokens
  public static readonly DEFAULT_CHAR_BUDGET = 1000; // ~250 tokens

  /**
   * Baseline serialization (~150 tokens) for initial intent interpretation.
   */
  public static serializeBaselineSummary(
    projection: ILifeContextProjection,
    options?: SerializationOptions
  ): SerializationResult {
    const budget = options?.maxCharacterBudget ?? this.BASELINE_CHAR_BUDGET;
    return this.serializeInternal(projection, budget, "GENERAL");
  }

  /**
   * Intent-tailored context selection (~350 tokens) for planning and response grounding.
   */
  public static selectContext(
    projection: ILifeContextProjection,
    domainOrIntent?: string | IntentRelevanceDomain,
    budget: number = this.TAILORED_CHAR_BUDGET
  ): SerializationResult {
    let targetDomain: IntentRelevanceDomain = "GENERAL";

    if (domainOrIntent) {
      const lower = domainOrIntent.toLowerCase();
      if (lower.includes("sched") || lower.includes("calendar") || lower.includes("meeting") || lower.includes("time")) {
        targetDomain = "SCHEDULE";
      } else if (lower.includes("health") || lower.includes("sleep") || lower.includes("workout") || lower.includes("fatigue") || lower.includes("meal")) {
        targetDomain = "HEALTH";
      } else if (lower.includes("task") || lower.includes("goal") || lower.includes("project") || lower.includes("work")) {
        targetDomain = "TASKS";
      }
    }

    return this.serializeInternal(projection, budget, targetDomain);
  }

  /**
   * Legacy / default serialization adhering to standard budget.
   */
  public static serialize(
    projection: ILifeContextProjection,
    options?: SerializationOptions
  ): SerializationResult {
    const budget = options?.maxCharacterBudget ?? this.DEFAULT_CHAR_BUDGET;
    return this.serializeInternal(projection, budget, "GENERAL");
  }

  private static serializeInternal(
    projection: ILifeContextProjection,
    budget: number,
    targetDomain: IntentRelevanceDomain
  ): SerializationResult {
    const prunedSections: string[] = [];

    // MANDATORY SECTION: Degradation & System Status (NEVER PRUNED UNDER ANY CIRCUMSTANCES)
    const mandatoryLines: string[] = [];
    if (projection.degradation.isDegraded) {
      const reason = projection.degradation.degradationReason || "Hydration incomplete";
      const missing = projection.degradation.missingFields.length > 0
        ? ` (Missing: ${projection.degradation.missingFields.join(", ")})`
        : "";
      mandatoryLines.push(`[DEGRADED_CONTEXT: ${reason}${missing}]`);
    }
    if (projection.quietHoursActive) {
      mandatoryLines.push(`[QUIET_HOURS: ACTIVE]`);
    }
    if (projection.activeContextMode) {
      mandatoryLines.push(`[CONTEXT_MODE: ${projection.activeContextMode}]`);
    }

    // SECTION 1: Cognitive State
    const cog = projection.cognitiveState;
    let cogStr = `Cognitive: ${cog.state}`;
    if (cog.state === "UNKNOWN" || cog.estimatedFatigue === null || cog.estimatedReadiness === null) {
      cogStr += " [UNOBSERVED]";
    } else {
      cogStr += ` (Fatigue: ${(cog.estimatedFatigue * 100).toFixed(0)}%, Readiness: ${(cog.estimatedReadiness * 100).toFixed(0)}%)`;
      if (targetDomain === "HEALTH" && cog.primaryDrivers && cog.primaryDrivers.length > 0) {
        cogStr += ` [Drivers: ${cog.primaryDrivers.slice(0, 3).join(", ")}]`;
      }
    }

    // SECTION 2: Physical State
    const phys = projection.physicalReadiness;
    let physStr = `Physical: ${phys.recoveryStatus}`;
    if (phys.sleepDurationMinutes === null && phys.readinessScore === null) {
      physStr += " [UNOBSERVED]";
    } else {
      const parts: string[] = [];
      if (phys.readinessScore !== null) {
        parts.push(`Readiness: ${(phys.readinessScore * 100).toFixed(0)}%`);
      }
      if (phys.sleepDurationMinutes !== null) {
        parts.push(`Sleep: ${Math.floor(phys.sleepDurationMinutes / 60)}h ${phys.sleepDurationMinutes % 60}m`);
      }
      if (parts.length > 0) {
        physStr += ` (${parts.join(", ")})`;
      }
    }

    // SECTION 3: Operational Schedule
    const sched = projection.operationalSchedule;
    let schedStr = "";
    if (sched.calendarState === "FREE" && sched.hardCommitmentCount === 0) {
      schedStr = `Schedule: FREE (0 commitments, ${sched.freeFocusBlocksRemaining} focus blocks left)`;
    } else {
      schedStr = `Schedule: ${sched.todayMeetingCount} mtgs (${sched.todayMeetingDurationMinutes}m), ${sched.freeFocusBlocksRemaining} focus blocks left`;
      if (sched.isScheduleTight) schedStr += " [TIGHT]";
      if (sched.inProgressCommitmentTitle) {
        schedStr += ` [Now: ${sched.inProgressCommitmentTitle}]`;
      }
      if (sched.nextCommitmentTime && sched.nextCommitmentTitle) {
        schedStr += ` [Next: ${sched.nextCommitmentTitle} @ ${sched.nextCommitmentTime}]`;
      } else if (sched.nextCommitmentTime) {
        schedStr += ` [Next: ${sched.nextCommitmentTime}]`;
      }
    }

    // SECTION 4: Goal Tensions
    const criticalGoals = (projection.goalPressures || [])
      .filter((g) => g.isCritical || g.pressureScore >= 0.7)
      .slice(0, targetDomain === "TASKS" ? 4 : 2);

    let goalStr: string | null = null;
    if (criticalGoals.length > 0) {
      goalStr = `Tensions: ${criticalGoals.map((g) => `${g.title}: ${(g.pressureScore * 100).toFixed(0)}%`).join(", ")}`;
    }

    // SECTION 5: Active Interventions
    let activeInterventionStr: string | null = null;
    if (projection.activeInterventions && projection.activeInterventions.length > 0) {
      activeInterventionStr = `Active Interventions: ${projection.activeInterventions.map((i) => i.strategy).join(", ")}`;
    }

    // SECTION 6: Behavioral Profile
    let behavStr: string | null = null;
    if (projection.behavioralProfile) {
      const bp = projection.behavioralProfile;
      const parts: string[] = [];
      if (bp.taskCompletionRate !== null) {
        parts.push(`Completion ${(bp.taskCompletionRate * 100).toFixed(0)}%`);
      }
      if (bp.procrastinationTendency !== null) {
        parts.push(`Procrastination ${(bp.procrastinationTendency * 100).toFixed(0)}%`);
      }
      if (bp.deepWorkConsistency !== undefined && bp.deepWorkConsistency > 0) {
        parts.push(`Deep Work ${(bp.deepWorkConsistency * 100).toFixed(0)}%`);
      }
      if (parts.length > 0) {
        behavStr = `Behavioral: ${parts.join(", ")} [CONFIDENCE: ${bp.confidenceTier}]`;
      }
    }

    // Priority ordering based on domain relevance
    // Invariant: Mandatory lines are ALWAYS kept
    let discretionarySections: Array<{ name: string; text: string; priority: number }> = [];

    if (targetDomain === "SCHEDULE") {
      discretionarySections = [
        { name: "schedule", text: schedStr, priority: 1 },
        { name: "cognitive", text: cogStr, priority: 2 },
        { name: "physical", text: physStr, priority: 3 },
        ...(behavStr ? [{ name: "behavioral", text: behavStr, priority: 4 }] : []),
        ...(goalStr ? [{ name: "goalPressures", text: goalStr, priority: 5 }] : []),
        ...(activeInterventionStr ? [{ name: "activeInterventions", text: activeInterventionStr, priority: 6 }] : []),
      ];
    } else if (targetDomain === "HEALTH") {
      discretionarySections = [
        { name: "physical", text: physStr, priority: 1 },
        { name: "cognitive", text: cogStr, priority: 2 },
        { name: "schedule", text: schedStr, priority: 3 },
        ...(behavStr ? [{ name: "behavioral", text: behavStr, priority: 4 }] : []),
        ...(activeInterventionStr ? [{ name: "activeInterventions", text: activeInterventionStr, priority: 5 }] : []),
        ...(goalStr ? [{ name: "goalPressures", text: goalStr, priority: 6 }] : []),
      ];
    } else if (targetDomain === "TASKS") {
      discretionarySections = [
        ...(goalStr ? [{ name: "goalPressures", text: goalStr, priority: 1 }] : []),
        ...(behavStr ? [{ name: "behavioral", text: behavStr, priority: 2 }] : []),
        { name: "schedule", text: schedStr, priority: 3 },
        { name: "cognitive", text: cogStr, priority: 4 },
        { name: "physical", text: physStr, priority: 5 },
        ...(activeInterventionStr ? [{ name: "activeInterventions", text: activeInterventionStr, priority: 6 }] : []),
      ];
    } else {
      // GENERAL
      discretionarySections = [
        { name: "cognitive", text: cogStr, priority: 1 },
        { name: "physical", text: physStr, priority: 2 },
        { name: "schedule", text: schedStr, priority: 3 },
        ...(behavStr ? [{ name: "behavioral", text: behavStr, priority: 4 }] : []),
        ...(goalStr ? [{ name: "goalPressures", text: goalStr, priority: 5 }] : []),
        ...(activeInterventionStr ? [{ name: "activeInterventions", text: activeInterventionStr, priority: 6 }] : []),
      ];
    }

    // Assemble text respecting budget
    // Sort discretionary by priority (ascending: 1 = most important)
    discretionarySections.sort((a, b) => a.priority - b.priority);

    const includedLines = [...mandatoryLines];
    for (const sec of discretionarySections) {
      const candidateLines = [...includedLines, sec.text];
      const candidateOutput = candidateLines.join("\n");
      if (candidateOutput.length <= budget || includedLines.length === mandatoryLines.length) {
        includedLines.push(sec.text);
      } else {
        prunedSections.push(sec.name);
      }
    }

    const finalOutput = includedLines.join("\n");
    const estimatedTokens = Math.ceil(finalOutput.length / 4);

    return {
      serializedContext: finalOutput,
      estimatedTokens,
      prunedSections,
    };
  }
}
