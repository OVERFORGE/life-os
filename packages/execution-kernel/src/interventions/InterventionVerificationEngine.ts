/**
 * InterventionVerificationEngine.ts
 * Evaluates closed-loop intervention outcomes at T+4h and T+24h.
 * Adapts strategy weights with exponential recency decay (tau = 21 days).
 * Part of Phase 7 Closed-Loop Intervention & Outcome Learning.
 */

import mongoose from "mongoose";
import {
  IInterventionRecord,
  CreateInterventionInput,
  VerificationBatchResult,
  AttributionCategory,
} from "./contracts/InterventionContracts";
import { InterventionRecordModel } from "../server/db/models/InterventionRecordModel";

export type MetricDeltaProvider = (
  userId: string,
  metric: string,
  executedAt: number,
  measuredAt: number,
  interventionId?: string
) => { observedDelta: number; confounders: string[] };


export class InterventionVerificationEngine {
  private static instance: InterventionVerificationEngine;
  private static readonly TAU_HALF_LIFE_MS = 21 * 24 * 60 * 60 * 1000; // 21 Days [POLICY DEFAULT]

  // In-memory cache: interventionId -> IInterventionRecord
  private cache: Map<string, IInterventionRecord> = new Map();

  static getInstance(): InterventionVerificationEngine {
    if (!InterventionVerificationEngine.instance) {
      InterventionVerificationEngine.instance = new InterventionVerificationEngine();
    }
    return InterventionVerificationEngine.instance;
  }

  /**
   * Registers and schedules a new operational intervention with T+4h and T+24h observation windows.
   */
  public async createIntervention(input: CreateInterventionInput): Promise<IInterventionRecord> {
    const executedAt = input.executedAt || Date.now();
    const interventionId = `intv-${input.userId}-${executedAt}-${Math.random().toString(36).substring(2, 7)}`;

    const record: IInterventionRecord = {
      interventionId,
      userId: input.userId,
      triggerType: input.triggerType,
      crossDomainTensionId: input.crossDomainTensionId,
      stateBefore: input.stateBefore,
      proposedAction: input.proposedAction,
      expectedOutcome: input.expectedOutcome,
      executedAt,
      windows: {
        t4h: {
          measurementAt: executedAt + 4 * 60 * 60 * 1000,
        },
        t24h: {
          measurementAt: executedAt + 24 * 60 * 60 * 1000,
        },
      },
      learningImplicationRecorded: false,
    };

    this.cache.set(interventionId, record);

    if (mongoose.connection.readyState === 1) {
      try {
        await InterventionRecordModel.create(record);
      } catch (err) {
        console.warn(`[InterventionVerificationEngine] DB insert error: ${err}`);
      }
    }

    return record;
  }

  /**
   * Evaluates pending intervention windows that have reached their measurement time.
   */
  public async verifyPendingInterventions(
    userId?: string,
    currentTime: number = Date.now(),
    deltaProvider?: MetricDeltaProvider
  ): Promise<VerificationBatchResult> {
    const startTime = performance.now();
    let t4hEvaluatedCount = 0;
    let t24hEvaluatedCount = 0;
    let effectiveCount = 0;
    let ineffectiveCount = 0;
    let adverseCount = 0;

    const recordsToEvaluate: IInterventionRecord[] = [];

    // Gather eligible records from memory
    for (const record of this.cache.values()) {
      if (userId && record.userId !== userId) continue;
      const needsT4 = record.windows.t4h.measurementAt <= currentTime && !record.windows.t4h.evaluatedStatus;
      const needsT24 = record.windows.t24h.measurementAt <= currentTime && !record.windows.t24h.evaluatedStatus;
      if (needsT4 || needsT24) {
        recordsToEvaluate.push(record);
      }
    }

    // Evaluate each record
    for (const record of recordsToEvaluate) {
      // Evaluate T+4h window
      if (record.windows.t4h.measurementAt <= currentTime && !record.windows.t4h.evaluatedStatus) {
        const measured = this.evaluateWindow(
          record,
          record.windows.t4h.measurementAt,
          deltaProvider
        );
        record.windows.t4h = measured;
        t4hEvaluatedCount++;

        if (measured.evaluatedStatus === "EFFECTIVE" || measured.evaluatedStatus === "LIKELY_EFFECTIVE") effectiveCount++;
        else if (measured.evaluatedStatus === "INEFFECTIVE") ineffectiveCount++;
        else if (measured.evaluatedStatus === "ADVERSE") adverseCount++;
      }

      // Evaluate T+24h window
      if (record.windows.t24h.measurementAt <= currentTime && !record.windows.t24h.evaluatedStatus) {
        const measured = this.evaluateWindow(
          record,
          record.windows.t24h.measurementAt,
          deltaProvider
        );
        record.windows.t24h = measured;
        t24hEvaluatedCount++;

        if (measured.evaluatedStatus === "EFFECTIVE" || measured.evaluatedStatus === "LIKELY_EFFECTIVE") effectiveCount++;
        else if (measured.evaluatedStatus === "INEFFECTIVE") ineffectiveCount++;
        else if (measured.evaluatedStatus === "ADVERSE") adverseCount++;
      }

      // Update MongoDB if connected
      if (mongoose.connection.readyState === 1) {
        try {
          await InterventionRecordModel.updateOne(
            { interventionId: record.interventionId },
            { $set: { windows: record.windows, updatedAt: new Date() } }
          );
        } catch (err) {
          // Continue
        }
      }
    }

    const durationMs = Number((performance.now() - startTime).toFixed(2));

    return {
      t4hEvaluatedCount,
      t24hEvaluatedCount,
      effectiveCount,
      ineffectiveCount,
      adverseCount,
      durationMs,
    };
  }

  /**
   * Records qualitative user feedback on an intervention.
   */
  public async recordUserFeedback(
    interventionId: string,
    rating: "THUMBS_UP" | "THUMBS_DOWN" | "NEUTRAL"
  ): Promise<boolean> {
    const record = this.cache.get(interventionId);
    if (record) {
      record.userFeedback = rating;
      if (mongoose.connection.readyState === 1) {
        try {
          await InterventionRecordModel.updateOne({ interventionId }, { $set: { userFeedback: rating } });
        } catch {
          // Continue
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Computes exponential recency-weighted strategy score (half-life tau = 21 days).
   * Weight = sum(exp(-deltaT / tau) * outcomeScore) / sum(exp(-deltaT / tau))
   */
  public calculateStrategyRecencyScore(
    userId: string,
    capabilityURN: string,
    currentTime: number = Date.now()
  ): number {
    const matchingRecords: IInterventionRecord[] = [];
    for (const r of this.cache.values()) {
      if (r.userId === userId && r.proposedAction.capabilityURN === capabilityURN) {
        matchingRecords.push(r);
      }
    }

    if (matchingRecords.length === 0) {
      return 0.50; // Baseline neutral score
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (const r of matchingRecords) {
      const status = r.windows.t24h.evaluatedStatus || r.windows.t4h.evaluatedStatus;
      if (!status) {
        continue; // Skip pending interventions whose outcome has not yet been evaluated
      }

      const deltaT = Math.max(0, currentTime - r.executedAt);
      const weight = Math.exp(-deltaT / InterventionVerificationEngine.TAU_HALF_LIFE_MS);

      let score = 0.50;
      if (status === "EFFECTIVE") score = 1.0;
      else if (status === "LIKELY_EFFECTIVE") score = 0.80;
      else if (status === "UNCERTAIN") score = 0.50;
      else if (status === "INEFFECTIVE") score = 0.20;
      else if (status === "ADVERSE") score = 0.0;

      // User feedback modifier
      if (r.userFeedback === "THUMBS_UP") score = Math.min(1.0, score + 0.15);
      else if (r.userFeedback === "THUMBS_DOWN") score = Math.max(0.0, score - 0.25);

      weightedSum += weight * score;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(3)) : 0.50;
  }

  public getInterventionById(id: string): IInterventionRecord | null {
    return this.cache.get(id) || null;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  private evaluateWindow(
    record: IInterventionRecord,
    measuredAt: number,
    deltaProvider?: MetricDeltaProvider
  ) {
    let observedDelta = record.expectedOutcome.expectedDelta; // Default to expected if simulated
    let confounders: string[] = [];

    if (deltaProvider) {
      const result = deltaProvider(
        record.userId,
        record.expectedOutcome.targetMetric,
        record.executedAt,
        measuredAt,
        record.interventionId
      );
      observedDelta = result.observedDelta;
      confounders = result.confounders;
    }

    const expected = record.expectedOutcome.expectedDelta;
    let evaluatedStatus: AttributionCategory = "UNCERTAIN";
    let confidence = 0.85;

    if (observedDelta >= expected * 0.8) {
      evaluatedStatus = "EFFECTIVE";
      confidence = 0.90;
    } else if (observedDelta > 0) {
      evaluatedStatus = "LIKELY_EFFECTIVE";
      confidence = 0.75;
    } else if (observedDelta === 0) {
      evaluatedStatus = "INEFFECTIVE";
      confidence = 0.80;
    } else if (observedDelta < 0) {
      evaluatedStatus = "ADVERSE";
      confidence = 0.85;
    }

    if (confounders.length > 0) {
      confidence = Math.max(0.30, confidence - 0.25);
      if (confidence < 0.60) {
        evaluatedStatus = "UNCERTAIN";
      }
    }

    return {
      measurementAt: measuredAt,
      observedDelta,
      confoundersDetected: confounders,
      attributionConfidence: Number(confidence.toFixed(2)),
      evaluatedStatus,
      measuredAt,
    };
  }
}
