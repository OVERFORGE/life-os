import { LifeStateResult } from "../../worldv2/LifeStateEngine";
import { GoalPressureResult } from "../../worldv2/GoalPressureEngineV2";
import { LearningEngineOutput } from "../../learning/LearningEngine";
import { WorldTrend } from "../../worldv2/WorldTrendEngine";
import { WorldPrediction } from "../../worldv2/WorldPredictionEngineV2";
import { TelemetryQuality } from "../../telemetry/TelemetryQuality";
import { ExecutionGraphSummary } from "../../worldv2/WorldSnapshotV2";

/**
 * AssistantContextDTO (Phase C6 Baseline)
 *
 * Canonical read-only projection of KernelSnapshot intelligence
 * exposed to the AI Assistant chat layer.
 *
 * CONSTITUTIONAL RULES:
 * - Pure read-only. All fields are directly projected from KernelSnapshot.
 * - Zero computed fields. Zero derived intelligence.
 * - schemaVersion is always 1 for V1 kernel.
 */
export interface AssistantContextDTO {
  schemaVersion: 1;
  snapshotId: string;
  userId: string;
  generationTimestamp: number;
  telemetryQuality: TelemetryQuality;
  lifeState: LifeStateResult;
  goalPressure: GoalPressureResult[];
  learning: LearningEngineOutput;
  trends: WorldTrend[];
  predictions: WorldPrediction[];
  executionGraphSummary: ExecutionGraphSummary;
  diagnosticsSealed: boolean;
}
