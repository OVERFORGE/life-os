/**
 * MicroCheckinTrigger.ts
 * Generates targeted, non-intrusive 1-tap confirmation prompts when cognitive confidence is < 0.70.
 * Enforces Constitutional Budget: Max <= 1 micro-checkin per user per 24 hours.
 * Part of Phase 3 Passive Cognitive & Mental State Estimation.
 */

import { CognitiveStateEstimate, MicroCheckinEvaluationResult } from "../contracts/CognitiveStateContracts";

export class MicroCheckinTrigger {
  private static instance: MicroCheckinTrigger;
  private static readonly RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours [POLICY DEFAULT]

  // Track last triggered checkin timestamp per user to enforce rate limit
  private userLastTriggeredMap: Map<string, number> = new Map();

  static getInstance(): MicroCheckinTrigger {
    if (!MicroCheckinTrigger.instance) {
      MicroCheckinTrigger.instance = new MicroCheckinTrigger();
    }
    return MicroCheckinTrigger.instance;
  }

  /**
   * Evaluates if a micro-checkin should be triggered based on cognitive estimate and rate limit.
   */
  public evaluate(estimate: CognitiveStateEstimate, forceCheck: boolean = false): MicroCheckinEvaluationResult {
    const { userId, timestamp, requiresMicroCheckin, energy, stress } = estimate;

    if (!requiresMicroCheckin && !forceCheck) {
      return { shouldTrigger: false, reason: "Confidence is sufficient (>= 0.70)" };
    }

    const lastTriggered = this.userLastTriggeredMap.get(userId) || 0;
    const timeSinceLastTrigger = timestamp - lastTriggered;

    // Enforce rate limit: max 1 per 24h
    if (!forceCheck && timeSinceLastTrigger < MicroCheckinTrigger.RATE_LIMIT_WINDOW_MS) {
      return {
        shouldTrigger: false,
        reason: `Rate limit enforced: last checkin was ${Math.round(timeSinceLastTrigger / 3600000)}h ago (budget: 1 per 24h)`,
      };
    }

    // Determine targeted 1-tap options based on lowest-confidence or highest-risk dimension
    let prompt = "How is your focus and energy feeling today?";
    let options = [
      { label: "High Energy", value: 0.85 },
      { label: "Moderate", value: 0.55 },
      { label: "Fatigued", value: 0.25 },
    ];

    if (energy.estimate < 0.45) {
      prompt = "Aven noticed potential fatigue based on limited recent data. How is your energy?";
      options = [
        { label: "Actually Good", value: 0.75 },
        { label: "A Bit Tired", value: 0.40 },
        { label: "Drained", value: 0.15 },
      ];
    } else if (stress.estimate > 0.65) {
      prompt = "Your schedule has high density today. How is your stress level?";
      options = [
        { label: "Under Control", value: 0.35 },
        { label: "Manageable", value: 0.60 },
        { label: "Overwhelmed", value: 0.85 },
      ];
    }

    // Record trigger timestamp
    this.userLastTriggeredMap.set(userId, timestamp);

    return {
      shouldTrigger: true,
      reason: "Confidence below 0.70 and within 24h notification budget",
      prompt,
      options,
    };
  }

  /**
   * Resets rate-limit history for a user (useful for test resets).
   */
  public resetHistory(userId?: string): void {
    if (userId) {
      this.userLastTriggeredMap.delete(userId);
    } else {
      this.userLastTriggeredMap.clear();
    }
  }
}
