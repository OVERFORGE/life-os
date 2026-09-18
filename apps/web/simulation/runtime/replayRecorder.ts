/**
 * ReplayRecorder — Subsystem for Collecting Replay Tick Steps
 *
 * Collects ReplayTickStep entries emitted during runtime simulation execution.
 * Step collection is separated from transcript assembly (handled by ReplayTranscriptBuilder).
 */

import { ReplayTickStep } from "../execution/contracts/replayTranscriptContracts";

export class ReplayRecorder {
  private tickSteps: ReplayTickStep[] = [];

  /**
   * Records a single tick step entry.
   */
  public recordStep(step: ReplayTickStep): void {
    this.tickSteps.push(step);
  }

  /**
   * Returns read-only array of all recorded tick steps.
   */
  public getRecordedSteps(): readonly ReplayTickStep[] {
    return this.tickSteps;
  }

  /**
   * Clears recorded steps.
   */
  public clear(): void {
    this.tickSteps = [];
  }
}
