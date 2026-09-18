/**
 * TaskProgressEngine — Multi-Factor Task Progress Math
 *
 * Calculates task progress increment per virtual minute using the multi-factor formula:
 * progressDelta = baseRate * focusFactor * energyFactor * difficultyFactor * skillFactor * (1 - interruptionPenalty) * momentumFactor
 */

import { ActivityDefinitionId } from "../contracts/activityDefinitionRegistry";

export interface TaskProgressInput {
  focus: number;           // 0 to 100
  energy: number;          // 0 to 100
  activityType: ActivityDefinitionId | string;
  difficulty?: number;     // 1 (easy) to 5 (extreme), default 2
  skill?: number;          // 1 (novice) to 5 (expert), default 3
  interruptionsCount?: number;
  executionStreakMins?: number;
}

export class TaskProgressEngine {
  public static calculateMinuteIncrement(input: TaskProgressInput): number {
    if (input.activityType === "BREAK" || input.activityType === "MEAL" || input.activityType === "SLEEP") {
      return 0;
    }

    const baseRate = input.activityType === "DEEP_WORK" ? 1.5 : 0.8;

    const focusFactor = Math.max(0.1, input.focus / 100);
    const energyFactor = Math.max(0.1, input.energy / 100);

    const difficulty = Math.max(1, Math.min(5, input.difficulty ?? 2));
    const difficultyFactor = 1.5 / (difficulty + 0.5);

    const skill = Math.max(1, Math.min(5, input.skill ?? 3));
    const skillFactor = 0.7 + skill * 0.1;

    const interruptions = input.interruptionsCount ?? 0;
    const interruptionPenalty = Math.min(0.5, interruptions * 0.1);

    const streak = input.executionStreakMins ?? 0;
    const momentumFactor = 1.0 + Math.min(0.3, streak * 0.01);

    const progressDelta =
      baseRate *
      focusFactor *
      energyFactor *
      difficultyFactor *
      skillFactor *
      (1 - interruptionPenalty) *
      momentumFactor;

    return Math.max(0.05, Math.min(5.0, progressDelta));
  }
}
