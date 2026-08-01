import { WorldSnapshotV2, ExecutionGraphSummary } from "./WorldSnapshotV2";
import { LifeStateEngine } from "./LifeStateEngine";
import { GoalPressureEngineV2 } from "./GoalPressureEngineV2";
import { ProjectStateEngine } from "./ProjectStateEngine";
import { RelationshipContextEngine } from "./RelationshipContextEngine";
import { WorldTrendEngine } from "./WorldTrendEngine";
import { WorldPredictionEngineV2 } from "./WorldPredictionEngineV2";
import { ExecutionGraphSnapshot } from "../kernel/ExecutionGraph";
import { RepairDiagnostics } from "../kernel/AdaptiveRepairEngine";
import { UserBehavioralProfile } from "../learning/BehaviorProfile";
import { LearningSignal } from "../learning/LearningSignal";

export interface ComputeWorldModelInput {
  graphSnapshot?: ExecutionGraphSnapshot | null;
  repairDiagnostics?: RepairDiagnostics | null;
  stabilityScore?: number | null;
  profile?: UserBehavioralProfile | null;
  learningSignals?: LearningSignal[];
}

/**
 * WorldModelV2 Subsystem
 * 
 * SOLE OWNER of computing the canonical point-in-time reality of the user's life.
 * 
 * ARCHITECTURAL RULES:
 * - READ-ONLY: Never mutates execution graph, memory, or database.
 * - 100% deterministic, explainable, incremental, causal.
 * - Aggregates LifeState, Goal Pressure, Project State, Relationships, Trends, and Predictions.
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

  computeSnapshot(input: ComputeWorldModelInput): WorldSnapshotV2 {
    const {
      graphSnapshot = null,
      repairDiagnostics = null,
      stabilityScore = 100,
      profile = null,
      learningSignals = [],
    } = input;

    // 1. LifeStateEngine
    const lifeStateEngine = LifeStateEngine.getInstance();
    const lifeState = lifeStateEngine.evaluate({
      graphSnapshot,
      repairDiagnostics,
      profile,
      learningSignals,
      stabilityScore,
    });

    // 2. GoalPressureEngineV2
    const goalPressureEngine = GoalPressureEngineV2.getInstance();
    const goalPressures = goalPressureEngine.calculatePressure(graphSnapshot);

    // 3. ProjectStateEngine
    const projectStateEngine = ProjectStateEngine.getInstance();
    const projectStates = projectStateEngine.evaluateProjects(graphSnapshot);

    // 4. RelationshipContextEngine
    const relationshipEngine = RelationshipContextEngine.getInstance();
    const relationshipContext = relationshipEngine.getRelationshipContext();

    // 5. WorldTrendEngine
    const trendEngine = WorldTrendEngine.getInstance();
    const trends = trendEngine.detectTrends({ profile, graphSnapshot });

    // 6. WorldPredictionEngineV2
    const predictionEngine = WorldPredictionEngineV2.getInstance();
    const predictions = predictionEngine.generatePredictions({
      lifeState,
      goalPressures,
      profile,
      trends,
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

    // Synthesize high-level insights & suggestions
    const insights: string[] = [
      `User is in [${lifeState.state}] state (${lifeState.explanation}).`,
      `Highest pressure goal: ${goalPressures[0]?.goalTitle || "None"} (${goalPressures[0]?.pressureScore || 0}/100).`,
    ];

    const suggestions: string[] = predictions.map((p) => `[Advisory] ${p.title}: ${p.predictionText}`);

    const snapshotV2: WorldSnapshotV2 = {
      version: this.version++,
      timestamp: Date.now(),
      lifeState,
      goalPressures,
      projectStates,
      relationshipContext,
      behavioralProfile: profile,
      learningSignals,
      executionGraphSummary: graphSummary,
      trends,
      predictions,
      insights,
      suggestions,
    };

    console.log(
      `🌍 [WORLD_MODEL_V2] Computed Snapshot v${snapshotV2.version}. LifeState: ${lifeState.state}, Goal Pressures: ${goalPressures.length}, Predictions: ${predictions.length}`
    );

    return snapshotV2;
  }
}
