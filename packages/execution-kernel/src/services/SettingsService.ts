import { WorldModelV2 } from "../worldv2/WorldModelV2";
import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { SettingsDTO } from "./dto/SettingsDTO";
import { SettingsDTOMapper } from "./mappers/SettingsDTOMapper";
import { TelemetryIngestionService } from "../telemetry/TelemetryIngestionService";

/**
 * SettingsService Application Service (Phase C5 Baseline)
 * 
 * SOLE CONSTITUTIONAL OWNER of orchestrating SettingsDTO delivery to clients.
 * 
 * CONSTITUTIONAL RULES:
 * - Reads ONLY via KernelSnapshot from WorldModelV2.
 * - Invokes SettingsDTOMapper (IKernelProjectionMapper) for pure read-only projection.
 * - Computes ZERO business logic, heuristics, or setting mutations.
 * - Operates as a pure, side-effect-free application orchestrator.
 */
export class SettingsService {
  private static instance: SettingsService;

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  async getSettings(userId: string): Promise<Readonly<SettingsDTO>> {
    // 1. Build DAG Execution Graph Snapshot
    const graph = await ExecutionGraph.buildFromDatabase(userId);
    const graphSnapshot = graph.createSnapshot();

    // 2. Ingest Telemetry Payload & Quality Metadata
    const telemetryPayload = await TelemetryIngestionService.getInstance().ingestTelemetry(userId);

    // 3. Compute Canonical Immutable KernelSnapshot via WorldModelV2 Orchestrator
    const kernelSnapshot = WorldModelV2.getInstance().computeKernelSnapshot({
      userId,
      generationTimestamp: telemetryPayload.generationTimestamp,
      quality: telemetryPayload.telemetryQuality,
      observations: telemetryPayload.observations,
      graphSnapshot,
    });

    // 4. Pure Read-Only Projection via SettingsDTOMapper (IKernelProjectionMapper)
    return SettingsDTOMapper.getInstance().project(kernelSnapshot);
  }
}
