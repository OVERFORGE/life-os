import { WorldSnapshotV2, ExecutionGraphSummary } from "./WorldSnapshotV2";
import { LifeStateEngine } from "./LifeStateEngine";
import { GoalPressureEngineV2, GoalPressureResult } from "./GoalPressureEngineV2";
import { GoalIntelligenceEngine } from "./GoalIntelligenceEngine";
import { ProjectStateEngine } from "./ProjectStateEngine";
import { RelationshipContextEngine } from "./RelationshipContextEngine";
import { WorldTrendEngine, WorldTrend } from "./WorldTrendEngine";
import { WorldPredictionEngineV2, WorldPrediction } from "./WorldPredictionEngineV2";
import { ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";
import { RepairDiagnostics } from "../kernel/AdaptiveRepairEngine";
import { UserBehavioralProfile } from "../learning/BehaviorProfile";
import { LearningSignal } from "../learning/LearningSignal";
import { Observation } from "../telemetry/Observation";
import { TelemetryQuality } from "../telemetry/TelemetryQuality";
import { IncidentRecord } from "../incidents/IncidentContracts";
import { PersonalMemoryRecord } from "../memory/PersonalMemoryContracts";
import { ContextModeRecord } from "../context/ContextModeContracts";
import { KernelSnapshot } from "./KernelSnapshot";
import { KernelSnapshotBuilder } from "./KernelSnapshotBuilder";

export interface ComputeWorldModelInput {
  userId?: string;
  generationTimestamp?: number;
  quality?: TelemetryQuality;
  observations?: Observation[];
  graphSnapshot?: ExecutionGraphSnapshot | null;
  repairDiagnostics?: RepairDiagnostics | null;
  stabilityScore?: number | null;
  profile?: UserBehavioralProfile | null;
  learningSignals?: LearningSignal[];
  activeIncidents?: IncidentRecord[];
  historicalMemories?: PersonalMemoryRecord[];
  contextMode?: ContextModeRecord | null;
}

/**
 * WorldModelV2 Subsystem (Phase B3 Sovereign World Orchestrator)
 * 
 * SOLE OWNER of orchestrating subsystem engine execution waves and invoking KernelSnapshotBuilder.
 * 
 * ARCHITECTURAL RULES:
 * - READ-ONLY: Never mutates execution graph, memory, or database.
 * - 100% deterministic, explainable, incremental, causal.
 * - Delegates snapshot assembly & deep freezing strictly to KernelSnapshotBuilder.
 */
export class WorldModelV2 {
  private static instance: WorldModelV2;
  private version: number = 1;

  static getInstance(): WorldModelV2 {
    if (!WorldModelV2.instance) {
      WorldModelV2.instance = new WorldModelV2();
    }
    return WorldModelV2.instance;
  }

  computeKernelSnapshot(input: ComputeWorldModelInput): KernelSnapshot {
    const {
      userId = "default",
      generationTimestamp = 1785096398950,
      quality = {
        coverage: 1.0,
        completeness: 0.90,
        freshnessDays: 0,
        consistencyScore: 1.0,
        overallConfidence: 0.95,
        defects: { missingLogsCount: 0, hasSkippedDays: false, isStale: false, isSparse: false },
      },
      observations = [],
      graphSnapshot = null,
      repairDiagnostics = null,
      stabilityScore = 100,
      profile = null,
      learningSignals = [],
      contextMode,
    } = input;

    // Wave 1: LifeStateEngine & Learning
    const lifeStateEngine = LifeStateEngine.getInstance();
    const lifeState = lifeStateEngine.evaluate({
      graphSnapshot,
      repairDiagnostics,
      profile,
      learningSignals,
      observations,
      telemetryQuality: quality,
      stabilityScore,
      contextMode,
    });

    // Wave 2: Goal Intelligence (5-Axis Multi-Dimensional Tension) & WorldTrendEngine
    const goalIntelligence = GoalIntelligenceEngine.getInstance().evaluateGoals({
      graphSnapshot,
      lifeState,
      activeIncidents: input.activeIncidents,
      historicalMemories: input.historicalMemories,
      contextMode,
    });
    const goalPressure = goalIntelligence.length > 0
      ? goalIntelligence
      : GoalPressureEngineV2.getInstance().calculatePressure(graphSnapshot);

    const trendEngine = WorldTrendEngine.getInstance();
    const trends = trendEngine.detectTrends({ profile, graphSnapshot });

    // Wave 3: WorldPredictionEngineV2
    const predictionEngine = WorldPredictionEngineV2.getInstance();
    const predictions = predictionEngine.generatePredictions({
      lifeState,
      goalPressures: goalPressure,
      profile,
      trends,
      generationTimestamp,
    });

    // Execution Graph Summary
    const graphSummary: ExecutionGraphSummary = {
      nodeCount: graphSnapshot?.nodeCount || 0,
      edgeCount: graphSnapshot?.edgeCount || 0,
      readyCount: graphSnapshot?.readyNodes.length || 0,
      blockedCount: graphSnapshot?.blockedNodes.length || 0,
      criticalPathLength: graphSnapshot?.criticalPath.length || 0,
      stabilityScore: stabilityScore ?? 100,
    };

    // Invoke KernelSnapshotBuilder for assembly & deep freezing
    return KernelSnapshotBuilder.build({
      userId,
      generationTimestamp,
      quality,
      observations,
      executionGraphSummary: graphSummary,
      lifeState,
      goalPressure,
      learning: { activeProfile: profile, learnedPatterns: [], emittedSignals: learningSignals },
      trends,
      predictions,
    });
  }

  /**
   * Legacy Backward Compatibility Wrapper
   */
  computeSnapshot(input: ComputeWorldModelInput): WorldSnapshotV2 {
    const kernelSnapshot = this.computeKernelSnapshot(input);
    const legacyGoalPressures = kernelSnapshot.subsystems.goalPressure;
    const legacyTrends = kernelSnapshot.subsystems.trends;
    const legacyPredictions = kernelSnapshot.subsystems.predictions;

    return {
      version: this.version++,
      timestamp: kernelSnapshot.metadata.generationTimestamp,
      lifeState: kernelSnapshot.subsystems.lifeState,
      goalPressures: legacyGoalPressures,
      projectStates: ProjectStateEngine.getInstance().evaluateProjects(input.graphSnapshot),
      relationshipContext: RelationshipContextEngine.getInstance().getRelationshipContext(),
      behavioralProfile: input.profile ?? null,
      learningSignals: input.learningSignals || [],
      executionGraphSummary: kernelSnapshot.executionGraphSummary,
      trends: legacyTrends,
      predictions: legacyPredictions,
      insights: [`User is in [${kernelSnapshot.subsystems.lifeState.state}] state.`],
      suggestions: legacyPredictions.map((p) => p.predictionText),
    };
  }
}
