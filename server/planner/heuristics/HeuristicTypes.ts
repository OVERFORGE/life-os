import { SystemTrajectory } from "../types/GovernanceTypes";

export type StabilizationProfile = 
  | "conservative" 
  | "balanced" 
  | "aggressive";

export interface HeuristicState {
  profile: StabilizationProfile;
  
  // Deterministic Multipliers applied to scheduling heuristics
  
  /** Scales the cost of deep dependency propagation (higher = avoid deep downstream disruption) */
  downstreamPressureMultiplier: number;
  
  /** Amplifies the readiness to trigger a repair vs allowing drift */
  repairAggressivenessMultiplier: number;
  
  /** Scales preference for deferring chunks vs repairing them in the same day */
  deferralPreferenceMultiplier: number;
  
  /** Overall amplification for schedule stabilization scoring vs pure throughput */
  stabilizationWeight: number;
  
  /** Counter for how many times the profile has flipped (used for convergence checks) */
  profileSwitchCount: number;
}

export interface HeuristicEvolutionSnapshot {
  logicalTick: number;
  trajectory: SystemTrajectory;
  previousProfile: StabilizationProfile;
  currentProfile: StabilizationProfile;
  state: HeuristicState;
}

export const INITIAL_HEURISTIC_STATE: HeuristicState = {
  profile: "balanced",
  downstreamPressureMultiplier: 1.0,
  repairAggressivenessMultiplier: 1.0,
  deferralPreferenceMultiplier: 1.0,
  stabilizationWeight: 1.0,
  profileSwitchCount: 0
};
