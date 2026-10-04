/**
 * Autonomy Policy Manager (Phase 8)
 * 
 * Enforces the 6 Autonomy Tiers (L0 - L5) and capability safety policies.
 * 
 * CONSTITUTIONAL INVARIANT:
 * "CONFIDENCE IS EPISTEMIC INFORMATION, NOT EXECUTION AUTHORIZATION.
 * Never implement: confidence >= X -> execute."
 * 
 * Autonomy is determined by:
 * 1. User configured autonomy level
 * 2. Capability safety contract (risk class, reversibility, external side-effects)
 * 3. Operational circuit breaker state
 */

import {
  AutonomyLevel,
  IProactiveCandidate,
  IAutonomyEvaluation,
} from "./contracts/ProactiveContracts";

export interface ICapabilitySafetyContract {
  capabilityURN: string;
  isExternalMutation: boolean;
  isReversible: boolean;
  riskTier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  allowsAutonomousExecution: boolean;
}

export class AutonomyPolicyManager {
  private static instance: AutonomyPolicyManager;
  private circuitBreakers: Map<string, { tripped: boolean; consecutiveFailures: number; lastTrippedAt?: number }> = new Map();

  // Registry of known capability safety metadata
  private capabilityContracts: Map<string, ICapabilitySafetyContract> = new Map([
    // Low risk, reversible internal capabilities eligible for L5 with user opt-in
    [
      "urn:lifeos:action:create_internal_focus_block",
      {
        capabilityURN: "urn:lifeos:action:create_internal_focus_block",
        isExternalMutation: false,
        isReversible: true,
        riskTier: "LOW",
        allowsAutonomousExecution: true,
      },
    ],
    [
      "urn:lifeos:action:stage_task_draft",
      {
        capabilityURN: "urn:lifeos:action:stage_task_draft",
        isExternalMutation: false,
        isReversible: true,
        riskTier: "LOW",
        allowsAutonomousExecution: true,
      },
    ],
    [
      "urn:lifeos:action:cache_refresh",
      {
        capabilityURN: "urn:lifeos:action:cache_refresh",
        isExternalMutation: false,
        isReversible: true,
        riskTier: "LOW",
        allowsAutonomousExecution: true,
      },
    ],
    // External / irreversible capabilities: MUST NEVER be executed at L5 autonomously
    [
      "urn:lifeos:action:delete_calendar_event",
      {
        capabilityURN: "urn:lifeos:action:delete_calendar_event",
        isExternalMutation: true,
        isReversible: false,
        riskTier: "CRITICAL",
        allowsAutonomousExecution: false,
      },
    ],
    [
      "urn:lifeos:action:reschedule_external_calendar",
      {
        capabilityURN: "urn:lifeos:action:reschedule_external_calendar",
        isExternalMutation: true,
        isReversible: true,
        riskTier: "MEDIUM",
        allowsAutonomousExecution: false,
      },
    ],
    [
      "urn:lifeos:action:send_external_communication",
      {
        capabilityURN: "urn:lifeos:action:send_external_communication",
        isExternalMutation: true,
        isReversible: false,
        riskTier: "CRITICAL",
        allowsAutonomousExecution: false,
      },
    ],
  ]);

  static getInstance(): AutonomyPolicyManager {
    if (!AutonomyPolicyManager.instance) {
      AutonomyPolicyManager.instance = new AutonomyPolicyManager();
    }
    return AutonomyPolicyManager.instance;
  }

  /**
   * Evaluates if a proactive candidate can be executed, recommended, or staged.
   */
  evaluateAutonomyEligibility(
    candidate: IProactiveCandidate,
    userSetting: AutonomyLevel = "L1"
  ): IAutonomyEvaluation {
    const userId = candidate.userId;
    const cb = this.getCircuitBreaker(userId);

    // 1. Circuit breaker trip check
    if (cb.tripped) {
      return {
        eligible: false,
        effectiveAutonomyLevel: "L0",
        requiresApproval: true,
        denialReason: "Circuit breaker tripped due to consecutive execution failures or rejections. Down-tiered to L0.",
        circuitBreakerTripped: true,
      };
    }

    // 2. Capability safety lookup
    const urn = (candidate.proposal as any).capabilityURN || (candidate.proposal as any).actionType || "";
    const safety = this.capabilityContracts.get(urn) || {
      capabilityURN: urn,
      isExternalMutation: true, // Default to conservative/safe stance
      isReversible: false,
      riskTier: "HIGH",
      allowsAutonomousExecution: false,
    };

    // 3. Autonomy ceiling comparison
    // User configuration acts as an upper bound ceiling
    const levelOrder: Record<AutonomyLevel, number> = {
      L0: 0,
      L1: 1,
      L2: 2,
      L3: 3,
      L4: 4,
      L5: 5,
    };

    const userCeiling = levelOrder[userSetting] ?? 1;
    const candidateLevel = levelOrder[candidate.autonomyLevel] ?? 1;
    const effectiveLevelNum = Math.min(userCeiling, candidateLevel);

    const numToLevel: AutonomyLevel[] = ["L0", "L1", "L2", "L3", "L4", "L5"];
    let effectiveAutonomyLevel = numToLevel[effectiveLevelNum];

    // 4. Constitutional Safety Guard: External side-effects & Irreversible actions
    // CANNOT execute at L5 under ANY circumstances, even if user setting is L5.
    if (effectiveAutonomyLevel === "L5") {
      if (safety.isExternalMutation || !safety.isReversible || !safety.allowsAutonomousExecution) {
        // Demote to L4 (Execute with Approval)
        effectiveAutonomyLevel = "L4";
      }
    }

    // 5. Determine if human approval is mandatory
    const requiresApproval = effectiveAutonomyLevel !== "L5";

    return {
      eligible: effectiveAutonomyLevel !== "L0",
      effectiveAutonomyLevel,
      requiresApproval,
      circuitBreakerTripped: false,
    };
  }

  /**
   * Registers or updates a capability safety contract.
   */
  registerSafetyContract(contract: ICapabilitySafetyContract): void {
    this.capabilityContracts.set(contract.capabilityURN, contract);
  }

  /**
   * Records execution failure or user rejection.
   * If threshold is reached (e.g. 3 consecutive), trips the circuit breaker to L0.
   */
  recordFailureOrRejection(userId: string): void {
    const cb = this.getCircuitBreaker(userId);
    cb.consecutiveFailures += 1;
    if (cb.consecutiveFailures >= 3) {
      cb.tripped = true;
      cb.lastTrippedAt = Date.now();
    }
  }

  /**
   * Records successful execution or user approval, resetting failure counters.
   */
  recordSuccess(userId: string): void {
    const cb = this.getCircuitBreaker(userId);
    cb.consecutiveFailures = 0;
  }

  /**
   * Manually resets circuit breaker.
   */
  resetCircuitBreaker(userId: string): void {
    this.circuitBreakers.set(userId, {
      tripped: false,
      consecutiveFailures: 0,
    });
  }

  private getCircuitBreaker(userId: string) {
    let cb = this.circuitBreakers.get(userId);
    if (!cb) {
      cb = { tripped: false, consecutiveFailures: 0 };
      this.circuitBreakers.set(userId, cb);
    }
    return cb;
  }
}
