/**
 * DailySummaryRecorder — Subsystem for Collecting Completed Daily Summaries
 *
 * Strictly a collector for DailySummary objects emitted during runtime simulation execution.
 * Does NOT perform archiving, reporting, or analytics logic.
 */

import { DailySummary } from "./contracts/dailyLifecycleContracts";

export class DailySummaryRecorder {
  private summaries: DailySummary[] = [];

  /**
   * Records a single completed DailySummary object.
   */
  public recordSummary(summary: DailySummary): void {
    this.summaries.push(summary);
  }

  /**
   * Returns read-only array of all collected DailySummary objects.
   */
  public getSummaries(): readonly DailySummary[] {
    return this.summaries;
  }

  /**
   * Clears recorded summaries.
   */
  public clear(): void {
    this.summaries = [];
  }
}
