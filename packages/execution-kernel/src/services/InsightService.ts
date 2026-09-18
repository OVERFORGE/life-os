import { WorldModelV2 } from "../worldv2/WorldModelV2";
import { ExecutionGraph } from "../kernel/ExecutionGraph";
import { InsightDTO } from "./dto/InsightDTO";
import { InsightDTOMapper } from "./mappers/InsightDTOMapper";
import { TelemetryIngestionService } from "../telemetry/TelemetryIngestionService";

/**
 * InsightService Application Service (Phase C4 Baseline)
 * 
 * SOLE CONSTITUTIONAL OWNER of orchestrating InsightDTO delivery to clients.
 * 
 * CONSTITUTIONAL RULES:
 * - Reads ONLY via KernelSnapshot from WorldModelV2.
 * - Invokes InsightDTOMapper (IKernelProjectionMapper) for pure read-only projection.
 * - Computes ZERO business logic, scoring, ranking, or filtering algorithms.
 * - Operates as a pure, side-effect-free application orchestrator.
 */
export class InsightService {
  private static instance: InsightService;

  static getInstance(): InsightService {
    if (!InsightService.instance) {
      InsightService.instance = new InsightService();
    }
    return InsightService.instance;
  }

  async getInsights(userId: string): Promise<Readonly<InsightDTO[]>> {
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

    // 4. Pure Read-Only Projection via InsightDTOMapper (IKernelProjectionMapper)
    return InsightDTOMapper.getInstance().project(kernelSnapshot);
  }
}
