import { LifeStateResult } from "./LifeStateEngine";
import { GoalPressureResult } from "./GoalPressureEngineV2";
import { ProjectStateResult } from "./ProjectStateEngine";
import { RelationshipSummary } from "./RelationshipContextEngine";
import { UserBehavioralProfile } from "../learning/BehaviorProfile";
import { LearningSignal } from "../learning/LearningSignal";
import { WorldTrend } from "./WorldTrendEngine";
import { WorldPrediction } from "./WorldPredictionEngineV2";

export interface ExecutionGraphSummary {
  nodeCount: number;
  edgeCount: number;
  readyCount: number;
  blockedCount: number;
  criticalPathLength: number;
  stabilityScore: number;
}

export interface WorldSnapshotV2 {
  version: number;
  timestamp: number;
  lifeState: LifeStateResult;
  goalPressures: GoalPressureResult[];
  projectStates: ProjectStateResult[];
  relationshipContext: RelationshipSummary[];
  behavioralProfile: UserBehavioralProfile | null;
  learningSignals: LearningSignal[];
  executionGraphSummary: ExecutionGraphSummary;
  trends: WorldTrend[];
  predictions: WorldPrediction[];
  insights: string[];
  suggestions: string[];
}
