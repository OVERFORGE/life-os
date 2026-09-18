/**
 * Scenarios Module Architecture (Phase 1.1 Foundation)
 */

export interface IScenarioDefinition {
  key: string;
  title: string;
  description: string;
  durationDays: number;
  tags: string[];
}

export const BASELINE_SCENARIO_KEYS = [
  "SCENARIO_WORK_STRESS_7D",
  "SCENARIO_HABIT_BUILDING_30D",
  "SCENARIO_CHAOS_INTERRUPTION_24H",
] as const;
