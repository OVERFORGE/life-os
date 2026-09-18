import { WorldModelV2 } from "../worldv2/WorldModelV2";
import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { DashboardDTO } from "./dto/DashboardDTO";
import { DashboardDTOMapper } from "./mappers/DashboardDTOMapper";
import { TelemetryIngestionService } from "../telemetry/TelemetryIngestionService";

/**
 * DashboardService Application Service (Phase C1 Baseline)
 * 
 * SOLE CONSTITUTIONAL OWNER of orchestrating DashboardDTO delivery to clients.
 * 
 * CONSTITUTIONAL RULES (Chapter 6 & Phase C):
 * - Reads ONLY via KernelSnapshot from WorldModelV2.
 * - Invokes DashboardDTOMapper (IKernelProjectionMapper) for pure read-only projection.
 * - Computes ZERO business logic, scoring, or heuristics.
 * - Operates as a pure, side-effect-free application orchestrator.
 */
export class DashboardService {
  private static instance: DashboardService;

  static getInstance(): DashboardService {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
    }
    return DashboardService.instance;
  }

  async getDashboard(userId: string): Promise<Readonly<DashboardDTO>> {
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

    // 4. Pure Read-Only Projection via DashboardDTOMapper (IKernelProjectionMapper)
    return DashboardDTOMapper.getInstance().project(kernelSnapshot, graphSnapshot);
  }
}
