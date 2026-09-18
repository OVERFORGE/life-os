/**
 * Context Mode Contracts
 * 
 * Defines first-class Seasons of Life (SprintMode, SanctuaryMode, SabbaticalMode, StandardMode)
 * and their operational multiplier masks across execution velocity, stress tolerance,
 * recovery expectations, and goal tension scoring.
 */

export type ContextModeType =
  | "standard"
  | "sprint"
  | "sanctuary"
  | "sabbatical";

export interface ContextModeConfig {
  targetGoalIds?: string[];               // in sprint mode: specific goals under high-velocity execution
  pausedGoalIds?: string[];               // in sanctuary/sabbatical: goals explicitly frozen
  allowUrgencyElevation: boolean;         // true for sprint, false for sabbatical/sanctuary
  suppressBurnoutAlarms: boolean;         // true for sprint (replaces alarms with sleep circuit-breaker)
  minSleepProtectionHours: number;        // hard physiological floor (e.g. 5.5h)
  velocityExpectationMultiplier: number;  // 1.0 (standard), 1.5 (sprint), 0.0 (sanctuary/sabbatical)
  stressToleranceMultiplier: number;      // 1.0 (standard), 1.4 (sprint eustress), 0.5 (sanctuary gentle)
}

export interface ContextModeRecord {
  id: string;
  userId: string;
  mode: ContextModeType;
  title: string;
  reason: string;
  startedAt: number;
  expiresAt: number | null; // epoch ms or null if indefinite
  isActive: boolean;
  config: ContextModeConfig;
  createdAt: number;
  updatedAt: number;
}

export interface SetContextModeInput {
  userId: string;
  mode: ContextModeType;
  title?: string;
  reason?: string;
  durationDays?: number;
  targetGoalIds?: string[];
  pausedGoalIds?: string[];
  minSleepProtectionHours?: number;
  customConfig?: Partial<ContextModeConfig>;
}

export const DEFAULT_MODE_CONFIGS: Record<ContextModeType, ContextModeConfig> = {
  standard: {
    allowUrgencyElevation: true,
    suppressBurnoutAlarms: false,
    minSleepProtectionHours: 7.0,
    velocityExpectationMultiplier: 1.0,
    stressToleranceMultiplier: 1.0,
  },
  sprint: {
    allowUrgencyElevation: true,
    suppressBurnoutAlarms: true,
    minSleepProtectionHours: 5.5,
    velocityExpectationMultiplier: 1.5,
    stressToleranceMultiplier: 1.4, // 40% higher tolerance for purposeful eustress
  },
  sanctuary: {
    allowUrgencyElevation: false,
    suppressBurnoutAlarms: true, // compassionate presence instead of alarming
    minSleepProtectionHours: 8.0,
    velocityExpectationMultiplier: 0.0, // zero velocity expected; 0 tasks does not trigger Stagnant
    stressToleranceMultiplier: 0.5,     // lower tolerance; protect autonomic nervous system
  },
  sabbatical: {
    allowUrgencyElevation: false,
    suppressBurnoutAlarms: true,
    minSleepProtectionHours: 7.5,
    velocityExpectationMultiplier: 0.0, // zero execution expected; habits frozen without decay
    stressToleranceMultiplier: 1.0,
  },
};
