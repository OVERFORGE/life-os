import { WorldSnapshotV2 } from "../../worldv2/WorldSnapshotV2";
import { WorldDTO } from "../dto/WorldDTO";
import { KernelSnapshot } from "../../worldv2/KernelSnapshot";
import { IKernelProjectionMapper } from "../../projections/IKernelProjectionMapper";

export class WorldDTOMapper implements IKernelProjectionMapper<WorldDTO> {
  private static instance: WorldDTOMapper;

  static getInstance(): WorldDTOMapper {
    if (!WorldDTOMapper.instance) {
      WorldDTOMapper.instance = new WorldDTOMapper();
    }
    return WorldDTOMapper.instance;
  }

  project(snapshot: KernelSnapshot): Readonly<WorldDTO> {
    return WorldDTOMapper.fromKernelSnapshot(snapshot);
  }

  /**
   * Pure Projection Mapper: KernelSnapshot ➔ WorldDTO V2
   */
  static fromKernelSnapshot(snapshot: KernelSnapshot): Readonly<WorldDTO> {
    const { lifeState, goalPressure, trends, predictions } = snapshot.subsystems;

    return Object.freeze({
      schemaVersion: 1,
      version: snapshot.metadata.schemaVersion,
      timestamp: snapshot.metadata.generationTimestamp,
      lifeState: {
        state: lifeState.state,
        confidence: lifeState.confidence,
        explanation: lifeState.explanation,
        evidence: lifeState.evidence,
      },
      goalPressures: goalPressure.map((gp) => ({
        goalId: gp.goalId,
        goalTitle: gp.goalTitle,
        pressureScore: gp.pressureScore,
        trend: gp.trend,
        explanation: gp.explanation,
      })),
      projectStates: [],
      relationshipSummaries: [],
      trends: trends.map((t) => ({
        metricName: t.metricName,
        trend: t.trend,
        changeDescription: t.changeDescription,
      })),
      predictions: predictions.map((p) => ({
        type: p.type,
        title: p.title,
        predictionText: p.predictionText,
        confidence: p.confidence,
      })),
      insights: [`User macro life state: [${lifeState.state}].`],
      suggestions: predictions.map((p) => p.predictionText),
    });
  }

  /**
   * Legacy Compatibility Projection
   */
  static toWorldDTO(snapshot: WorldSnapshotV2): WorldDTO {
    return {
      schemaVersion: 1,
      version: snapshot.version,
      timestamp: snapshot.timestamp,
      lifeState: {
        state: snapshot.lifeState.state,
        confidence: snapshot.lifeState.confidence,
        explanation: snapshot.lifeState.explanation,
        evidence: snapshot.lifeState.evidence,
      },
      goalPressures: snapshot.goalPressures.map((gp) => ({
        goalId: gp.goalId,
        goalTitle: gp.goalTitle,
        pressureScore: gp.pressureScore,
        trend: gp.trend,
        explanation: gp.explanation,
      })),
      projectStates: snapshot.projectStates.map((ps) => ({
        projectId: ps.projectId,
        projectTitle: ps.projectTitle,
        status: ps.status,
        completionPercentage: ps.completionPercentage,
        riskLevel: ps.riskLevel,
        dependencyHealth: ps.dependencyHealth,
      })),
      relationshipSummaries: snapshot.relationshipContext.map((rc) => ({
        personName: rc.personName,
        role: rc.role,
        importance: rc.importance,
        interactionFrequency: rc.interactionFrequency,
        executionInfluence: rc.executionInfluence,
        summaryText: rc.summaryText,
      })),
      trends: snapshot.trends.map((t) => ({
        metricName: t.metricName,
        trend: t.trend,
        changeDescription: t.changeDescription,
      })),
      predictions: snapshot.predictions.map((p) => ({
        type: p.type,
        title: p.title,
        predictionText: p.predictionText,
        confidence: p.confidence,
      })),
      insights: snapshot.insights,
      suggestions: snapshot.suggestions,
    };
  }
}
