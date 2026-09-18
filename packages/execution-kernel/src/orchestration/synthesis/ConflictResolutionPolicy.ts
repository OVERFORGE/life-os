import { AgentDomain } from "../contracts/AgentContracts";
import { ActionProposal } from "../contracts/ActionProposalContracts";
import { generateId } from "../../shared/ids";

export enum PolicyTier {
  TIER_1_SAFETY_AND_RECOVERY = 1,
  TIER_2_HARD_CONSTRAINTS = 2,
  TIER_3_USER_DIRECTIVES = 3,
  TIER_4_WORKLOAD_SUSTAINABILITY = 4,
  TIER_5_GOAL_PROGRESS = 5,
  TIER_6_SOFT_OPTIMIZATIONS = 6,
}

export interface ConflictRecord {
  conflictId: string;
  contendingDomains: AgentDomain[];
  description: string;
  dominantTier: PolicyTier;
  resolutionRationale: string;
  acceptedProposals: ActionProposal[];
  suppressedProposals: ActionProposal[];
}

/**
 * ConflictResolutionPolicy
 * 
 * Enforces the approved 6-tier policy hierarchy for multi-agent synthesis:
 * Tier 1: Safety & Recovery (Health/Wellness deficit)
 * Tier 2: Hard External Constraints & Deadlines
 * Tier 3: Explicit User Directives
 * Tier 4: Workload Sustainability & Mental Bandwidth
 * Tier 5: Goal Progress & Milestones (Productivity focus blocks)
 * Tier 6: Soft Optimizations
 */
export class ConflictResolutionPolicy {
  /**
   * Resolves a detected conflict between recovery needs and productivity workload.
   * Invariant (TC-04): Safety/Recovery (Tier 1) takes strict precedence over Goal Progress (Tier 5).
   */
  resolveRecoveryVsWorkloadConflict(
    recoveryProposals: ActionProposal[],
    workloadProposals: ActionProposal[],
    reason: string
  ): ConflictRecord {
    return {
      conflictId: generateId("cnf"),
      contendingDomains: ["wellness", "productivity"],
      description: `Conflict between recovery requirements (${reason}) and productivity workload proposal.`,
      dominantTier: PolicyTier.TIER_1_SAFETY_AND_RECOVERY,
      resolutionRationale: `Tier 1 (Safety & Recovery) takes precedence over Tier 5 (Goal Progress). Protecting physiological recovery.`,
      acceptedProposals: recoveryProposals,
      suppressedProposals: workloadProposals,
    };
  }
}
