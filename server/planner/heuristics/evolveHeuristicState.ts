import { GovernanceMetrics } from "../types/GovernanceTypes";
import { HeuristicState, StabilizationProfile } from "./HeuristicTypes";

/**
 * Pure, deterministic function to evolve the heuristic state based on recent governance metrics.
 * 
 * Evolution Rules:
 * - "explosive" / "accelerating_oscillation" -> switch to "conservative"
 *    - Increase downstream pressure weight (halt propagation)
 *    - Increase deferral preference (defer rather than repair to break cycles)
 *    - Decrease repair aggressiveness
 * - "decaying_oscillation" / "bounded_oscillation" -> stay or switch to "balanced"
 *    - Moderate weights
 * - "stabilizing" / "unstable" (with low volatility) -> switch to "aggressive"
 *    - Lower deferral preference (try to fit it in)
 *    - High repair aggressiveness
 * 
 * The multipliers decay or grow monotonically based on trajectory state to prevent
 * heuristic oscillation.
 */
export function evolveHeuristicState(
  prevState: HeuristicState,
  metrics: GovernanceMetrics
): HeuristicState {
  const trajectory = metrics.trajectory || "stabilizing";
  
  let nextProfile: StabilizationProfile = prevState.profile;
  let {
    downstreamPressureMultiplier,
    repairAggressivenessMultiplier,
    deferralPreferenceMultiplier,
    stabilizationWeight,
    profileSwitchCount
  } = prevState;

  // 1. Determine next profile based on trajectory
  if (trajectory === "explosive" || trajectory === "accelerating_oscillation" || trajectory === "unstable") {
    // If it's unstable but with low volatility, it might not need conservative, 
    // but safe to fall back to conservative if it's explicitly unstable.
    nextProfile = "conservative";
  } else if (trajectory === "bounded_oscillation" || trajectory === "decaying_oscillation") {
    nextProfile = "balanced";
  } else if (trajectory === "stabilizing") {
    nextProfile = "aggressive";
  }

  // Record switches
  if (nextProfile !== prevState.profile) {
    profileSwitchCount++;
  }

  // 2. Adjust Multipliers Deterministically
  // Apply clamping to ensure multipliers remain within sensible deterministic bounds [0.1, 5.0]
  const clamp = (val: number) => Math.max(0.1, Math.min(5.0, val));

  if (nextProfile === "conservative") {
    // Escalate constraints
    downstreamPressureMultiplier = clamp(downstreamPressureMultiplier + 0.5);
    deferralPreferenceMultiplier = clamp(deferralPreferenceMultiplier + 0.5);
    repairAggressivenessMultiplier = clamp(repairAggressivenessMultiplier - 0.2);
    stabilizationWeight = clamp(stabilizationWeight + 0.5);
  } else if (nextProfile === "aggressive") {
    // Decay constraints (relaxing the system)
    downstreamPressureMultiplier = clamp(downstreamPressureMultiplier - 0.2);
    deferralPreferenceMultiplier = clamp(deferralPreferenceMultiplier - 0.2);
    repairAggressivenessMultiplier = clamp(repairAggressivenessMultiplier + 0.5);
    stabilizationWeight = clamp(stabilizationWeight - 0.2);
  } else {
    // Balanced: slowly regress to 1.0
    const regress = (val: number) => {
      if (val > 1.0) return clamp(val - 0.1);
      if (val < 1.0) return clamp(val + 0.1);
      return val;
    };
    downstreamPressureMultiplier = regress(downstreamPressureMultiplier);
    deferralPreferenceMultiplier = regress(deferralPreferenceMultiplier);
    repairAggressivenessMultiplier = regress(repairAggressivenessMultiplier);
    stabilizationWeight = regress(stabilizationWeight);
  }

  return {
    profile: nextProfile,
    downstreamPressureMultiplier,
    repairAggressivenessMultiplier,
    deferralPreferenceMultiplier,
    stabilizationWeight,
    profileSwitchCount
  };
}
