import { WorldSnapshotV2 } from "../../worldv2/WorldSnapshotV2";
import { ExecutionGraphSnapshot } from "../../kernel/ExecutionGraph";
import { LearningEngineOutput } from "../../learning/LearningEngine";
import { DashboardDTO } from "../dto/DashboardDTO";
import { WorldDTOMapper } from "./WorldDTOMapper";
import { KernelSnapshot } from "../../worldv2/KernelSnapshot";
import { IKernelProjectionMapper } from "../../projections/IKernelProjectionMapper";

export class DashboardDTOMapper implements IKernelProjectionMapper<DashboardDTO> {
  private static instance: DashboardDTOMapper;

  static getInstance(): DashboardDTOMapper {
    if (!DashboardDTOMapper.instance) {
      DashboardDTOMapper.instance = new DashboardDTOMapper();
    }
    return DashboardDTOMapper.instance;
  }

  /**
   * Canonical Implementation of IKernelProjectionMapper
   */
  project(
    snapshot: KernelSnapshot,
    graphSnapshot?: ExecutionGraphSnapshot | null
  ): Readonly<DashboardDTO> {
    return DashboardDTOMapper.fromKernelSnapshot(snapshot, graphSnapshot);
  }

  /**
   * Pure Projection Mapper: KernelSnapshot ➔ DashboardDTO V2
   * Reads strictly from read-only KernelSnapshot. Zero business math or engine queries.
   */
  static fromKernelSnapshot(
    snapshot: KernelSnapshot,
    graphSnapshot?: ExecutionGraphSnapshot | null
  ): Readonly<DashboardDTO> {
    const lifeState = snapshot.subsystems.lifeState;
    const goalPressures = snapshot.subsystems.goalPressure;
    const learningSignals = snapshot.subsystems.learning?.emittedSignals || [];

    const totalGoals = goalPressures.length;
    const highPressureGoals = goalPressures.filter((gp) => gp.pressureScore >= 50);

    // Global load score = mean pressure across all engine-computed goals.
    // Previous formula (readyCount*10 + blockedCount*20) saturated at 100 with just 10 ready nodes.
    // Mean pressure correctly reflects actual goal execution burden from GoalPressureEngineV2.
    const globalLoadScore = goalPressures.length > 0
      ? Math.round(goalPressures.reduce((sum, gp) => sum + gp.pressureScore, 0) / goalPressures.length)
      : 0;

    let mode: "stable" | "underutilized" | "overloaded" = "stable";
    if (globalLoadScore > 65) mode = "overloaded";
    else if (globalLoadScore < 20) mode = "underutilized";

    const nodeTitleMap = new Map((graphSnapshot?.readyNodes || []).concat(graphSnapshot?.criticalPath || []).map((n) => [n.id, n.title]));

    return Object.freeze({
      schemaVersion: 1,
      lifeState: {
        state: lifeState.state,
        confidence: lifeState.confidence,
        explanation: lifeState.explanation,
        evidence: lifeState.evidence,
      },
      goalLoad: {
        totalGoals,
        highPressureGoalsCount: highPressureGoals.length,
        globalLoadScore,
        mode,
      },
      topPressureGoals: goalPressures.slice(0, 5).map((gp) => ({
        goalId: gp.goalId,
        goalTitle: gp.goalTitle,
        pressureScore: gp.pressureScore,
        trend: gp.trend,
        explanation: gp.explanation,
      })),
      executionPressureNodes: (graphSnapshot?.executionPressure || []).slice(0, 5).map((ep) => ({
        nodeId: ep.nodeId,
        title: nodeTitleMap.get(ep.nodeId) || ep.nodeId,
        score: ep.score,
        factors: ep.contributingFactors,
      })),
      activeSignals: learningSignals.map((s) => ({
        type: s.type,
        title: s.title,
        message: s.message,
        confidence: s.confidence,
      })),
      systemInsights: [
        `User is in [${lifeState.state}] state (${lifeState.explanation}).`,
        `Highest pressure goal: ${goalPressures[0]?.goalTitle || "None"} (${goalPressures[0]?.pressureScore || 0}/100).`,
      ],
      timestamp: snapshot.metadata.generationTimestamp,
    });
  }

  /**
   * Legacy Compatibility Projection
   */
  static toDashboardDTO(
    worldSnapshot: WorldSnapshotV2,
    graphSnapshot: ExecutionGraphSnapshot,
    learningOutput: LearningEngineOutput
  ): DashboardDTO {
    const worldDTO = WorldDTOMapper.toWorldDTO(worldSnapshot);

    const totalGoals = worldSnapshot.goalPressures.length;
    const highPressureGoals = worldSnapshot.goalPressures.filter((gp) => gp.pressureScore >= 50);

    // Global load score = mean pressure across all engine-computed goals (same formula as fromKernelSnapshot).
    const globalLoadScore = worldSnapshot.goalPressures.length > 0
      ? Math.round(worldSnapshot.goalPressures.reduce((sum, gp) => sum + gp.pressureScore, 0) / worldSnapshot.goalPressures.length)
      : 0;

    let mode: "stable" | "underutilized" | "overloaded" = "stable";
    if (globalLoadScore > 65) mode = "overloaded";
    else if (globalLoadScore < 20) mode = "underutilized";

    const nodeTitleMap = new Map(graphSnapshot.readyNodes.concat(graphSnapshot.criticalPath).map((n) => [n.id, n.title]));

    return Object.freeze({
      schemaVersion: 1,
      lifeState: worldDTO.lifeState,
      goalLoad: {
        totalGoals,
        highPressureGoalsCount: highPressureGoals.length,
        globalLoadScore,
        mode,
      },
      topPressureGoals: worldDTO.goalPressures.slice(0, 5).map((gp) => ({
        goalId: gp.goalId,
        goalTitle: gp.goalTitle,
        pressureScore: gp.pressureScore,
        trend: (gp.trend === "rising" || gp.trend === "falling" ? gp.trend : "stable") as "rising" | "falling" | "stable",
        explanation: gp.explanation,
      })),
      executionPressureNodes: graphSnapshot.executionPressure.slice(0, 5).map((ep) => ({
        nodeId: ep.nodeId,
        title: nodeTitleMap.get(ep.nodeId) || ep.nodeId,
        score: ep.score,
        factors: ep.contributingFactors,
      })),
      activeSignals: learningOutput.emittedSignals.map((s) => ({
        type: s.type,
        title: s.title,
        message: s.message,
        confidence: s.confidence,
      })),
      systemInsights: worldDTO.insights,
      timestamp: worldSnapshot.timestamp || 1785096398950,
    });
  }
}
