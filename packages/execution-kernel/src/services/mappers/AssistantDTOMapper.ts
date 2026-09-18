import { KernelSnapshot } from "../../worldv2/KernelSnapshot";
import { ExecutionGraphSnapshot } from "../../kernel/ExecutionGraph";
import { AssistantContextDTO } from "../dto/AssistantContextDTO";
import { IKernelProjectionMapper } from "../../projections/IKernelProjectionMapper";

/**
 * AssistantDTOMapper Projection Mapper (Phase C6 Baseline)
 *
 * SOLE CONSTITUTIONAL PROJECTION LAYER for AssistantContextDTO.
 * Implements IKernelProjectionMapper<AssistantContextDTO>.
 *
 * CONSTITUTIONAL RULES:
 * - Reads ONLY from KernelSnapshot.
 * - NEVER calls LLMs, generates insights, computes recommendations, or ranks suggestions.
 * - NEVER mutates KernelSnapshot.
 * - Deeply freezes returned DTO.
 */
export class AssistantDTOMapper
  implements IKernelProjectionMapper<AssistantContextDTO>
{
  private static instance: AssistantDTOMapper;

  static getInstance(): AssistantDTOMapper {
    if (!AssistantDTOMapper.instance) {
      AssistantDTOMapper.instance = new AssistantDTOMapper();
    }
    return AssistantDTOMapper.instance;
  }

  /**
   * Canonical Implementation of IKernelProjectionMapper
   */
  project(
    snapshot: KernelSnapshot,
    _graphSnapshot?: ExecutionGraphSnapshot | null
  ): Readonly<AssistantContextDTO> {
    return AssistantDTOMapper.fromKernelSnapshot(snapshot);
  }

  /**
   * Pure Projection Mapper: KernelSnapshot ➔ AssistantContextDTO
   */
  static fromKernelSnapshot(
    snapshot: KernelSnapshot
  ): Readonly<AssistantContextDTO> {
    const { metadata, userId, telemetry, subsystems, diagnostics, executionGraphSummary } =
      snapshot;

    return Object.freeze({
      schemaVersion: 1,
      snapshotId: metadata.snapshotId,
      userId,
      generationTimestamp: metadata.generationTimestamp,
      telemetryQuality: telemetry.quality,
      lifeState: subsystems.lifeState,
      goalPressure: subsystems.goalPressure,
      learning: subsystems.learning,
      trends: subsystems.trends,
      predictions: subsystems.predictions,
      executionGraphSummary,
      diagnosticsSealed: diagnostics.isSealed,
    });
  }
}
