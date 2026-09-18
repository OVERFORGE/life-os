/**
 * DailyTickRecorder — Subsystem for Active Day Tick Step Collection
 *
 * Collects ReplayTickStep objects for the currently active virtual day.
 * Keeps day boundary transition processing O(1) regardless of total simulation length.
 */

import { ReplayTickStep } from "../execution/contracts/replayTranscriptContracts";

export class DailyTickRecorder {
  private activeDaySteps: ReplayTickStep[] = [];

  /**
   * Records a single tick step for the active day.
   */
  public recordStep(step: ReplayTickStep): void {
    this.activeDaySteps.push(step);
  }

  /**
   * Returns read-only array of tick steps recorded for the active day.
   */
  public getRecordedSteps(): readonly ReplayTickStep[] {
    return this.activeDaySteps;
  }

  /**
   * Clears active day tick steps after day transition finalization.
   */
  public clear(): void {
    this.activeDaySteps = [];
  }
}
