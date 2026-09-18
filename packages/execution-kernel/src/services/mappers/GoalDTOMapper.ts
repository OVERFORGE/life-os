import { GoalPressureResult } from "../../worldv2/GoalPressureEngineV2";
import { GoalPressureDTO, GoalDTO } from "../dto/GoalDTO";
import { KernelSnapshot } from "../../worldv2/KernelSnapshot";
import { IKernelProjectionMapper } from "../../projections/IKernelProjectionMapper";

import mongoose from "mongoose";

/**
 * GoalDTOMapper Projection Mapper (Phase C2 Constitutional Compliance)
 * 
 * SOLE CONSTITUTIONAL PROJECTION LAYER for Goal DTOs.
 * Implements IKernelProjectionMapper<GoalDTO[]> for pure, read-only transformations.
 */
export class GoalDTOMapper implements IKernelProjectionMapper<GoalDTO[]> {
  private static instance: GoalDTOMapper;

  static getInstance(): GoalDTOMapper {
    if (!GoalDTOMapper.instance) {
      GoalDTOMapper.instance = new GoalDTOMapper();
    }
    return GoalDTOMapper.instance;
  }

  /**
   * Canonical Implementation of IKernelProjectionMapper
   */
  project(snapshot: KernelSnapshot): Readonly<GoalDTO[]> {
    return GoalDTOMapper.fromKernelSnapshot(snapshot);
  }

  async projectAsync(snapshot: KernelSnapshot): Promise<Readonly<GoalDTO[]>> {
    const goalPressures = snapshot.subsystems.goalPressure || [];

    const ORPHAN_TITLE_PATTERN = /^Goal [a-f0-9]{24}$/i;
    const validGoalPressures = goalPressures.filter(
      (gp) => gp.goalTitle && !ORPHAN_TITLE_PATTERN.test(gp.goalTitle.trim())
    );

    const goalIds = validGoalPressures.map((gp) => gp.goalId);
    let statMap = new Map<string, any>();
    try {
      const GoalStatsModel = mongoose.models.GoalStats;
      if (GoalStatsModel) {
        const stats = await GoalStatsModel.find({ goalId: { $in: goalIds } }).lean();
        statMap = new Map(stats.map((s: any) => [String(s.goalId), s]));
      }
    } catch (e) {
      // fallback
    }

    const goalDTOs: GoalDTO[] = validGoalPressures.map((gp) => {
      const pressureDTO: GoalPressureDTO = Object.freeze({
        goalId: gp.goalId,
        goalTitle: gp.goalTitle,
        pressureScore: gp.pressureScore,
        trend: gp.trend,
        factors: gp.factors,
        explanation: gp.explanation,
      });

      const stat = statMap.get(gp.goalId);

      return Object.freeze({
        schemaVersion: 1,
        id: gp.goalId,
        title: gp.goalTitle,
        category: "General",
        pressure: pressureDTO,
        progressPercentage: stat?.currentScore ?? 0,
        status: stat?.state || "on_track",
      });
    });

    return Object.freeze(goalDTOs);
  }

  /**
   * Pure Projection Mapper: KernelSnapshot ➔ GoalDTO[]
   */
  static fromKernelSnapshot(snapshot: KernelSnapshot): Readonly<GoalDTO[]> {
    const goalPressures = snapshot.subsystems.goalPressure || [];

    const ORPHAN_TITLE_PATTERN = /^Goal [a-f0-9]{24}$/i;
    const validGoalPressures = goalPressures.filter(
      (gp) => gp.goalTitle && !ORPHAN_TITLE_PATTERN.test(gp.goalTitle.trim())
    );

    const goalDTOs: GoalDTO[] = validGoalPressures.map((gp) => {
      const pressureDTO: GoalPressureDTO = Object.freeze({
        goalId: gp.goalId,
        goalTitle: gp.goalTitle,
        pressureScore: gp.pressureScore,
        trend: gp.trend,
        factors: gp.factors,
        explanation: gp.explanation,
      });

      return Object.freeze({
        schemaVersion: 1,
        id: gp.goalId,
        title: gp.goalTitle,
        category: "General",
        pressure: pressureDTO,
        progressPercentage: 0,
        status: "in_progress",
      });
    });

    return Object.freeze(goalDTOs);
  }

  /**
   * Legacy Compatibility Projection
   */
  static toGoalPressureDTO(res: GoalPressureResult): GoalPressureDTO {
    return Object.freeze({
      goalId: res.goalId,
      goalTitle: res.goalTitle,
      pressureScore: res.pressureScore,
      trend: res.trend,
      factors: res.factors,
      explanation: res.explanation,
    });
  }

  static toGoalDTO(
    goalEntity: { id: string; title: string; category?: string; progress?: number; status?: string },
    pressure: GoalPressureDTO
  ): GoalDTO {
    return Object.freeze({
      schemaVersion: 1,
      id: goalEntity.id,
      title: goalEntity.title,
      category: goalEntity.category,
      pressure,
      progressPercentage: goalEntity.progress,
      status: goalEntity.status,
    });
  }
}
