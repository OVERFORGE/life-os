import { KernelSnapshot } from "../../worldv2/KernelSnapshot";
import { InsightDTO } from "../dto/InsightDTO";
import { IKernelProjectionMapper } from "../../projections/IKernelProjectionMapper";

/**
 * InsightDTOMapper Projection Mapper (Phase C4 Baseline)
 * 
 * SOLE CONSTITUTIONAL PROJECTION LAYER for Insight DTOs.
 * Implements IKernelProjectionMapper<InsightDTO[]> for pure, read-only transformations.
 * 
 * CONSTITUTIONAL RULES:
 * - Reads ONLY from KernelSnapshot (learning signals, trends, predictions, life state).
 * - NEVER generates new insights, derives confidence, ranks, or filters insights.
 * - Deeply freezes returned DTO array.
 */
export class InsightDTOMapper implements IKernelProjectionMapper<InsightDTO[]> {
  private static instance: InsightDTOMapper;

  static getInstance(): InsightDTOMapper {
    if (!InsightDTOMapper.instance) {
      InsightDTOMapper.instance = new InsightDTOMapper();
    }
    return InsightDTOMapper.instance;
  }

  /**
   * Canonical Implementation of IKernelProjectionMapper
   */
  project(snapshot: KernelSnapshot): Readonly<InsightDTO[]> {
    return InsightDTOMapper.fromKernelSnapshot(snapshot);
  }

  /**
   * Pure Projection Mapper: KernelSnapshot ➔ InsightDTO[]
   */
  static fromKernelSnapshot(snapshot: KernelSnapshot): Readonly<InsightDTO[]> {
    const { lifeState, learning, trends, predictions } = snapshot.subsystems;
    const insightDTOs: InsightDTO[] = [];

    // 1. LifeState Explanation Insight
    if (lifeState) {
      insightDTOs.push(
        Object.freeze({
          schemaVersion: 1,
          id: `insight-lifestate-${snapshot.metadata.generationTimestamp}`,
          type: "state_insight",
          title: `Macro Life State: ${lifeState.state}`,
          message: lifeState.explanation,
          confidence: lifeState.confidence,
          evidence: lifeState.evidence,
          category: "Physiology & Execution",
        })
      );
    }

    // 2. Learning Signals Projection
    if (learning?.emittedSignals) {
      learning.emittedSignals.forEach((signal, idx) => {
        insightDTOs.push(
          Object.freeze({
            schemaVersion: 1,
            id: `insight-signal-${idx}-${snapshot.metadata.generationTimestamp}`,
            type: "learning_signal",
            title: signal.title,
            message: signal.message,
            confidence: signal.confidence,
            category: signal.type,
          })
        );
      });
    }

    // 3. Trends Projection
    if (trends) {
      trends.forEach((t, idx) => {
        insightDTOs.push(
          Object.freeze({
            schemaVersion: 1,
            id: `insight-trend-${idx}-${snapshot.metadata.generationTimestamp}`,
            type: "trend_insight",
            title: `Trend: ${t.metricName} (${t.trend})`,
            message: t.changeDescription,
            confidence: t.confidence,
            category: "Trend Metric",
          })
        );
      });
    }

    // 4. Predictions Projection
    if (predictions) {
      predictions.forEach((p, idx) => {
        insightDTOs.push(
          Object.freeze({
            schemaVersion: 1,
            id: `insight-prediction-${idx}-${snapshot.metadata.generationTimestamp}`,
            type: "prediction_insight",
            title: p.title,
            message: p.predictionText,
            confidence: p.confidence,
            evidence: p.evidence,
            category: p.type,
          })
        );
      });
    }

    return Object.freeze(insightDTOs);
  }
}
